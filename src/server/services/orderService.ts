import { v4 as uuidv4 } from "uuid";
import { keccak256, toHex, parseUnits, type Address, type Hash } from "viem";
import type {
  CreateOrderRequest,
  Order,
  OrderStatus,
} from "../../shared/types.js";
import { USDC_DECIMALS } from "../../shared/constants.js";
import { getDb } from "../db/index.js";

function toOrder(row: any): Order {
  return {
    id: row.id,
    orderId: row.order_id as Hash,
    title: row.title,
    description: row.description,
    price: BigInt(row.price),
    serviceType: row.service_type,
    sellerAddress: row.seller_address as Address,
    buyerAddress: row.buyer_address as Address | undefined,
    status: row.status as OrderStatus,
    escrowId: row.escrow_id ?? undefined,
    txHash: row.tx_hash as Hash | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOrder(req: CreateOrderRequest): Order {
  const db = getDb();
  const id = uuidv4();
  const orderId = keccak256(toHex(id));
  const price = parseUnits(String(req.price), USDC_DECIMALS);
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO orders (id, order_id, title, description, price, service_type, seller_address, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`
  ).run(
    id,
    orderId,
    req.title,
    req.description,
    price.toString(),
    req.serviceType,
    req.sellerAddress,
    now,
    now
  );

  return getOrderById(id)!;
}

export function getOrderById(id: string): Order | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  return row ? toOrder(row) : undefined;
}

export function getOrderByOrderId(orderId: Hash): Order | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
  return row ? toOrder(row) : undefined;
}

export interface ListOrdersResult {
  orders: Order[];
  total: number;
  limit: number;
  offset: number;
}

export function listOrders(filters?: {
  status?: OrderStatus;
  sellerAddress?: Address;
  limit?: number;
  offset?: number;
}): ListOrdersResult {
  const db = getDb();
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const offset = Math.max(filters?.offset ?? 0, 0);

  let whereSql = "WHERE 1=1";
  const params: any[] = [];

  if (filters?.status) {
    whereSql += " AND status = ?";
    params.push(filters.status);
  }
  if (filters?.sellerAddress) {
    whereSql += " AND seller_address = ?";
    params.push(filters.sellerAddress);
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders ${whereSql}`).get(...params) as { total: number };

  const orders = db
    .prepare(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(toOrder);

  return { orders, total: countRow.total, limit, offset };
}

export function updateOrderStatus(
  id: string,
  update: {
    status: OrderStatus;
    buyerAddress?: Address;
    escrowId?: number;
    txHash?: Hash;
  }
): Order | undefined {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ["status = ?", "updated_at = ?"];
  const params: any[] = [update.status, now];

  if (update.buyerAddress) {
    sets.push("buyer_address = ?");
    params.push(update.buyerAddress);
  }
  if (update.escrowId !== undefined) {
    sets.push("escrow_id = ?");
    params.push(update.escrowId);
  }
  if (update.txHash) {
    sets.push("tx_hash = ?");
    params.push(update.txHash);
  }

  params.push(id);
  db.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params
  );

  return getOrderById(id);
}
