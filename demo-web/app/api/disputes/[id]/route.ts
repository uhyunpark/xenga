import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { DisputeRequest } from "@shared/types.js";
import { getOrderById } from "@server/services/orderService.js";
import { getDb } from "@server/db/index.js";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  const order = getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "delivery_confirmed" && order.status !== "escrowed") {
    return NextResponse.json(
      { error: "Order is not in a disputable state" },
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

  db.prepare(
    `INSERT INTO disputes (id, escrow_id, order_id, filed_by, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(id, order.escrowId ?? 0, order.id, order.buyerAddress ?? "unknown", body.reason, now);

  return NextResponse.json({ message: "Dispute filed", disputeId: id }, { status: 201 });
}
