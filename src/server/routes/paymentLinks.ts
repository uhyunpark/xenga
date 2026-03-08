import { Router } from "express";
import crypto from "crypto";
import { isAddress, type Address } from "viem";
import { sessionAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getDb } from "../db/index.js";
import { getServiceType } from "../service-types/index.js";
import { createOrder } from "../services/orderService.js";
import { USDC_DECIMALS } from "../../shared/constants.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = Router();

interface PaymentLink {
  id: string;
  sellerAddress: string;
  title: string;
  description: string;
  price: string;
  serviceType: string;
  terms?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

function toPaymentLink(row: any): PaymentLink {
  return {
    id: row.id,
    sellerAddress: row.seller_address,
    title: row.title,
    description: row.description,
    price: row.price,
    serviceType: row.service_type,
    terms: row.terms ?? undefined,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Rate limiter for checkout (public, unauthenticated)
const checkoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: "Too many checkout requests, please try again later",
});

// ──────────── Create payment link (seller) ────────────
router.post("/", sessionAuth(), (req: AuthenticatedRequest, res) => {
  const sellerAddress = req.callerAddress!.toLowerCase();
  const { title, description, price, serviceType, terms } = req.body as {
    title?: string;
    description?: string;
    price?: number;
    serviceType?: string;
    terms?: string;
  };

  if (!title || !price) {
    return res.status(400).json({ error: "Missing required fields: title, price" });
  }

  if (title.length > 200) {
    return res.status(400).json({ error: "Title must be 200 characters or fewer" });
  }
  if (description && description.length > 2000) {
    return res.status(400).json({ error: "Description must be 2000 characters or fewer" });
  }
  if (typeof price !== "number" || price <= 0 || price > 1_000_000) {
    return res.status(400).json({ error: "Price must be a positive number up to 1,000,000 USDC" });
  }
  if (terms && terms.length > 5000) {
    return res.status(400).json({ error: "Terms must be 5000 characters or fewer" });
  }

  const st = serviceType || "marketplace";
  if (!getServiceType(st)) {
    return res.status(400).json({ error: `Unknown service type: ${st}` });
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO payment_links (id, seller_address, title, description, price, service_type, terms, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, sellerAddress, title, description || "", String(price), st, terms ?? null, now, now);

  const row = db.prepare("SELECT * FROM payment_links WHERE id = ?").get(id);
  res.status(201).json(toPaymentLink(row));
});

// ──────────── List payment links (seller) ────────────
router.get("/", sessionAuth(), (req: AuthenticatedRequest, res) => {
  const sellerAddress = req.callerAddress!.toLowerCase();
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM payment_links WHERE seller_address = ? ORDER BY created_at DESC")
    .all(sellerAddress) as any[];
  res.json(rows.map(toPaymentLink));
});

// ──────────── Deactivate payment link (seller) ────────────
router.post("/:id/deactivate", sessionAuth(), (req: AuthenticatedRequest, res) => {
  const sellerAddress = req.callerAddress!.toLowerCase();
  const linkId = req.params.id as string;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(
    `UPDATE payment_links SET active = 0, updated_at = ? WHERE id = ? AND seller_address = ? AND active = 1`
  ).run(now, linkId, sellerAddress);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Payment link not found or already deactivated" });
  }

  res.json({ success: true });
});

// ──────────── Public: get payment link details (no auth) ────────────
router.get("/:id/details", (_req, res) => {
  const linkId = _req.params.id as string;
  const db = getDb();
  const row = db.prepare("SELECT * FROM payment_links WHERE id = ?").get(linkId);

  if (!row) {
    return res.status(404).json({ error: "Payment link not found" });
  }

  const link = toPaymentLink(row);
  if (!link.active) {
    return res.status(410).json({ error: "This payment link has been deactivated by the seller" });
  }

  // Return public-safe fields only
  res.json({
    id: link.id,
    title: link.title,
    description: link.description,
    price: link.price,
    serviceType: link.serviceType,
    sellerAddress: link.sellerAddress,
    ...(link.terms ? { terms: link.terms } : {}),
  });
});

// ──────────── Public: checkout (no auth, rate limited) ────────────
router.post("/:id/checkout", checkoutLimiter, (_req, res) => {
  const linkId = _req.params.id as string;
  const db = getDb();
  const row = db.prepare("SELECT * FROM payment_links WHERE id = ?").get(linkId);

  if (!row) {
    return res.status(404).json({ error: "Payment link not found" });
  }

  const link = toPaymentLink(row);
  if (!link.active) {
    return res.status(410).json({ error: "This payment link has been deactivated by the seller" });
  }

  // Resolve seller's payout address (falls back to seller's registered address)
  let sellerAddress = link.sellerAddress;
  const seller = db.prepare("SELECT payout_address FROM sellers WHERE address = ?").get(link.sellerAddress) as
    | { payout_address: string | null }
    | undefined;
  if (seller?.payout_address) {
    sellerAddress = seller.payout_address;
  }

  // Create an order from the payment link data
  const order = createOrder({
    title: link.title,
    description: link.description,
    price: Number(link.price),
    serviceType: link.serviceType,
    sellerAddress: sellerAddress as Address,
    ...(link.terms ? { terms: link.terms } : {}),
  });

  res.status(201).json({
    orderId: order.id,
    orderHash: order.orderId,
    price: order.price.toString(),
    priceUsdc: Number(order.price) / 10 ** USDC_DECIMALS,
    sellerAddress,
    serviceType: link.serviceType,
  });
});

export default router;
