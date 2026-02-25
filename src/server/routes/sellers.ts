import { Router } from "express";
import { isAddress, type Address } from "viem";
import { walletAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getDb } from "../db/index.js";

const router = Router();

interface Seller {
  address: string;
  name: string | null;
  registeredAt: number;
}

function toSeller(row: any): Seller {
  return {
    address: row.address,
    name: row.name,
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
  walletAuth(),
  (req: AuthenticatedRequest, res) => {
    const address = req.callerAddress!;
    const { name } = req.body as { name?: string };

    if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
      return res.status(400).json({ error: "Name must be a string under 100 characters" });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO sellers (address, name, registered_at)
       VALUES (?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET name = excluded.name`
    ).run(address, name?.trim() || null, now);

    const seller = db.prepare("SELECT * FROM sellers WHERE address = ?").get(address);

    res.json(toSeller(seller));
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
  const addr = req.params.address as string;
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
