import { NextResponse } from "next/server";
import type { ResolveDisputeRequest } from "@shared/types.js";
import { getDb } from "@server/db/index.js";
import { resolveDisputeOnChain } from "@server/facilitator/settler.js";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: disputeId } = await params;

  const db = getDb();
  const dispute = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId) as any;

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }
  if (dispute.status !== "open") {
    return NextResponse.json({ error: "Dispute is already resolved" }, { status: 400 });
  }

  const body = (await request.json()) as ResolveDisputeRequest;
  if (body.buyerPct === undefined || body.buyerPct < 0 || body.buyerPct > 100) {
    return NextResponse.json({ error: "buyerPct must be 0-100" }, { status: 400 });
  }

  try {
    const txHash = await resolveDisputeOnChain(dispute.escrow_id, body.buyerPct);

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE disputes SET status = 'resolved', resolution = ?, buyer_pct = ?, resolved_at = ? WHERE id = ?`
    ).run(body.resolution || "", body.buyerPct, now, dispute.id);

    return NextResponse.json({
      message: "Dispute resolved",
      txHash,
      buyerPct: body.buyerPct,
      sellerPct: 100 - body.buyerPct,
    });
  } catch (err) {
    console.error("[ResolveDispute] Failed:", err);
    return NextResponse.json({ error: "On-chain resolution failed" }, { status: 500 });
  }
}
