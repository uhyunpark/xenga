import { Router } from "express";
import type { Address } from "viem";
import type { CreateOrderRequest, OrderStatus } from "../../shared/types.js";
import { USDC_DECIMALS } from "../../shared/constants.js";
import {
  createOrder,
  getOrderById,
  listOrders,
} from "../services/orderService.js";
import { escrowPaymentMiddleware, type EscrowPaymentRequest } from "../middleware/escrowPayment.js";

const router = Router();

const VALID_STATUSES: OrderStatus[] = ["created", "pending_payment", "escrowed", "delivery_confirmed", "completed", "disputed", "resolved", "refunded"];

// ──────────── List orders ────────────
router.get("/", (req, res) => {
  const filters: { status?: OrderStatus; sellerAddress?: Address; limit?: number; offset?: number } = {};
  if (req.query.status) {
    const status = req.query.status as string;
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      return res.status(400).json({ error: `Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(", ")}` });
    }
    filters.status = status as OrderStatus;
  }
  if (req.query.seller)
    filters.sellerAddress = req.query.seller as Address;
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
router.post("/", (req, res) => {
  const body = req.body as CreateOrderRequest;

  if (!body.title || !body.price || !body.serviceType || !body.sellerAddress) {
    return res.status(400).json({
      error: "Missing required fields: title, price, serviceType, sellerAddress",
    });
  }

  const order = createOrder(body);
  res.status(201).json({
    ...order,
    price: order.price.toString(),
    priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
  });
});

// ──────────── Pay for order (x402 escrow flow) ────────────
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
