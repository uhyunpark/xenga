import { Router } from "express";
import { isAddress, type Address } from "viem";
import type { CreateOrderRequest, OrderStatus } from "../../shared/types.js";
import { USDC_DECIMALS } from "../../shared/constants.js";
import {
  createOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
} from "../services/orderService.js";
import { getServiceType } from "../service-types/index.js";
import { escrowPaymentMiddleware, type EscrowPaymentRequest } from "../middleware/escrowPayment.js";
import { apiKeyAuth, apiKeyOrWalletAuth, walletAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { confirmDeliveryOnChain } from "../facilitator/settler.js";

const router = Router();

const VALID_STATUSES: OrderStatus[] = ["created", "pending_payment", "escrowed", "delivery_confirmed", "completed", "disputed", "resolved", "refunded"];

// ──────────── List orders ────────────
// When filtering by seller address, skip API key auth (read-only, filtered data).
// If wallet headers present with ?seller=, verify the signer matches the seller param.
// Full unfiltered list still requires API key.
router.get("/", (req, res, next) => {
  const sellerFilter = req.query.seller as string | undefined;
  if (sellerFilter && req.headers["x-wallet-address"]) {
    // Use walletAuth to verify identity, then check address match
    return walletAuth()(req as AuthenticatedRequest, res, next);
  }
  if (sellerFilter) return next(); // Open mode fallback (backward compat for demos)
  return apiKeyAuth()(req, res, next);
}, (req: AuthenticatedRequest, res) => {
  const sellerFilter = req.query.seller as string | undefined;

  // If wallet auth was used, verify identity matches seller filter
  if (sellerFilter && req.callerAddress) {
    if (req.callerAddress.toLowerCase() !== sellerFilter.toLowerCase()) {
      return res.status(403).json({ error: "Wallet address does not match seller filter" });
    }
  }

  const filters: { status?: OrderStatus; sellerAddress?: Address; limit?: number; offset?: number } = {};
  if (req.query.status) {
    const status = req.query.status as string;
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      return res.status(400).json({ error: `Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(", ")}` });
    }
    filters.status = status as OrderStatus;
  }
  if (sellerFilter)
    filters.sellerAddress = sellerFilter as Address;
  if (req.query.limit)
    filters.limit = parseInt(req.query.limit as string, 10);
  if (req.query.offset)
    filters.offset = parseInt(req.query.offset as string, 10);

  const result = listOrders(filters);
  res.json({
    orders: result.orders.map((o) => ({
      ...o,
      price: o.price.toString(),
      priceUsdc: Number(o.price) / 10 ** USDC_DECIMALS,
    })),
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// ──────────── Get order ────────────
router.get("/:id", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  res.json({
    ...order,
    price: order.price.toString(),
    priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
  });
});

// ──────────── Create order ────────────
router.post("/", apiKeyAuth(), (req, res) => {
  const body = req.body as CreateOrderRequest;

  if (!body.title || !body.price || !body.serviceType || !body.sellerAddress) {
    return res.status(400).json({
      error: "Missing required fields: title, price, serviceType, sellerAddress",
    });
  }

  if (typeof body.price !== "number" || body.price <= 0 || body.price > 1_000_000) {
    return res.status(400).json({ error: "Price must be a positive number up to 1,000,000 USDC" });
  }
  if (body.title.length > 200) {
    return res.status(400).json({ error: "Title must be 200 characters or fewer" });
  }
  if (body.description && body.description.length > 2000) {
    return res.status(400).json({ error: "Description must be 2000 characters or fewer" });
  }
  if (!getServiceType(body.serviceType)) {
    return res.status(400).json({ error: `Unknown service type: ${body.serviceType}` });
  }
  if (!isAddress(body.sellerAddress)) {
    return res.status(400).json({ error: "Invalid seller address" });
  }

  const order = createOrder(body);
  res.status(201).json({
    ...order,
    price: order.price.toString(),
    priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
  });
});

// ──────────── Confirm delivery (operator/seller) ────────────
router.post("/:id/confirm-delivery", apiKeyOrWalletAuth(), async (req: AuthenticatedRequest, res) => {
  const order = getOrderById(req.params.id as string);
  if (!order) return res.status(404).json({ error: "Order not found" });

  // If wallet auth was used, verify signer is the seller
  if (req.callerAddress && req.callerAddress.toLowerCase() !== order.sellerAddress.toLowerCase()) {
    return res.status(403).json({ error: "Only the seller can confirm delivery" });
  }

  if (order.status !== "escrowed" || order.escrowId === undefined) {
    return res.status(400).json({ error: "Order is not in escrowed state or missing escrowId" });
  }

  try {
    const txHash = await confirmDeliveryOnChain(order.escrowId);
    updateOrderStatus(order.id, { status: "delivery_confirmed" });

    res.json({
      message: "Delivery confirmed on-chain",
      txHash,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to confirm delivery on-chain",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// ──────────── Pay for order (xenga escrow flow) ────────────
router.post("/:id/pay", escrowPaymentMiddleware(), (req: EscrowPaymentRequest, res) => {
  const payment = req.escrowPayment;
  const order = req.order!;

  res.json({
    message: "Payment successful — funds are now in escrow",
    order: {
      ...order,
      price: order.price.toString(),
      priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
    },
    payment,
  });
});

export default router;
