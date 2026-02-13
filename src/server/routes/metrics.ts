import { Router } from "express";
import type { Address } from "viem";
import {
  getOnChainSellerStats,
  getOnChainServiceStats,
  getTimeWindowedStats,
} from "../services/metricsService.js";

const router = Router();

function serializeStats(stats: any) {
  return Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, String(v)])
  );
}

/**
 * GET /api/metrics/disputes?seller=0x...&serviceType=marketplace&days=30
 */
router.get("/disputes", async (req, res) => {
  try {
    const seller = req.query.seller as string | undefined;
    const serviceType = req.query.serviceType as string | undefined;
    const days = parseInt((req.query.days as string) || "30", 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: "days must be between 1 and 365" });
    }

    // On-chain all-time stats
    const allTime: Record<string, any> = {};

    if (seller) {
      allTime.sellerStats = serializeStats(
        await getOnChainSellerStats(seller as Address)
      );
    }
    if (serviceType) {
      allTime.serviceStats = serializeStats(
        await getOnChainServiceStats(serviceType)
      );
    }

    // Time-windowed stats from SQLite
    const windowed = {
      days,
      stats: getTimeWindowedStats(days, seller, serviceType),
    };

    res.json({ allTime, windowed });
  } catch (err: any) {
    console.error("[metrics] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

export default router;
