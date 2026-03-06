import { Router } from "express";
import { isAddress, type Address } from "viem";
import { sessionAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getDb } from "../db/index.js";

const router = Router();

interface Seller {
  address: string;
  name: string | null;
  payoutAddress: string | null;
  registeredAt: number;
}

function toSeller(row: any): Seller {
  return {
    address: row.address,
    name: row.name,
    payoutAddress: row.payout_address || null,
    registeredAt: row.registered_at,
  };
}

/**
 * POST /api/sellers
 *
 * Register or update seller profile. Requires wallet signature authentication.
 * Uses upsert: first call creates, subsequent calls update name.
 * Body: { name? }
 */
router.post(
  "/",
  sessionAuth(),
  (req: AuthenticatedRequest, res) => {
    const address = req.callerAddress!.toLowerCase();
    const { name, payoutAddress } = req.body as { name?: string; payoutAddress?: string };

    if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
      return res.status(400).json({ error: "Name must be a string under 100 characters" });
    }

    if (payoutAddress !== undefined && payoutAddress !== "" && !isAddress(payoutAddress)) {
      return res.status(400).json({ error: "Invalid payout address" });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const normalizedPayout = payoutAddress ? payoutAddress.toLowerCase() : null;

    db.prepare(
      `INSERT INTO sellers (address, name, payout_address, registered_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET name = excluded.name, payout_address = excluded.payout_address`
    ).run(address, name?.trim() || null, normalizedPayout, now);

    const seller = db.prepare("SELECT * FROM sellers WHERE address = ?").get(address);

    res.json({ seller: toSeller(seller) });
  }
);

/**
 * GET /api/sellers
 *
 * List registered sellers.
 */
router.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM sellers ORDER BY registered_at DESC LIMIT 100").all();
  res.json({ sellers: rows.map(toSeller) });
});

/**
 * GET /api/sellers/:address
 *
 * Get seller profile by address.
 */
router.get("/:address", (req, res) => {
  const addr = (req.params.address as string).toLowerCase();
  if (!isAddress(addr)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  const db = getDb();
  const row = db.prepare("SELECT * FROM sellers WHERE address = ?").get(addr);
  if (!row) {
    return res.status(404).json({ error: "Seller not found" });
  }

  res.json({ seller: toSeller(row) });
});

export default router;
