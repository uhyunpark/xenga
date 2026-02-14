import type { Address } from "viem";
import { getDb } from "../db/index.js";

export interface SessionRow {
  session_id: number;
  buyer_address: string;
  seller_address: string;
  deposit_amount: string;
  used_amount: string;
  price_per_use: string;
  expires_at: number;
  status: string;
  tx_hash: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionUsageRow {
  id: number;
  session_id: number;
  amount: string;
  endpoint: string | null;
  created_at: number;
}

export function createSession(
  sessionId: number,
  buyerAddress: Address,
  sellerAddress: Address,
  depositAmount: string,
  pricePerUse: string,
  expiresAt: number,
  txHash: string
): SessionRow {
  const now = Math.floor(Date.now() / 1000);
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (session_id, buyer_address, seller_address, deposit_amount, price_per_use, expires_at, tx_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, buyerAddress.toLowerCase(), sellerAddress.toLowerCase(), depositAmount, pricePerUse, expiresAt, txHash, now, now);

  return getSession(sessionId)!;
}

export function getSession(sessionId: number): SessionRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId) as SessionRow | undefined;
}

export function getActiveSessionByBuyer(buyerAddress: Address): SessionRow | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM sessions WHERE buyer_address = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(buyerAddress.toLowerCase()) as SessionRow | undefined;
}

export function recordUsage(
  sessionId: number,
  amount: string,
  endpoint?: string
): { usedAmount: string; remaining: string } {
  const now = Math.floor(Date.now() / 1000);
  const db = getDb();

  // Insert usage record
  db.prepare(
    "INSERT INTO session_usage (session_id, amount, endpoint, created_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, amount, endpoint ?? null, now);

  // Update session used_amount
  db.prepare(
    "UPDATE sessions SET used_amount = CAST(CAST(used_amount AS INTEGER) + CAST(? AS INTEGER) AS TEXT), updated_at = ? WHERE session_id = ?"
  ).run(amount, now, sessionId);

  const session = getSession(sessionId)!;
  const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();
  return { usedAmount: session.used_amount, remaining };
}

export function getSessionUsage(sessionId: number): SessionUsageRow[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM session_usage WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId) as SessionUsageRow[];
}

export function updateSessionStatus(sessionId: number, status: string): void {
  const now = Math.floor(Date.now() / 1000);
  const db = getDb();
  db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE session_id = ?").run(status, now, sessionId);
}

export function listSessions(filters?: { status?: string; buyerAddress?: string }): SessionRow[] {
  const db = getDb();
  let sql = "SELECT * FROM sessions";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.buyerAddress) {
    conditions.push("buyer_address = ?");
    params.push(filters.buyerAddress.toLowerCase());
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";

  return db.prepare(sql).all(...params) as SessionRow[];
}
