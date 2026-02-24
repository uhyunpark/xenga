import { v4 as uuidv4 } from "uuid";
import type { Address } from "viem";
import { getDb } from "../db/index.js";

export type PaymentIntentStatus = "pending" | "completed" | "expired" | "failed";

export interface PaymentIntent {
  id: string;
  orderId: string;
  buyerAddress?: Address;
  returnUrl?: string;
  status: PaymentIntentStatus;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

function toPaymentIntent(row: any): PaymentIntent {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerAddress: row.buyer_address as Address | undefined,
    returnUrl: row.return_url ?? undefined,
    status: row.status as PaymentIntentStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_EXPIRY_SECONDS = 30 * 60; // 30 minutes

export function createPaymentIntent(params: {
  orderId: string;
  buyerAddress?: Address;
  returnUrl?: string;
  expirySeconds?: number;
}): PaymentIntent {
  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (params.expirySeconds ?? DEFAULT_EXPIRY_SECONDS);

  db.prepare(
    `INSERT INTO payment_intents (id, order_id, buyer_address, return_url, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(id, params.orderId, params.buyerAddress ?? null, params.returnUrl ?? null, expiresAt, now, now);

  return getPaymentIntentById(id)!;
}

export function getPaymentIntentById(id: string): PaymentIntent | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM payment_intents WHERE id = ?").get(id);
  if (!row) return undefined;
  const intent = toPaymentIntent(row);
  // Auto-expire
  if (intent.status === "pending" && intent.expiresAt < Math.floor(Date.now() / 1000)) {
    updatePaymentIntentStatus(id, "expired");
    return { ...intent, status: "expired" };
  }
  return intent;
}

export function updatePaymentIntentStatus(id: string, status: PaymentIntentStatus): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
}
