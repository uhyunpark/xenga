import type { WalletClient, Address, Hash } from "viem";
import type {
  EscrowPaymentRequired,
  EscrowPaymentResponse,
  SellerReputationInfo,
} from "../shared/types.js";
import {
  NetworkError,
  InvalidPaymentHeaderError,
  UnsupportedSchemeError,
  ReputationAbortError,
} from "../shared/errors.js";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import { signEscrowPayment } from "./escrowScheme.js";

// Universal base64 helpers (works in Node.js, browsers, and Bun)
function encodeBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Runtime validation of EscrowPaymentRequired shape */
function isEscrowPaymentRequired(obj: unknown): obj is EscrowPaymentRequired {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.scheme === "escrow" &&
    typeof o.network === "string" &&
    typeof o.escrowContract === "string" &&
    typeof o.asset === "string" &&
    typeof o.amount === "string" &&
    typeof o.orderId === "string" &&
    typeof o.sellerAddress === "string" &&
    typeof o.releaseWindow === "number" &&
    typeof o.serviceType === "string"
  );
}

/** Unwrap x402 envelope or legacy format to EscrowPaymentRequired */
function unwrapPaymentRequired(decoded: unknown): EscrowPaymentRequired | undefined {
  if (typeof decoded !== "object" || decoded === null) return undefined;

  const obj = decoded as Record<string, unknown>;

  // x402 format: { x402Version, accepts: [...] }
  if (obj.x402Version && Array.isArray(obj.accepts)) {
    const escrowOption = (obj.accepts as Array<Record<string, unknown>>)
      .find((opt) => opt.scheme === "escrow");
    if (!escrowOption) return undefined;

    const extra = (escrowOption.extra ?? {}) as Record<string, unknown>;
    return {
      scheme: "escrow",
      network: String(escrowOption.network),
      escrowContract: String(escrowOption.payTo) as Address,
      asset: String(escrowOption.asset) as Address,
      amount: String(escrowOption.maxAmountRequired),
      orderId: String(extra.orderId) as Hash,
      sellerAddress: String(extra.sellerAddress) as Address,
      releaseWindow: Number(extra.releaseWindow),
      serviceType: String(extra.serviceType),
      facilitatorFee: extra.facilitatorFee as string | undefined,
    };
  }

  // Array format: find escrow scheme
  if (Array.isArray(decoded)) {
    return decoded.find((r: { scheme?: string }) => r.scheme === "escrow");
  }

  // Single object (legacy)
  return decoded as EscrowPaymentRequired;
}

export interface EscrowFetchOptions {
  walletClient: WalletClient;
  usdcAddress?: Address;
  /** Called with seller reputation from 402 response. Return false to abort payment. */
  onSellerReputation?: (reputation: SellerReputationInfo) => boolean;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Retry options for the payment submission step (default: 3 retries with backoff) */
  retryOptions?: RetryOptions;
}

/**
 * Fetch wrapper that handles xenga escrow payment flow automatically
 *
 * 1. Sends request to the server
 * 2. If 402 response → signs ERC-3009 authorization
 * 3. Retries with PAYMENT-SIGNATURE header
 * 4. Returns final response with escrow details
 *
 * Supports both xenga standard headers and legacy X-PAYMENT headers.
 */
export async function escrowFetch(
  url: string,
  init: RequestInit | undefined,
  options: EscrowFetchOptions
): Promise<{
  response: Response;
  payment?: EscrowPaymentResponse;
}> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  // First request
  let firstResponse: Response;
  try {
    firstResponse = await fetchWithTimeout(url, init, timeoutMs);
  } catch (err) {
    throw new NetworkError(
      `Failed to reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }

  // If not 402, return as-is
  if (firstResponse.status !== 402) {
    return { response: firstResponse };
  }

  // Parse 402 payment requirements (prefer standard header, fallback to legacy)
  const paymentRequiredHeader =
    firstResponse.headers.get("payment-required") ??
    firstResponse.headers.get("x-payment-required");
  let paymentRequired: EscrowPaymentRequired;

  if (paymentRequiredHeader) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(decodeBase64(paymentRequiredHeader));
    } catch {
      throw new InvalidPaymentHeaderError(
        "Failed to decode PAYMENT-REQUIRED header: invalid base64 or JSON"
      );
    }
    // Handle x402 envelope, array format, or single object (legacy)
    const candidate = unwrapPaymentRequired(decoded);

    if (!isEscrowPaymentRequired(candidate)) {
      throw new InvalidPaymentHeaderError(
        "PAYMENT-REQUIRED header is missing required fields (scheme, network, escrowContract, asset, amount, orderId, sellerAddress, releaseWindow, serviceType)"
      );
    }
    paymentRequired = candidate;
  } else {
    // Fallback: read from response body
    let body: {
      paymentRequired?: unknown;
      paymentRequirements?: unknown[];
    };
    try {
      body = (await firstResponse.clone().json()) as typeof body;
    } catch {
      throw new InvalidPaymentHeaderError(
        "402 response has no PAYMENT-REQUIRED header and body is not valid JSON"
      );
    }
    const candidate =
      (body.paymentRequirements as EscrowPaymentRequired[] | undefined)?.find(
        (r) => r.scheme === "escrow"
      ) ?? body.paymentRequired;

    if (!isEscrowPaymentRequired(candidate)) {
      throw new InvalidPaymentHeaderError(
        "No valid escrow payment requirement found in 402 response"
      );
    }
    paymentRequired = candidate;
  }

  if (paymentRequired.scheme !== "escrow") {
    throw new UnsupportedSchemeError(paymentRequired.scheme);
  }

  console.log(
    `[xenga] Payment required: ${paymentRequired.amount} USDC to escrow ${paymentRequired.escrowContract}`
  );

  // Check seller reputation if callback provided
  if (options.onSellerReputation) {
    try {
      const body = (await firstResponse.clone().json()) as {
        sellerReputation?: SellerReputationInfo;
      };
      if (body.sellerReputation) {
        const shouldProceed = options.onSellerReputation(body.sellerReputation);
        if (!shouldProceed) {
          throw new ReputationAbortError(body.sellerReputation.score);
        }
      }
    } catch (err) {
      if (err instanceof ReputationAbortError) throw err;
      // If body parsing fails, continue without reputation check
    }
  }

  // Sign the payment
  const payload = await signEscrowPayment(
    options.walletClient,
    paymentRequired,
    options.usdcAddress
  );

  console.log(`[xenga] Signed receiveWithAuthorization from ${payload.from}`);

  // Submit payment with retry (send both standard and legacy headers)
  const paymentHeader = encodeBase64(JSON.stringify(payload));

  const retryResponse = await withRetry(
    async () => {
      try {
        return await fetchWithTimeout(
          url,
          {
            ...init,
            headers: {
              ...((init?.headers as Record<string, string>) ?? {}),
              "PAYMENT-SIGNATURE": paymentHeader,
              "X-PAYMENT": paymentHeader,
              "Content-Type": "application/json",
            },
          },
          timeoutMs
        );
      } catch (err) {
        throw new NetworkError(
          `Failed to submit payment to ${url}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err : undefined
        );
      }
    },
    options.retryOptions
  );

  // Parse payment response (prefer standard, fallback to legacy)
  let payment: EscrowPaymentResponse | undefined;
  const paymentResponseHeader =
    retryResponse.headers.get("payment-response") ??
    retryResponse.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    try {
      const decoded = JSON.parse(decodeBase64(paymentResponseHeader)) as Record<string, unknown>;
      // Handle x402 format (transaction field) or Xenga format (txHash field)
      payment = {
        success: Boolean(decoded.success),
        txHash: (decoded.txHash ?? decoded.transaction) as Hash,
        escrowId: Number(decoded.escrowId),
      };
    } catch {
      // If payment response header is malformed, fall through to body parsing
    }
  }

  return { response: retryResponse, payment };
}

/** Fetch with AbortController-based timeout */
async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
