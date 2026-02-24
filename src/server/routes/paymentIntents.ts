import { Router } from "express";
import { isAddress } from "viem";
import { getOrderById } from "../services/orderService.js";
import {
  createPaymentIntent,
  getPaymentIntentById,
  updatePaymentIntentStatus,
} from "../services/paymentIntentService.js";
import { apiKeyAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/payment-intents
 *
 * Create a payment intent for a Stripe-like hosted checkout flow.
 * The merchant creates an order, then creates a payment intent for it.
 * The buyer is redirected to the checkout URL to complete payment.
 *
 * Body: { orderId, buyerAddress?, returnUrl? }
 * Returns: { id, checkoutUrl, status, expiresAt }
 */
router.post("/", apiKeyAuth(), (req, res) => {
  const { orderId, buyerAddress, returnUrl } = req.body as {
    orderId?: string;
    buyerAddress?: string;
    returnUrl?: string;
  };

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  const order = getOrderById(orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (order.status !== "created") {
    return res.status(400).json({
      error: `Order is not in payable state (current: ${order.status})`,
    });
  }

  if (buyerAddress && !isAddress(buyerAddress)) {
    return res.status(400).json({ error: "Invalid buyer address" });
  }

  if (returnUrl) {
    try {
      new URL(returnUrl);
    } catch {
      return res.status(400).json({ error: "Invalid return URL" });
    }
  }

  const intent = createPaymentIntent({
    orderId,
    buyerAddress: buyerAddress as `0x${string}` | undefined,
    returnUrl,
  });

  // Build checkout URL — frontend hosted checkout page
  const corsOrigin = process.env.CORS_ORIGIN;
  const baseUrl = process.env.CHECKOUT_BASE_URL || (corsOrigin && corsOrigin !== "*" ? corsOrigin : "");
  const checkoutUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/checkout/${intent.id}`
    : `/checkout/${intent.id}`;

  res.status(201).json({
    id: intent.id,
    orderId: intent.orderId,
    checkoutUrl,
    status: intent.status,
    expiresAt: intent.expiresAt,
    createdAt: intent.createdAt,
  });
});

/**
 * GET /api/payment-intents/:id
 *
 * Get payment intent status. Used by merchants to poll for completion.
 */
router.get("/:id", (req, res) => {
  const intent = getPaymentIntentById(req.params.id as string);
  if (!intent) {
    return res.status(404).json({ error: "Payment intent not found" });
  }

  // Enrich with order status
  const order = getOrderById(intent.orderId);

  // Sync status from order — persist to DB so expiry logic doesn't race
  if (intent.status === "pending" && order) {
    if (order.status === "escrowed" || order.status === "completed") {
      updatePaymentIntentStatus(intent.id, "completed");
      intent.status = "completed";
    }
  }

  res.json({
    id: intent.id,
    orderId: intent.orderId,
    status: intent.status,
    buyerAddress: intent.buyerAddress,
    returnUrl: intent.returnUrl,
    expiresAt: intent.expiresAt,
    createdAt: intent.createdAt,
    order: order
      ? {
          id: order.id,
          title: order.title,
          status: order.status,
          price: order.price.toString(),
          escrowId: order.escrowId,
          txHash: order.txHash,
        }
      : undefined,
  });
});

export default router;
