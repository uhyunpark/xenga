import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { DisputeRequest, ResolveDisputeRequest } from "../../shared/types.js";
import { getDb } from "../db/index.js";
import { getOrderById } from "../services/orderService.js";
import { resolveDisputeOnChain } from "../facilitator/settler.js";
import { walletAuth, apiKeyAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getArbiterAddress } from "../config.js";

const router = Router();

// ──────────── File dispute ────────────
function handleFileDispute(req: import("express").Request, res: import("express").Response) {
  const orderId = (req.params.orderId || req.params[0]) as string;
  const order = getOrderById(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "delivery_confirmed" && order.status !== "escrowed") {
    return res.status(400).json({ error: "Order is not in disputable state" });
  }

  const body = req.body as DisputeRequest;
  if (!body.reason) {
    return res.status(400).json({ error: "Reason is required" });
  }

  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO disputes (id, escrow_id, order_id, filed_by, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(
    id,
    order.escrowId ?? 0,
    order.id,
    order.buyerAddress ?? "unknown",
    body.reason,
    now
  );

  res.status(201).json({
    message: "Dispute filed",
    disputeId: id,
  });
}

router.post("/:orderId/dispute", handleFileDispute);
// Alias: frontend calls POST /api/disputes/:orderId (without /dispute suffix)
router.post("/:orderId", handleFileDispute);

// ──────────── List disputes ────────────
router.get("/", apiKeyAuth(), (_req, res) => {
  const db = getDb();
  const disputes = db.prepare("SELECT * FROM disputes ORDER BY created_at DESC").all();
  res.json(disputes);
});

// ──────────── Resolve dispute (arbiter) ────────────
router.post("/:disputeId/resolve", walletAuth(() => getArbiterAddress()), async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const dispute = db
    .prepare("SELECT * FROM disputes WHERE id = ?")
    .get(req.params.disputeId) as any;

  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  if (dispute.status !== "open") {
    return res.status(400).json({ error: "Dispute is already resolved" });
  }

  const body = req.body as ResolveDisputeRequest;
  if (body.buyerPct === undefined || body.buyerPct < 0 || body.buyerPct > 100) {
    return res.status(400).json({ error: "buyerPct must be 0–100" });
  }

  try {
    const txHash = await resolveDisputeOnChain(dispute.escrow_id, body.buyerPct);

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE disputes SET status = 'resolved', resolution = ?, buyer_pct = ?, resolved_at = ? WHERE id = ?`
    ).run(body.resolution || "", body.buyerPct, now, dispute.id);

    res.json({
      message: "Dispute resolved",
      txHash,
      buyerPct: body.buyerPct,
      sellerPct: 100 - body.buyerPct,
    });
  } catch (err) {
    return res.status(500).json({ error: "On-chain resolution failed" });
  }
});

export default router;
