import type { WalletClient, Address, Hash } from "viem";
import { keccak256, toHex } from "viem";
import type { InspectorEvent } from "@/lib/protocol-inspector/context";
import { buildReceiveAuthSigningParams } from "@shared/eip712.js";
import { networkToChainId } from "@shared/constants.js";
import { facilitatorUrl } from "./client";

export interface PaymentRequired {
  scheme: string;
  network: string;
  escrowContract: Address;
  asset: Address;
  amount: string;
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
  facilitatorFee?: string;
  feeBps?: number;
  flatFee?: string;
}

export interface PaymentPayload {
  scheme: string;
  network: string;
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hash;
  signature: { v: number; r: Hash; s: Hash };
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
}

export interface PaymentResponse {
  success: boolean;
  txHash: Hash;
  escrowId: number;
  contentHash?: Hash;
}

type EventEmitter = (event: Omit<InspectorEvent, "id" | "timestamp">) => void;

/**
 * Step 1: Request payment — sends POST without payment header, expects 402
 *
 * Reads both standard (PAYMENT-REQUIRED) and legacy (X-PAYMENT-REQUIRED) headers.
 */
export async function requestPayment(
  orderId: string,
  emit?: EventEmitter
): Promise<{ paymentRequired: PaymentRequired; rawHeader: string }> {
  emit?.({
    type: "http_request",
    label: "Initial Request (no payment)",
    data: {
      method: "POST",
      url: facilitatorUrl(`/api/orders/${orderId}/pay`),
      headers: { "Content-Type": "application/json" },
    },
  });

  const res = await fetch(facilitatorUrl(`/api/orders/${orderId}/pay`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  // Prefer standard header, fallback to legacy
  const rawHeader =
    res.headers.get("PAYMENT-REQUIRED") ||
    res.headers.get("X-PAYMENT-REQUIRED") ||
    "";

  if (res.status === 402 && rawHeader) {
    const decoded = JSON.parse(atob(rawHeader));
    // Handle x402 envelope, array format, or single object (legacy)
    let paymentRequired: PaymentRequired;
    if (decoded.x402Version && Array.isArray(decoded.accepts)) {
      // x402 envelope
      const opt = decoded.accepts.find((o: any) => o.scheme === "escrow");
      const extra = opt?.extra ?? {};
      paymentRequired = {
        scheme: "escrow",
        network: opt.network,
        escrowContract: opt.payTo,
        asset: opt.asset,
        amount: opt.maxAmountRequired,
        orderId: extra.orderId,
        sellerAddress: extra.sellerAddress,
        releaseWindow: extra.releaseWindow,
        serviceType: extra.serviceType,
        facilitatorFee: extra.facilitatorFee,
        feeBps: extra.feeBps,
        flatFee: extra.flatFee,
      };
    } else {
      // Legacy format (array or single object)
      paymentRequired = Array.isArray(decoded)
        ? decoded.find((r: { scheme: string }) => r.scheme === "escrow")
        : decoded;
    }

    emit?.({
      type: "http_response",
      label: "402 Payment Required",
      data: {
        status: 402,
        headers: { "PAYMENT-REQUIRED": rawHeader },
        decoded: paymentRequired,
      },
    });

    return { paymentRequired, rawHeader };
  }

  // Already paid or error
  if (res.ok) {
    const data = await res.json();
    const paymentResponseHeader =
      res.headers.get("PAYMENT-RESPONSE") ||
      res.headers.get("X-PAYMENT-RESPONSE");
    if (paymentResponseHeader) {
      emit?.({
        type: "http_response",
        label: "200 Already Paid",
        data: {
          status: 200,
          headers: { "PAYMENT-RESPONSE": paymentResponseHeader },
          body: data,
        },
      });
    }
    throw new AlreadyPaidError(data);
  }

  const error = await res.json().catch(() => ({ error: "Unknown error" }));
  throw new Error(error.error || `Unexpected status ${res.status}`);
}

/**
 * Step 2: Sign the EIP-712 ReceiveWithAuthorization
 */
export async function signPayment(
  walletClient: WalletClient,
  paymentRequired: PaymentRequired,
  emit?: EventEmitter
): Promise<PaymentPayload> {
  const account = walletClient.account;
  if (!account) throw new Error("WalletClient must have an account");

  const nonce = keccak256(
    toHex(
      `${account.address}-${paymentRequired.orderId}-${crypto.randomUUID()}`
    )
  ) as Hash;

  const signingParams = buildReceiveAuthSigningParams({
    from: account.address,
    to: paymentRequired.escrowContract,
    amount: BigInt(paymentRequired.amount),
    nonce,
    usdcAddress: paymentRequired.asset,
    chainId: networkToChainId(paymentRequired.network),
  });

  emit?.({
    type: "eip712_sign",
    label: "EIP-712 Sign Request",
    data: {
      domain: {
        ...signingParams.domain,
        chainId: Number(signingParams.domain.chainId),
      },
      primaryType: signingParams.primaryType,
      types: signingParams.types.ReceiveWithAuthorization,
      message: {
        ...signingParams.message,
        value: paymentRequired.amount,
        validAfter: signingParams.validAfter.toString(),
        validBefore: signingParams.validBefore.toString(),
      },
    },
  });

  const signature = await walletClient.signTypedData({
    account,
    domain: signingParams.domain,
    types: signingParams.types,
    primaryType: signingParams.primaryType,
    message: signingParams.message,
  });

  // Parse signature into v, r, s
  if (!signature || signature.length < 132) {
    throw new Error("Invalid signature length");
  }
  const r = `0x${signature.slice(2, 66)}` as Hash;
  const s = `0x${signature.slice(66, 130)}` as Hash;
  const v = parseInt(signature.slice(130, 132), 16);

  const payload: PaymentPayload = {
    scheme: "escrow",
    network: paymentRequired.network,
    from: account.address,
    to: paymentRequired.escrowContract,
    value: paymentRequired.amount,
    validAfter: signingParams.validAfter.toString(),
    validBefore: signingParams.validBefore.toString(),
    nonce,
    signature: { v, r, s },
    orderId: paymentRequired.orderId,
    sellerAddress: paymentRequired.sellerAddress,
    releaseWindow: paymentRequired.releaseWindow,
    serviceType: paymentRequired.serviceType,
  };

  emit?.({
    type: "signature_result",
    label: "Signature Complete",
    data: { v, r, s, from: account.address },
  });

  return payload;
}

/**
 * Step 3: Submit payment — retries with PAYMENT-SIGNATURE header
 *
 * Sends both standard and legacy headers for backward compatibility.
 */
export async function submitPayment(
  orderId: string,
  payload: PaymentPayload,
  emit?: EventEmitter
): Promise<{ order: any; payment: PaymentResponse }> {
  const encoded = btoa(JSON.stringify(payload));

  emit?.({
    type: "http_request",
    label: "Payment Submission",
    data: {
      method: "POST",
      url: facilitatorUrl(`/api/orders/${orderId}/pay`),
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": encoded,
      },
    },
  });

  const res = await fetch(facilitatorUrl(`/api/orders/${orderId}/pay`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": encoded,
      "X-PAYMENT": encoded,
    },
  });

  const data = await res.json();
  const paymentResponseHeader =
    res.headers.get("PAYMENT-RESPONSE") ||
    res.headers.get("X-PAYMENT-RESPONSE");

  if (!res.ok) {
    emit?.({
      type: "http_response",
      label: `Error ${res.status}`,
      data: { status: res.status, body: data },
    });
    throw new Error(data.error || "Payment submission failed");
  }

  let paymentResponse: PaymentResponse | undefined;
  if (paymentResponseHeader) {
    const raw = JSON.parse(atob(paymentResponseHeader));
    // Handle x402 format (transaction field) or Xenga format (txHash field)
    paymentResponse = {
      success: Boolean(raw.success),
      txHash: raw.txHash ?? raw.transaction,
      escrowId: Number(raw.escrowId),
      contentHash: raw.contentHash,
    };
  }

  emit?.({
    type: "http_response",
    label: "200 Payment Accepted",
    data: {
      status: 200,
      headers: paymentResponseHeader
        ? { "PAYMENT-RESPONSE": paymentResponseHeader }
        : {},
      decoded: paymentResponse,
      body: data,
    },
  });

  if (paymentResponse) {
    emit?.({
      type: "tx_confirmed",
      label: "Escrow Created",
      data: {
        txHash: paymentResponse.txHash,
        escrowId: paymentResponse.escrowId,
        contentHash: paymentResponse.contentHash,
        function: "createEscrowWithAuth",
      },
    });

    emit?.({
      type: "state_change",
      label: "Escrow Active",
      data: { previousState: "None", newState: "Active" },
    });
  }

  return {
    order: data.order,
    payment: paymentResponse || data.payment,
  };
}

export class AlreadyPaidError extends Error {
  data: any;
  constructor(data: any) {
    super("Order already paid");
    this.data = data;
  }
}
