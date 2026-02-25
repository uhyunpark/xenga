import { Router } from "express";
import crypto from "crypto";
import { SiweMessage } from "siwe";
import { SignJWT } from "jose";
import { config } from "../config.js";

const router = Router();

// Allowed SIWE domains (prevents cross-site replay attacks)
const ALLOWED_DOMAINS = (process.env.ALLOWED_ORIGINS || "localhost:3001,localhost:3000,xenga.io,www.xenga.xyz,xenga.xyz")
  .split(",")
  .map((d) => d.trim());

// In-memory nonce store: nonce → expiresAt (unix ms)
const nonceStore = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Lazy cleanup of expired nonces (runs on each nonce request)
function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiresAt] of nonceStore) {
    if (expiresAt < now) nonceStore.delete(nonce);
  }
}

// GET /api/auth/nonce — generate a one-time nonce
router.get("/nonce", (_req, res) => {
  cleanExpiredNonces();
  const nonce = crypto.randomBytes(16).toString("hex");
  nonceStore.set(nonce, Date.now() + NONCE_TTL_MS);
  res.json({ nonce });
});

// POST /api/auth/siwe — verify SIWE message + signature, return JWT
router.post("/siwe", async (req, res) => {
  const { message, signature } = req.body as { message: string; signature: string };

  if (!message || !signature) {
    return res.status(400).json({ error: "Missing message or signature" });
  }

  try {
    const siweMessage = new SiweMessage(message);

    // Verify the nonce exists and hasn't expired
    const nonceExpiry = nonceStore.get(siweMessage.nonce);
    if (!nonceExpiry || nonceExpiry < Date.now()) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    // Consume nonce (one-time use)
    nonceStore.delete(siweMessage.nonce);

    // Validate domain to prevent cross-site replay
    if (!ALLOWED_DOMAINS.includes(siweMessage.domain)) {
      return res.status(401).json({ error: "Invalid SIWE domain" });
    }

    // Verify signature
    const result = await siweMessage.verify({ signature });
    if (!result.success) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Issue JWT (24h expiry)
    const secret = new TextEncoder().encode(config.jwtSecret);
    const token = await new SignJWT({
      sub: siweMessage.address.toLowerCase(),
      chainId: siweMessage.chainId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);

    res.json({ token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SIWE verification failed";
    return res.status(401).json({ error: msg });
  }
});

export default router;
