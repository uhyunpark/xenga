import { type Address, type Hash, keccak256, toBytes } from "viem";
import type {
  EscrowPaymentPayload,
  EscrowPaymentRequired,
  SellerReputationInfo,
  X402PaymentOption,
  X402PaymentPayload,
  X402PaymentRequirements,
  X402SettlementResponse,
} from "../../shared/types.js";
import { computeFee } from "../../shared/fees.js";
import { getChainConfig, networkToChainId } from "../../shared/constants.js";
import { executeHooks, type HookContext } from "../hooks.js";
import type { PaymentContext, PaymentDeps, PaymentResult } from "./types.js";

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Detect x402 vs Xenga payload format and normalize to internal EscrowPaymentPayload.
 * x402 format: { x402Version, scheme, network, payload: { signature, authorization } }
 * Xenga format: { scheme, network, from, to, value, signature: { v, r, s }, ... }
 */
function normalizePaymentPayload(raw: unknown): EscrowPaymentPayload {
  const obj = raw as Record<string, unknown>;

  // Detect x402 format
  if (
    obj.x402Version &&
    obj.payload &&
    typeof obj.payload === "object" &&
    (obj.payload as Record<string, unknown>).authorization
  ) {
    const x402 = raw as X402PaymentPayload;
    const { authorization, signature } = x402.payload;

    // Convert hex signature to v, r, s components
    const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature;
    const r = `0x${sigHex.slice(0, 64)}` as Hash;
    const s = `0x${sigHex.slice(64, 128)}` as Hash;
    const v = parseInt(sigHex.slice(128, 130), 16);

    // Extract escrow fields from extra or top-level
    const extra = ((obj as Record<string, unknown>).extra ?? {}) as Record<string, unknown>;

    return {
      scheme: "escrow",
      network: x402.network,
      from: authorization.from,
      to: authorization.to,
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce,
      signature: { v, r, s },
      orderId: (extra.orderId ?? obj.orderId ?? "0x") as Hash,
      sellerAddress: (extra.sellerAddress ?? obj.sellerAddress ?? "0x") as Address,
      releaseWindow: Number(extra.releaseWindow ?? obj.releaseWindow ?? 0),
      serviceType: String(extra.serviceType ?? obj.serviceType ?? ""),
    };
  }

  // Xenga native format — pass through
  return raw as EscrowPaymentPayload;
}

/**
 * Framework-independent escrow payment processing.
 *
 * Handles the full xenga lifecycle:
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
    const x402Response: X402SettlementResponse = {
      success: true,
      transaction: order.txHash!,
      network: deps.config.network ?? "base-sepolia",
      payer: (order.buyerAddress ?? "0x") as Address,
      escrowId: order.escrowId!,
    };
    return {
      status: 200,
      body: undefined, // adapter fills in the response body
      headers: {
        "PAYMENT-RESPONSE": toBase64(x402Response),
        "X-PAYMENT-RESPONSE": toBase64(paymentResponse),
      },
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
    return buildPaymentRequiredResponse(order, deps, log, ctx.url);
  }

  // ── Parse payment header (supports both x402 and Xenga native format) ──
  let payload: EscrowPaymentPayload;
  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    payload = normalizePaymentPayload(JSON.parse(decoded));
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

  // ── Assemble content metadata + hash ──
  const contentMetadataObj: Record<string, unknown> = {
    buyer: payload.from,
    contentType: ctx.contentType,
    description: order.description,
    method: ctx.method,
    price: order.price.toString(),
    seller: order.sellerAddress,
    serviceType: order.serviceType,
    terms: order.terms,
    timestamp: Math.floor(Date.now() / 1000),
    title: order.title,
    url: ctx.url,
  };
  const contentMetadata = JSON.stringify(contentMetadataObj, Object.keys(contentMetadataObj).sort());
  const contentHash = keccak256(toBytes(contentMetadata));

  // ── Settle on-chain ──
  try {
    const settleResult = await deps.settle(payload, paymentRequired, contentHash);
    const txHash = settleResult.txHash as `0x${string}`;
    const escrowId = settleResult.escrowId;

    deps.updateOrderStatus(order.id, {
      status: "escrowed",
      buyerAddress: payload.from,
      escrowId,
      txHash,
      contentMetadata,
      contentHash,
    });

    const paymentResponse = { success: true, txHash, escrowId };
    const x402Response: X402SettlementResponse = {
      success: true,
      transaction: txHash,
      network: deps.config.network ?? "base-sepolia",
      payer: payload.from,
      escrowId,
    };

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
      headers: {
        "PAYMENT-RESPONSE": toBase64(x402Response),
        "X-PAYMENT-RESPONSE": toBase64(paymentResponse),
      },
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
  log: PaymentDeps["logger"] & object,
  resourceUrl?: string
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

  // Ensure releaseWindow >= on-chain disputeWindow (contract enforces this)
  if (deps.config.disputeWindow && releaseWindow < deps.config.disputeWindow) {
    releaseWindow = deps.config.disputeWindow;
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

  // Build x402 envelope
  const network = paymentRequired.network;
  const x402Accepts: X402PaymentOption[] = [{
    scheme: "escrow",
    network,
    maxAmountRequired: paymentRequired.amount,
    resource: resourceUrl ?? "",
    description: "Escrow payment for order",
    mimeType: "application/json",
    outputSchema: null,
    payTo: paymentRequired.escrowContract,
    maxTimeoutSeconds: 60,
    asset: paymentRequired.asset,
    extra: {
      // EIP-712 domain hint (clients sign ReceiveWithAuthorization, not TransferWithAuthorization)
      name: getChainConfig(networkToChainId(network)).usdcDomainName,
      version: "2",
      primaryType: "ReceiveWithAuthorization",
      // Escrow-specific fields
      orderId: paymentRequired.orderId,
      sellerAddress: paymentRequired.sellerAddress,
      releaseWindow: paymentRequired.releaseWindow,
      serviceType: paymentRequired.serviceType,
      facilitatorFee: paymentRequired.facilitatorFee,
      ...(sellerReputation ? { sellerReputation } : {}),
    },
  }];
  const x402Envelope: X402PaymentRequirements = {
    x402Version: 1,
    error: "Payment required",
    accepts: x402Accepts,
  };

  return {
    status: 402,
    body: {
      // x402 format (primary)
      ...x402Envelope,
      // Legacy Xenga format (backward compat)
      paymentRequired,
      paymentRequirements,
      sellerReputation,
    },
    headers: {
      "PAYMENT-REQUIRED": toBase64(x402Envelope),
      "X-PAYMENT-REQUIRED": toBase64(paymentRequired),
    },
    handled: true,
  };
}

function toBase64(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}
