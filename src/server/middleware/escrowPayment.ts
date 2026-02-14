import type { Request, Response, NextFunction } from "express";
import type {
  EscrowPaymentPayload,
  EscrowPaymentRequired,
  EscrowPaymentResponse,
  Order,
} from "../../shared/types.js";
import { CHAIN_ID, USDC_ADDRESS } from "../../shared/constants.js";
import { config } from "../config.js";
import { getOrderById, updateOrderStatus } from "../services/orderService.js";
import { getDb } from "../db/index.js";
import { getServiceType } from "../service-types/index.js";
import { verifyViaFacilitator, settleViaFacilitator } from "../facilitator/dispatch.js";

export interface EscrowPaymentRequest extends Request {
  escrowPayment?: EscrowPaymentResponse;
  order?: Order;
}

/**
 * x402 Escrow Payment Middleware
 *
 * When a request comes without payment header:
 *   → Returns 402 with PAYMENT-REQUIRED header describing the escrow scheme
 *
 * When a request comes with payment header:
 *   → Verifies the ERC-3009 signature off-chain
 *   → Submits createEscrowWithAuth transaction on-chain
 *   → Returns 200 with PAYMENT-RESPONSE header
 *
 * Supports both x402 standard headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE)
 * and legacy headers (X-PAYMENT-REQUIRED, X-PAYMENT, X-PAYMENT-RESPONSE) for backward compatibility.
 */
export function escrowPaymentMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orderId = req.params.id as string;
    if (!orderId) return next();

    const order = getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Idempotency: if already escrowed, return existing details
    if (order.status === "escrowed" || order.status === "delivery_confirmed" || order.status === "completed") {
      const paymentResponse = {
        success: true,
        txHash: order.txHash!,
        escrowId: order.escrowId!,
      };
      const encoded = Buffer.from(JSON.stringify(paymentResponse)).toString("base64");
      res.setHeader("PAYMENT-RESPONSE", encoded);
      res.setHeader("X-PAYMENT-RESPONSE", encoded);
      (req as EscrowPaymentRequest).escrowPayment = paymentResponse;
      (req as EscrowPaymentRequest).order = order;
      return next();
    }

    // If in a non-payable terminal state, skip payment flow
    if (order.status !== "created" && order.status !== "pending_payment") {
      return next();
    }

    // Read payment header: prefer standard, fallback to legacy
    const paymentHeader = (req.headers["payment-signature"] ?? req.headers["x-payment"]) as string | undefined;

    if (!paymentHeader) {
      // Return 402 Payment Required
      const serviceType = getServiceType(order.serviceType);
      if (!serviceType) {
        return res
          .status(400)
          .json({ error: `Unknown service type: ${order.serviceType}` });
      }

      const paymentRequired: EscrowPaymentRequired = {
        scheme: "escrow",
        network: "base-sepolia",
        escrowContract: config.escrowVaultAddress,
        asset: config.usdcAddress,
        amount: order.price.toString(),
        orderId: order.orderId,
        sellerAddress: order.sellerAddress,
        releaseWindow: serviceType.releaseWindow,
        serviceType: order.serviceType,
      };

      // x402 standard: array format
      const paymentRequirements = [paymentRequired];
      const encodedArray = Buffer.from(JSON.stringify(paymentRequirements)).toString("base64");
      const encodedSingle = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");

      res.setHeader("PAYMENT-REQUIRED", encodedArray);
      res.setHeader("X-PAYMENT-REQUIRED", encodedSingle);
      return res.status(402).json({
        error: "Payment required",
        paymentRequired,
        paymentRequirements,
      });
    }

    // Parse and verify payment
    let payload: EscrowPaymentPayload;
    try {
      const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
      payload = JSON.parse(decoded);
    } catch {
      return res.status(400).json({ error: "Invalid payment header" });
    }

    if (payload.scheme !== "escrow") {
      return res
        .status(400)
        .json({ error: `Unsupported scheme: ${payload.scheme}` });
    }

    // Verify signature via facilitator (internal or external)
    const paymentRequired: EscrowPaymentRequired = {
      scheme: "escrow",
      network: "base-sepolia",
      escrowContract: config.escrowVaultAddress,
      asset: config.usdcAddress,
      amount: payload.value,
      orderId: payload.orderId,
      sellerAddress: payload.sellerAddress,
      releaseWindow: payload.releaseWindow,
      serviceType: payload.serviceType,
    };

    const verification = await verifyViaFacilitator(payload, paymentRequired);
    if (!verification.valid) {
      return res.status(400).json({
        error: "Payment verification failed",
        details: verification.error,
      });
    }

    // Atomically claim this payment to prevent races
    const db = getDb();
    const result = db.prepare(
      "UPDATE orders SET status = 'pending_payment', updated_at = ? WHERE id = ? AND status = 'created'"
    ).run(Math.floor(Date.now() / 1000), order.id);

    if (result.changes === 0) {
      return res.status(409).json({ error: "Payment already in progress or completed" });
    }

    // Submit on-chain via facilitator
    try {
      const settleResult = await settleViaFacilitator(payload, paymentRequired);
      const txHash = settleResult.txHash! as `0x${string}`;
      const escrowId = settleResult.escrowId as number;

      // Update order status
      updateOrderStatus(order.id, {
        status: "escrowed",
        buyerAddress: payload.from,
        escrowId,
        txHash,
      });

      const paymentResponse = {
        success: true,
        txHash,
        escrowId,
      };

      const encoded = Buffer.from(JSON.stringify(paymentResponse)).toString("base64");
      res.setHeader("PAYMENT-RESPONSE", encoded);
      res.setHeader("X-PAYMENT-RESPONSE", encoded);

      // Attach payment info to request for downstream handlers
      (req as EscrowPaymentRequest).escrowPayment = paymentResponse;
      (req as EscrowPaymentRequest).order = getOrderById(order.id) ?? undefined;
      next();
    } catch (err) {
      console.error("[EscrowPayment] Settlement failed:", err);
      // Revert status on failure
      db.prepare("UPDATE orders SET status = 'created', updated_at = ? WHERE id = ?")
        .run(Math.floor(Date.now() / 1000), order.id);
      return res.status(500).json({
        error: "Payment settlement failed",
      });
    }
  };
}
