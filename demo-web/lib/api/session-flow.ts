import type { WalletClient, Address, Hash } from "viem";
import { keccak256, toHex } from "viem";
import type { InspectorEvent } from "@/lib/protocol-inspector/context";

export interface SessionRequired {
  scheme: string;
  network: string;
  sessionContract: Address;
  asset: Address;
  maxAmount: string;
  sellerAddress: Address;
  duration: number;
  pricePerUse: string;
}

export interface SessionPayload {
  scheme: string;
  network: string;
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hash;
  signature: { v: number; r: Hash; s: Hash };
  sellerAddress: Address;
  duration: number;
}

export interface SessionResponse {
  success: boolean;
  txHash: Hash;
  sessionId: number;
  expiresAt: number;
  deposit: string;
  pricePerUse: string;
}

export interface UseSessionResponse {
  message: string;
  timestamp: number;
  data: { result: string; priceCharged: string };
  balance: { used: string; remaining: string };
}

export interface SettleResponse {
  success: boolean;
  sessionId: number;
  settled: {
    totalCalls: number;
    captured: string;
    refunded: string;
    deposit: string;
  };
}

type EventEmitter = (event: Omit<InspectorEvent, "id" | "timestamp">) => void;

/**
 * Step 1: Request session — POST without payment header, expects 402
 */
export async function requestSession(
  emit?: EventEmitter
): Promise<{ sessionRequired: SessionRequired; rawHeader: string }> {
  emit?.({
    type: "http_request",
    label: "Session Request (no payment)",
    data: {
      method: "POST",
      url: "/api/sessions/create",
      headers: { "Content-Type": "application/json" },
    },
  });

  const res = await fetch("/api/sessions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const rawHeader =
    res.headers.get("PAYMENT-REQUIRED") ||
    res.headers.get("X-PAYMENT-REQUIRED") ||
    "";

  if (res.status === 402 && rawHeader) {
    const decoded = JSON.parse(atob(rawHeader));
    const sessionRequired: SessionRequired = Array.isArray(decoded)
      ? decoded.find((r: { scheme: string }) => r.scheme === "session-escrow")
      : decoded;

    emit?.({
      type: "http_response",
      label: "402 Session Payment Required",
      data: {
        status: 402,
        headers: { "PAYMENT-REQUIRED": rawHeader },
        decoded: sessionRequired,
      },
    });

    return { sessionRequired, rawHeader };
  }

  const error = await res.json().catch(() => ({ error: "Unknown error" }));
  throw new Error(error.error || `Unexpected status ${res.status}`);
}

/**
 * Step 2: Sign EIP-712 ReceiveWithAuthorization for session deposit
 */
export async function signSession(
  walletClient: WalletClient,
  sessionRequired: SessionRequired,
  emit?: EventEmitter
): Promise<SessionPayload> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient must have an account");

  const nonce = keccak256(
    toHex(`session-${account.address}-${crypto.randomUUID()}`)
  ) as Hash;

  const validAfter = BigInt(0);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 86400);

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: BigInt(84532),
    verifyingContract: sessionRequired.asset,
  };

  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const message = {
    from: account.address,
    to: sessionRequired.sessionContract,
    value: BigInt(sessionRequired.maxAmount),
    validAfter,
    validBefore,
    nonce,
  };

  emit?.({
    type: "eip712_sign",
    label: "EIP-712 Session Authorization",
    data: {
      domain: { ...domain, chainId: Number(domain.chainId) },
      primaryType: "ReceiveWithAuthorization",
      types: types.ReceiveWithAuthorization,
      message: {
        ...message,
        value: sessionRequired.maxAmount,
        validAfter: "0",
        validBefore: validBefore.toString(),
      },
    },
  });

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: "ReceiveWithAuthorization",
    message,
  });

  const r = `0x${signature.slice(2, 66)}` as Hash;
  const s = `0x${signature.slice(66, 130)}` as Hash;
  const v = parseInt(signature.slice(130, 132), 16);

  const payload: SessionPayload = {
    scheme: "session-escrow",
    network: sessionRequired.network,
    from: account.address,
    to: sessionRequired.sessionContract,
    value: sessionRequired.maxAmount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature: { v, r, s },
    sellerAddress: sessionRequired.sellerAddress,
    duration: sessionRequired.duration,
  };

  emit?.({
    type: "signature_result",
    label: "Session Signature Complete",
    data: { v, r, s, from: account.address },
  });

  return payload;
}

/**
 * Step 3: Submit session creation with signed payload
 */
export async function submitSession(
  payload: SessionPayload,
  emit?: EventEmitter
): Promise<SessionResponse> {
  const encoded = btoa(JSON.stringify(payload));

  emit?.({
    type: "http_request",
    label: "Session Creation Submission",
    data: {
      method: "POST",
      url: "/api/sessions/create",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": encoded,
      },
    },
  });

  const res = await fetch("/api/sessions/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": encoded,
      "X-PAYMENT": encoded,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    emit?.({
      type: "http_response",
      label: `Error ${res.status}`,
      data: { status: res.status, body: data },
    });
    throw new Error(data.error || "Session creation failed");
  }

  emit?.({
    type: "http_response",
    label: "200 Session Created",
    data: { status: 200, body: data },
  });

  emit?.({
    type: "tx_confirmed",
    label: "Session Deposit",
    data: {
      txHash: data.txHash,
      sessionId: data.sessionId,
      function: "createSessionWithAuth",
    },
  });

  emit?.({
    type: "state_change",
    label: "Session Active",
    data: { previousState: "None", newState: "Active" },
  });

  return data;
}

/**
 * Step 4: Use session — send API request with session ID
 */
export async function useSession(
  sessionId: number,
  emit?: EventEmitter
): Promise<UseSessionResponse> {
  emit?.({
    type: "http_request",
    label: `API Call (session #${sessionId})`,
    data: {
      method: "POST",
      url: `/api/sessions/${sessionId}/use`,
      headers: { "Content-Type": "application/json" },
      note: "No signature needed — session ID is the auth token",
    },
  });

  const res = await fetch(`/api/sessions/${sessionId}/use`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  if (!res.ok) {
    emit?.({
      type: "http_response",
      label: `Error ${res.status}`,
      data: { status: res.status, body: data },
    });
    throw new Error(data.error || "API call failed");
  }

  const balanceHeader = res.headers.get("X-SESSION-BALANCE");
  const usedHeader = res.headers.get("X-SESSION-USED");

  emit?.({
    type: "http_response",
    label: "200 API Response",
    data: {
      status: 200,
      headers: {
        "X-SESSION-BALANCE": balanceHeader,
        "X-SESSION-USED": usedHeader,
      },
      body: data,
    },
  });

  return data;
}

/**
 * Step 5: Close session — trigger batch settlement
 */
export async function closeSession(
  sessionId: number,
  emit?: EventEmitter
): Promise<SettleResponse> {
  emit?.({
    type: "http_request",
    label: "Session Settlement",
    data: {
      method: "POST",
      url: `/api/sessions/${sessionId}/settle`,
    },
  });

  const res = await fetch(`/api/sessions/${sessionId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  if (!res.ok) {
    emit?.({
      type: "http_response",
      label: `Error ${res.status}`,
      data: { status: res.status, body: data },
    });
    throw new Error(data.error || "Settlement failed");
  }

  emit?.({
    type: "http_response",
    label: "200 Session Settled",
    data: { status: 200, body: data },
  });

  emit?.({
    type: "state_change",
    label: "Session Settled",
    data: {
      previousState: "Active",
      newState: "Settled",
      captured: data.settled.captured,
      refunded: data.settled.refunded,
    },
  });

  return data;
}
