import type { Address } from "viem";
import type {
  EscrowPaymentPayload,
  EscrowPaymentRequired,
  SellerReputationInfo,
} from "../../shared/types.js";
import { computeFee } from "../../shared/fees.js";
import { executeHooks, type HookContext } from "../hooks.js";
import type { PaymentContext, PaymentDeps, PaymentResult } from "./types.js";

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Framework-independent escrow payment processing.
 *
 * Handles the full x402 lifecycle:
 * 1. Idempotency check (already escrowed → return existing details)
 * 2. No payment header → 402 with PAYMENT-REQUIRED (includes reputation-based param adjustment)
 * 3. With payment header → verify → claim → settle → 200 with PAYMENT-RESPONSE
 *
 * All external dependencies (DB, settlement, reputation, config) are injected via `deps`.
 */
export async function processEscrowPayment(
  ctx: PaymentContext,
  deps: PaymentDeps
): Promise<PaymentResult> {
  const log = deps.logger ?? noopLogger;
  const orderId = ctx.params.id;

  if (!orderId) {
    return { status: 400, body: { error: "Order ID is required" }, headers: {}, handled: true };
  }

  const order = deps.getOrderById(orderId);
  if (!order) {
    return { status: 404, body: { error: "Order not found" }, headers: {}, handled: true };
  }

  // ── Idempotency: already escrowed ──
  if (order.status === "escrowed" || order.status === "delivery_confirmed" || order.status === "completed") {
    const paymentResponse = {
      success: true,
      txHash: order.txHash!,
      escrowId: order.escrowId!,
    };
    const encoded = toBase64(paymentResponse);
    return {
      status: 200,
      body: undefined, // adapter fills in the response body
      headers: { "PAYMENT-RESPONSE": encoded, "X-PAYMENT-RESPONSE": encoded },
      handled: false,
      payment: paymentResponse,
      order,
    };
  }

  // ── Non-payable state ──
  if (order.status !== "created" && order.status !== "pending_payment") {
    return {
      status: 400,
      body: { error: `Order is not in a payable state (current: ${order.status})` },
      headers: {},
      handled: true,
    };
  }

  // ── Read payment header ──
  const paymentHeader =
    ctx.getHeader("payment-signature") ?? ctx.getHeader("x-payment");

  // ── No payment header → 402 ──
  if (!paymentHeader) {
    // Hook: beforePaymentRequired
    const hookCtx: HookContext = {
      hookPoint: "beforePaymentRequired",
      order,
      sellerAddress: order.sellerAddress as Address,
      amount: order.price,
      serviceType: order.serviceType,
    };
    const hookResult = await executeHooks("beforePaymentRequired", hookCtx, log);
    if (!hookResult.ok) {
      return { status: 403, body: { error: hookResult.error }, headers: {}, handled: true };
    }
    return buildPaymentRequiredResponse(order, deps, log);
  }

  // ── Parse payment header ──
  let payload: EscrowPaymentPayload;
  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    payload = JSON.parse(decoded);
  } catch {
    return { status: 400, body: { error: "Invalid payment header" }, headers: {}, handled: true };
  }

  if (payload.scheme !== "escrow") {
    return {
      status: 400,
      body: { error: `Unsupported scheme: ${payload.scheme}` },
      headers: {},
      handled: true,
    };
  }

  // ── Verify ──
  const feeBps = deps.config.feeBps;
  const flatFee = deps.config.flatFee;
  const verifyFee = computeFee(BigInt(payload.value), feeBps, flatFee);

  const paymentRequired: EscrowPaymentRequired = {
    scheme: "escrow",
    network: deps.config.network ?? "base-sepolia",
    escrowContract: deps.config.escrowVaultAddress,
    asset: deps.config.usdcAddress,
    amount: payload.value,
    orderId: payload.orderId,
    sellerAddress: payload.sellerAddress,
    releaseWindow: payload.releaseWindow,
    serviceType: payload.serviceType,
    facilitatorFee: verifyFee.toString(),
    feeBps,
    flatFee: flatFee.toString(),
  };

  const verification = await deps.verify(payload, paymentRequired);
  if (!verification.valid) {
    return {
      status: 400,
      body: { error: "Payment verification failed", details: verification.error },
      headers: {},
      handled: true,
    };
  }

  // Hook: beforeSettlement
  {
    const hookCtx: HookContext = {
      hookPoint: "beforeSettlement",
      order,
      buyerAddress: payload.from as Address,
      sellerAddress: order.sellerAddress as Address,
      amount: order.price,
      serviceType: order.serviceType,
      payload,
      requirement: paymentRequired,
    };
    const hookResult = await executeHooks("beforeSettlement", hookCtx, log);
    if (!hookResult.ok) {
      return { status: 403, body: { error: hookResult.error }, headers: {}, handled: true };
    }
  }

  // ── Claim order atomically ──
  const claimed = deps.claimOrder(order.id);
  if (!claimed) {
    return {
      status: 409,
      body: { error: "Payment already in progress or completed" },
      headers: {},
      handled: true,
    };
  }

  // ── Settle on-chain ──
  try {
    const settleResult = await deps.settle(payload, paymentRequired);
    const txHash = settleResult.txHash as `0x${string}`;
    const escrowId = settleResult.escrowId;

    deps.updateOrderStatus(order.id, {
      status: "escrowed",
      buyerAddress: payload.from,
      escrowId,
      txHash,
    });

    const paymentResponse = { success: true, txHash, escrowId };
    const encoded = toBase64(paymentResponse);

    // Re-fetch updated order
    const updatedOrder = deps.getOrderById(order.id);

    // Hook: afterSettlement (non-blocking)
    executeHooks("afterSettlement", {
      hookPoint: "afterSettlement",
      order: updatedOrder ?? order,
      buyerAddress: payload.from as Address,
      sellerAddress: order.sellerAddress as Address,
      amount: order.price,
      serviceType: order.serviceType,
      payload,
      requirement: paymentRequired,
      escrowId,
      txHash,
    }, log).catch(() => {}); // fire and forget

    // Non-blocking buyer reputation logging
    if (deps.computeReputation) {
      deps.computeReputation(payload.from as Address)
        .then((buyerRep) => {
          if (buyerRep.buyer && buyerRep.buyer.score < 20 && buyerRep.confidence !== "low") {
            log.warn("reputation", `Low-reputation buyer ${payload.from}`, {
              score: buyerRep.buyer.score,
              disputeRate: buyerRep.buyer.disputeRate,
            });
          }
        })
        .catch((err: unknown) => {
          log.debug("reputation", `Buyer reputation lookup failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    return {
      status: 200,
      body: undefined,
      headers: { "PAYMENT-RESPONSE": encoded, "X-PAYMENT-RESPONSE": encoded },
      handled: false,
      payment: paymentResponse,
      order: updatedOrder,
    };
  } catch (err) {
    log.error("payment", `Settlement failed for order ${order.id}: ${(err as Error).message}`);
    deps.revertOrderClaim(order.id);
    return {
      status: 500,
      body: { error: "Payment settlement failed" },
      headers: {},
      handled: true,
    };
  }
}

// ──────────── Helpers ────────────

async function buildPaymentRequiredResponse(
  order: { id: string; price: bigint; orderId: `0x${string}`; sellerAddress: Address; serviceType: string },
  deps: PaymentDeps,
  log: PaymentDeps["logger"] & object
): Promise<PaymentResult> {
  const serviceType = deps.getServiceType(order.serviceType);
  if (!serviceType) {
    return {
      status: 400,
      body: { error: `Unknown service type: ${order.serviceType}` },
      headers: {},
      handled: true,
    };
  }

  // Reputation-based dynamic escrow parameters
  let releaseWindow = serviceType.releaseWindow;
  let sellerReputation: SellerReputationInfo | undefined;

  if (serviceType.adjustParams && deps.computeReputation) {
    try {
      const sellerRep = await deps.computeReputation(order.sellerAddress as Address);
      if (sellerRep.seller) {
        sellerReputation = {
          score: sellerRep.seller.score,
          confidence: sellerRep.confidence,
          disputeRate: sellerRep.seller.disputeRate,
        };
      }
      const adjusted = serviceType.adjustParams(
        { releaseWindow },
        {
          buyerScore: 50, // buyer unknown at 402 time
          sellerScore: sellerRep.seller?.score ?? 50,
          buyerConfidence: "low",
          sellerConfidence: sellerRep.confidence,
        }
      );
      releaseWindow = adjusted.releaseWindow;
    } catch {
      log.warn("payment", "Reputation lookup failed, using default params");
    }
  }

  const feeBps = deps.config.feeBps;
  const flatFee = deps.config.flatFee;
  const fee = computeFee(order.price, feeBps, flatFee);

  const paymentRequired: EscrowPaymentRequired = {
    scheme: "escrow",
    network: deps.config.network ?? "base-sepolia",
    escrowContract: deps.config.escrowVaultAddress,
    asset: deps.config.usdcAddress,
    amount: order.price.toString(),
    orderId: order.orderId,
    sellerAddress: order.sellerAddress,
    releaseWindow,
    serviceType: order.serviceType,
    facilitatorFee: fee.toString(),
    feeBps,
    flatFee: flatFee.toString(),
  };

  const paymentRequirements = [paymentRequired];
  const encodedArray = toBase64(paymentRequirements);
  const encodedSingle = toBase64(paymentRequired);

  return {
    status: 402,
    body: {
      error: "Payment required",
      paymentRequired,
      paymentRequirements,
      sellerReputation,
    },
    headers: {
      "PAYMENT-REQUIRED": encodedArray,
      "X-PAYMENT-REQUIRED": encodedSingle,
    },
    handled: true,
  };
}

function toBase64(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}
