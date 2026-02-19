import { processEscrowPayment } from "./paymentCore.js";
import type { PaymentDeps, PaymentResult } from "./types.js";
import { USDC_DECIMALS } from "../../shared/constants.js";

/**
 * Next.js Route Handler adapter for x402 escrow payment.
 *
 * Converts a Web `Request` + route params into a `PaymentContext`,
 * delegates to the framework-independent `processEscrowPayment()` core,
 * and returns a `Response` (or a structured result for further processing).
 *
 * @example
 * ```ts
 * // app/api/orders/[id]/pay/route.ts
 * import { handleEscrowPayment, toNextResponse } from "@x402/server/nextjs";
 *
 * export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 *   const { id } = await params;
 *   const result = await handleEscrowPayment(request, { id }, deps);
 *   return toNextResponse(result);
 * }
 * ```
 */
export async function handleEscrowPayment(
  request: Request,
  routeParams: Record<string, string>,
  deps: PaymentDeps
): Promise<PaymentResult> {
  return processEscrowPayment(
    {
      getHeader: (name) => request.headers.get(name.toLowerCase()) ?? undefined,
      params: routeParams,
    },
    deps
  );
}

/**
 * Convert a PaymentResult into a standard Web `Response`.
 *
 * For `handled: true` results, returns the error/402 response directly.
 * For `handled: false` (payment accepted), builds a success response with the order and payment info.
 */
export function toNextResponse(result: PaymentResult): Response {
  const headers = new Headers(result.headers);
  headers.set("Content-Type", "application/json");

  if (result.handled) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers,
    });
  }

  // Payment accepted — build success response
  const order = result.order;
  const body = {
    message: "Payment successful — funds are now in escrow",
    order: order
      ? {
          ...order,
          price: order.price.toString(),
          priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
        }
      : undefined,
    payment: result.payment,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers,
  });
}
