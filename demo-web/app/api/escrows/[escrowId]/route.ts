import { NextResponse } from "next/server";
import { getChainAdapter } from "@/lib/chain";
import { EscrowState } from "@shared/types.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ escrowId: string }> }
) {
  const { escrowId: escrowIdParam } = await params;
  const escrowId = parseInt(escrowIdParam, 10);

  if (isNaN(escrowId) || escrowId <= 0) {
    return NextResponse.json({ error: "Invalid escrow ID" }, { status: 400 });
  }

  try {
    const adapter = getChainAdapter();
    const escrow = await adapter.getEscrow(escrowId);

    if (escrow.state === EscrowState.None) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }

    const releasable = await adapter.isReleasable(escrowId);

    return NextResponse.json({
      escrowId,
      orderId: escrow.orderId,
      buyer: escrow.buyer,
      seller: escrow.seller,
      amount: escrow.amount.toString(),
      serviceType: escrow.serviceType,
      state: EscrowState[escrow.state],
      stateNum: escrow.state,
      createdAt: Number(escrow.createdAt),
      releaseWindow: Number(escrow.releaseWindow),
      deliveryConfirmedAt: Number(escrow.deliveryConfirmedAt),
      disputeWindow: Number(escrow.disputeWindow),
      facilitatorFee: escrow.facilitatorFee.toString(),
      isReleasable: releasable,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch escrow", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
