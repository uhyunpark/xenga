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
 * 3. Retries with X-PAYMENT header
 * 4. Returns final response with escrow details
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

  // Parse 402 payment requirements
  const paymentRequiredHeader =
    firstResponse.headers.get("x-payment-required");
  let paymentRequired: EscrowPaymentRequired;

  if (paymentRequiredHeader) {
    paymentRequired = JSON.parse(
      Buffer.from(paymentRequiredHeader, "base64").toString("utf-8")
    );
  } else {
    // Fallback: read from response body
    const body = (await firstResponse.json()) as { paymentRequired: EscrowPaymentRequired };
    paymentRequired = body.paymentRequired;
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

  // Retry with payment
  const paymentHeader = Buffer.from(JSON.stringify(payload)).toString(
    "base64"
  );

  const retryResponse = await fetch(url, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string>) ?? {}),
      "X-PAYMENT": paymentHeader,
      "Content-Type": "application/json",
    },
  });

  // Parse payment response
  let payment: EscrowPaymentResponse | undefined;
  const paymentResponseHeader =
    retryResponse.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    payment = JSON.parse(
      Buffer.from(paymentResponseHeader, "base64").toString("utf-8")
    );
  }

  return { response: retryResponse, payment };
}
