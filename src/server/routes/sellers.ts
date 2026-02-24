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
 * Register as a seller. Requires wallet signature authentication.
 * Body: { name? }
 */
router.post(
  "/",
  walletAuth(),
  (req: AuthenticatedRequest, res) => {
    const address = req.callerAddress!;
    const { name } = req.body as { name?: string };

    if (name && name.length > 100) {
      return res.status(400).json({ error: "Name must be 100 characters or fewer" });
    }

    const db = getDb();
    const existing = db.prepare("SELECT * FROM sellers WHERE address = ?").get(address);
    if (existing) {
      return res.status(409).json({ error: "Seller already registered", seller: toSeller(existing) });
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("INSERT INTO sellers (address, name, registered_at) VALUES (?, ?, ?)").run(
      address,
      name ?? null,
      now
    );

    res.status(201).json({
      seller: { address, name: name ?? null, registeredAt: now },
    });
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
