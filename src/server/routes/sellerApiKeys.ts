import { Router } from "express";
import crypto from "crypto";
import { walletAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { getDb } from "../db/index.js";

const router = Router();

// Generate a new API key
router.post("/", walletAuth(), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;
  const name = req.body?.name || null;

  // Generate a random API key: "xng_" + 32 random hex chars
  const rawKey = `xng_${crypto.randomBytes(16).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12); // "xng_" + 8 chars
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.run(
    `INSERT INTO seller_api_keys (id, seller_address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sellerAddress, keyHash, keyPrefix, name, now]
  );

  res.json({ id, key: rawKey, keyPrefix, name, createdAt: now });
});

// List API keys for the connected wallet
router.get("/", walletAuth(), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;

  const keys = db
    .query(
      `SELECT id, key_prefix, name, created_at, last_used_at, revoked_at FROM seller_api_keys WHERE seller_address = ? AND revoked_at IS NULL ORDER BY created_at DESC`
    )
    .all(sellerAddress) as Array<{
    id: string;
    key_prefix: string;
    name: string | null;
    created_at: number;
    last_used_at: number | null;
    revoked_at: number | null;
  }>;

  res.json({
    keys: keys.map((k) => ({
      id: k.id,
      keyPrefix: k.key_prefix,
      name: k.name,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })),
  });
});

// Revoke an API key
router.delete("/:id", walletAuth(), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;
  const keyId = req.params.id as string;
  const now = Math.floor(Date.now() / 1000);

  const result = db.run(
    `UPDATE seller_api_keys SET revoked_at = ? WHERE id = ? AND seller_address = ? AND revoked_at IS NULL`,
    [now, keyId, sellerAddress]
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: "API key not found or already revoked" });
  }

  res.json({ success: true });
});

export default router;
