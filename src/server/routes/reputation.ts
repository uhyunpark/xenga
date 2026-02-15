import { Router } from "express";
import { isAddress, type Address } from "viem";
import {
  computeReputation,
  computeReputationHistory,
} from "../services/reputationService.js";

const router = Router();

/**
 * GET /api/reputation/:address
 * Returns computed reputation score for any address
 */
router.get("/:address", async (req, res) => {
  try {
    const address = req.params.address as string;
    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const reputation = await computeReputation(address as Address);
    res.json(reputation);
  } catch (err: any) {
    console.error("[reputation] Error:", err.message);
    res.status(500).json({ error: "Failed to compute reputation" });
  }
});

/**
 * GET /api/reputation/:address/history?days=90&bucket=7
 * Returns time-windowed reputation history
 */
router.get("/:address/history", async (req, res) => {
  try {
    const address = req.params.address as string;
    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const days = parseInt((req.query.days as string) || "90", 10);
    const bucket = parseInt((req.query.bucket as string) || "7", 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: "days must be between 1 and 365" });
    }
    if (isNaN(bucket) || bucket < 1 || bucket > 30) {
      return res.status(400).json({ error: "bucket must be between 1 and 30" });
    }

    const history = computeReputationHistory(address, days, bucket);
    res.json({ address, days, bucket, history });
  } catch (err: any) {
    console.error("[reputation] History error:", err.message);
    res.status(500).json({ error: "Failed to compute reputation history" });
  }
});

export default router;
