import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { DisputeRequest } from "@shared/types.js";
import { getOrderById, updateOrderStatus } from "@server/services/orderService.js";
import { getDb } from "@server/db/index.js";
import { getChainAdapter } from "@/lib/chain";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  const order = getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "delivery_confirmed") {
    return NextResponse.json(
      { error: "Order is not in a disputable state (must be delivery_confirmed)" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as DisputeRequest;
  if (!body.reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  if (!order.escrowId || !order.buyerAddress) {
    return NextResponse.json(
      { error: "Order is missing escrow or buyer data" },
      { status: 400 }
    );
  }

  db.prepare(
    `INSERT INTO disputes (id, escrow_id, order_id, filed_by, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(id, order.escrowId, order.id, order.buyerAddress, body.reason, now);

  // Transition escrow state to Disputed (mock: updates store, real: skipped — buyer must call on-chain)
  let disputeTxHash: string | undefined;
  try {
    disputeTxHash = await getChainAdapter().fileDispute(order.escrowId);
  } catch (err) {
    console.warn("[Dispute] On-chain dispute filing skipped:", err);
  }

  updateOrderStatus(order.id, { status: "disputed" });

  return NextResponse.json(
    { message: "Dispute filed", disputeId: id, txHash: disputeTxHash },
    { status: 201 }
  );
}
