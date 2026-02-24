import { Router } from "express";
import { getEscrow, isReleasable } from "../services/escrowService.js";
import { EscrowState } from "../../shared/types.js";

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
