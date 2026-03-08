import { Router } from "express";
import { getEscrow, isReleasable } from "../services/escrowService.js";
import { EscrowState } from "../../shared/types.js";
import { getDb } from "../db/index.js";

const router = Router();

// ──────────── Get escrow status (on-chain) ────────────
router.get("/:escrowId", async (req, res) => {
  const escrowId = parseInt(req.params.escrowId, 10);
  if (isNaN(escrowId) || escrowId <= 0) {
    return res.status(400).json({ error: "Invalid escrow ID" });
  }

  try {
    const escrow = await getEscrow(escrowId);

    if (escrow.state === EscrowState.None) {
      return res.status(404).json({ error: "Escrow not found" });
    }

    const releasable = await isReleasable(escrowId);

    // Look up contentMetadata from orders DB
    const db = getDb();
    const orderRow = db.prepare("SELECT content_metadata FROM orders WHERE escrow_id = ?").get(escrowId) as
      | { content_metadata: string | null }
      | undefined;

    res.json({
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
      contentHash: escrow.contentHash,
      ...(orderRow?.content_metadata ? { contentMetadata: orderRow.content_metadata } : {}),
      isReleasable: releasable,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch escrow",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
