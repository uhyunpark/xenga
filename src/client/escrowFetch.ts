import type { WalletClient, Address } from "viem";
import type {
  EscrowPaymentRequired,
  EscrowPaymentResponse,
} from "../shared/types.js";
import { signEscrowPayment } from "./escrowScheme.js";

interface EscrowFetchOptions {
  walletClient: WalletClient;
  usdcAddress?: Address;
}

/**
 * Fetch wrapper that handles x402 escrow payment flow automatically
 *
 * 1. Sends request to the server
 * 2. If 402 response → signs ERC-3009 authorization
 * 3. Retries with PAYMENT-SIGNATURE header
 * 4. Returns final response with escrow details
 *
 * Supports both x402 standard headers and legacy X-PAYMENT headers.
 */
export async function escrowFetch(
  url: string,
  init: RequestInit | undefined,
  options: EscrowFetchOptions
): Promise<{
  response: Response;
  payment?: EscrowPaymentResponse;
}> {
  // First request
  const firstResponse = await fetch(url, init);

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
    const decoded = JSON.parse(
      Buffer.from(paymentRequiredHeader, "base64").toString("utf-8")
    );
    // Handle array format (x402 standard) or single object (legacy)
    paymentRequired = Array.isArray(decoded)
      ? decoded.find((r: { scheme: string }) => r.scheme === "escrow")
      : decoded;
  } else {
    // Fallback: read from response body
    const body = (await firstResponse.json()) as {
      paymentRequired?: EscrowPaymentRequired;
      paymentRequirements?: EscrowPaymentRequired[];
    };
    paymentRequired = body.paymentRequirements?.find(r => r.scheme === "escrow")
      ?? body.paymentRequired!;
  }

  if (!paymentRequired || paymentRequired.scheme !== "escrow") {
    throw new Error(
      `Unsupported payment scheme: ${paymentRequired?.scheme ?? "unknown"}`
    );
  }

  console.log(
    `[x402] Payment required: ${paymentRequired.amount} USDC to escrow ${paymentRequired.escrowContract}`
  );

  // Sign the payment
  const payload = await signEscrowPayment(
    options.walletClient,
    paymentRequired,
    options.usdcAddress
  );

  console.log(`[x402] Signed receiveWithAuthorization from ${payload.from}`);

  // Retry with payment (send both standard and legacy headers)
  const paymentHeader = Buffer.from(JSON.stringify(payload)).toString(
    "base64"
  );

  const retryResponse = await fetch(url, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string>) ?? {}),
      "PAYMENT-SIGNATURE": paymentHeader,
      "X-PAYMENT": paymentHeader,
      "Content-Type": "application/json",
    },
  });

  // Parse payment response (prefer standard, fallback to legacy)
  let payment: EscrowPaymentResponse | undefined;
  const paymentResponseHeader =
    retryResponse.headers.get("payment-response") ??
    retryResponse.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    payment = JSON.parse(
      Buffer.from(paymentResponseHeader, "base64").toString("utf-8")
    );
  }

  return { response: retryResponse, payment };
}
