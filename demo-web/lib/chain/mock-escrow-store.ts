import { getDb } from "@server/db/index.js";
import { EscrowState, type OnChainEscrow } from "@shared/types.js";
import type { Address, Hash } from "viem";

let initialized = false;

function ensureTable() {
  if (initialized) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mock_escrows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      buyer TEXT NOT NULL,
      seller TEXT NOT NULL,
      amount TEXT NOT NULL,
      service_type TEXT NOT NULL,
      state INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      release_window INTEGER NOT NULL,
      delivery_confirmed_at INTEGER NOT NULL DEFAULT 0,
      dispute_window INTEGER NOT NULL
    )
  `);
  initialized = true;
}

export function createMockEscrow(params: {
  orderId: Hash;
  buyer: Address;
  seller: Address;
  amount: string;
  serviceType: string;
  releaseWindow: number;
  disputeWindow: number;
}): number {
  ensureTable();
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `INSERT INTO mock_escrows (order_id, buyer, seller, amount, service_type, state, created_at, release_window, dispute_window)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.orderId,
      params.buyer,
      params.seller,
      params.amount,
      params.serviceType,
      EscrowState.Active,
      now,
      params.releaseWindow,
      params.disputeWindow
    );
  return result.lastInsertRowid as number;
}

export function getMockEscrow(escrowId: number): OnChainEscrow {
  ensureTable();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM mock_escrows WHERE id = ?")
    .get(escrowId) as any;

  if (!row) {
    return {
      orderId:
        "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
      buyer: "0x0000000000000000000000000000000000000000" as Address,
      seller: "0x0000000000000000000000000000000000000000" as Address,
      amount: 0n,
      serviceType: "",
      state: EscrowState.None,
      createdAt: 0n,
      releaseWindow: 0n,
      deliveryConfirmedAt: 0n,
      disputeWindow: 0n,
    };
  }

  return {
    orderId: row.order_id as Hash,
    buyer: row.buyer as Address,
    seller: row.seller as Address,
    amount: BigInt(row.amount),
    serviceType: row.service_type,
    state: row.state as EscrowState,
    createdAt: BigInt(row.created_at),
    releaseWindow: BigInt(row.release_window),
    deliveryConfirmedAt: BigInt(row.delivery_confirmed_at),
    disputeWindow: BigInt(row.dispute_window),
  };
}

export function updateMockEscrowState(
  escrowId: number,
  state: EscrowState,
  extras?: { deliveryConfirmedAt?: number }
): void {
  ensureTable();
  const db = getDb();
  if (extras?.deliveryConfirmedAt !== undefined) {
    db.prepare(
      "UPDATE mock_escrows SET state = ?, delivery_confirmed_at = ? WHERE id = ?"
    ).run(state, extras.deliveryConfirmedAt, escrowId);
  } else {
    db.prepare("UPDATE mock_escrows SET state = ? WHERE id = ?").run(
      state,
      escrowId
    );
  }
}

export function isMockReleasable(escrowId: number): boolean {
  ensureTable();
  const row = getDb()
    .prepare(
      "SELECT state, created_at, release_window, delivery_confirmed_at, dispute_window FROM mock_escrows WHERE id = ?"
    )
    .get(escrowId) as any;

  if (!row) return false;

  const now = Math.floor(Date.now() / 1000);
  if (row.state === EscrowState.DeliveryConfirmed) {
    return row.delivery_confirmed_at + row.dispute_window < now;
  }
  if (row.state === EscrowState.Active) {
    return row.created_at + row.release_window < now;
  }
  return false;
}
