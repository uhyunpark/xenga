import { getDb } from "@server/db/index.js";
import { SessionState, type OnChainSession } from "@shared/types.js";
import type { Address } from "viem";

let initialized = false;

function ensureTable() {
  if (initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mock_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer TEXT NOT NULL,
      seller TEXT NOT NULL,
      deposit_amount TEXT NOT NULL,
      captured_amount TEXT NOT NULL DEFAULT '0',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      state INTEGER NOT NULL DEFAULT 1
    )
  `);
  initialized = true;
}

export function createMockSession(params: {
  buyer: Address;
  seller: Address;
  depositAmount: string;
  duration: number;
}): number {
  ensureTable();
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + params.duration;
  const result = db
    .prepare(
      `INSERT INTO mock_sessions (buyer, seller, deposit_amount, state, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.buyer,
      params.seller,
      params.depositAmount,
      SessionState.Active,
      now,
      expiresAt
    );
  return result.lastInsertRowid as number;
}

export function getMockSession(sessionId: number): OnChainSession {
  ensureTable();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM mock_sessions WHERE id = ?")
    .get(sessionId) as any;

  if (!row) {
    return {
      buyer: "0x0000000000000000000000000000000000000000" as Address,
      seller: "0x0000000000000000000000000000000000000000" as Address,
      depositAmount: 0n,
      capturedAmount: 0n,
      createdAt: 0n,
      expiresAt: 0n,
      state: SessionState.None,
    };
  }

  return {
    buyer: row.buyer as Address,
    seller: row.seller as Address,
    depositAmount: BigInt(row.deposit_amount),
    capturedAmount: BigInt(row.captured_amount),
    createdAt: BigInt(row.created_at),
    expiresAt: BigInt(row.expires_at),
    state: row.state as SessionState,
  };
}

export function captureMockSession(
  sessionId: number,
  amount: bigint
): void {
  ensureTable();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM mock_sessions WHERE id = ?")
    .get(sessionId) as any;

  if (!row) throw new Error(`Session ${sessionId} not found`);
  if (row.state !== SessionState.Active) throw new Error("Session not active");

  const newCaptured = BigInt(row.captured_amount) + amount;
  if (newCaptured > BigInt(row.deposit_amount)) {
    throw new Error("Capture exceeds deposit");
  }

  db.prepare(
    "UPDATE mock_sessions SET captured_amount = ? WHERE id = ?"
  ).run(newCaptured.toString(), sessionId);
}

export function settleMockSession(
  sessionId: number,
  finalAmount: bigint
): void {
  ensureTable();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM mock_sessions WHERE id = ?")
    .get(sessionId) as any;

  if (!row) throw new Error(`Session ${sessionId} not found`);
  if (row.state !== SessionState.Active) throw new Error("Session not active");

  if (finalAmount > BigInt(row.deposit_amount)) {
    throw new Error("Final amount exceeds deposit");
  }

  db.prepare(
    "UPDATE mock_sessions SET captured_amount = ?, state = ? WHERE id = ?"
  ).run(finalAmount.toString(), SessionState.Settled, sessionId);
}

export function isMockSessionExpired(sessionId: number): boolean {
  ensureTable();
  const row = getDb()
    .prepare("SELECT expires_at, state FROM mock_sessions WHERE id = ?")
    .get(sessionId) as any;

  if (!row) return false;
  if (row.state !== SessionState.Active) return false;

  return Math.floor(Date.now() / 1000) > row.expires_at;
}
