import type { Request, Response, NextFunction } from "express";
import { verifyMessage, type Address } from "viem";
import { jwtVerify } from "jose";
import { config } from "../config.js";
import { hashApiKey } from "../routes/sellerApiKeys.js";
import { getDb } from "../db/index.js";

export interface AuthenticatedRequest extends Request {
  callerAddress?: Address;
}

/**
 * API key authentication middleware.
 * Checks `X-API-KEY` header against configured API_KEYS (env var, operator keys),
 * then falls back to `seller_api_keys` DB table (self-service keys).
 * If no API_KEYS are configured and no header is sent, requests pass through (open access).
 */
export function apiKeyAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-api-key"] as string | undefined;

    // Open mode: no env keys configured and no header sent → pass through
    if (config.apiKeys.length === 0 && !apiKey) return next();

    if (!apiKey) {
      return res.status(401).json({ error: "Missing X-API-KEY header" });
    }

    // Fast path: check env var keys first (operator keys, no callerAddress)
    if (config.apiKeys.includes(apiKey)) {
      return next();
    }

    // Fallback: check seller_api_keys DB table
    try {
      const keyHash = hashApiKey(apiKey);
      const row = getDb()
        .prepare(
          `SELECT seller_address FROM seller_api_keys WHERE key_hash = ? AND revoked_at IS NULL`
        )
        .get(keyHash) as { seller_address: string } | undefined;

      if (row) {
        req.callerAddress = row.seller_address as Address;
        // Fire-and-forget: update last_used_at
        getDb()
          .prepare(`UPDATE seller_api_keys SET last_used_at = ? WHERE key_hash = ?`)
          .run(Math.floor(Date.now() / 1000), keyHash);
        return next();
      }
    } catch (err) {
      return res.status(500).json({ error: "Internal error during API key validation" });
    }

    return res.status(403).json({ error: "Invalid API key" });
  };
}


export function walletAuth(getExpectedAddress?: (req: Request) => Address | undefined) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const walletAddress = req.headers["x-wallet-address"] as string | undefined;
    const signature = req.headers["x-wallet-signature"] as string | undefined;
    const timestamp = req.headers["x-wallet-timestamp"] as string | undefined;

    if (!walletAddress || !signature || !timestamp) {
      return res.status(401).json({ error: "Missing authentication headers: X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP" });
    }

    // Replay protection: reject if timestamp older than 5 minutes
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return res.status(401).json({ error: "Authentication timestamp expired or invalid" });
    }

    // Reconstruct the message that was signed.
    // Use route params when available; fall back to originalUrl (full path)
    // for routes that don't have :orderId/:disputeId (e.g. /api/sellers).
    // Note: req.path is relative to the mount point, but the client signs the full path.
    const routeId = req.params.orderId || req.params.disputeId || req.originalUrl.split("?")[0];
    const message = `xenga-auth:${routeId}:${timestamp}`;

    try {
      const valid = await verifyMessage({
        address: walletAddress as Address,
        message,
        signature: signature as `0x${string}`,
      });

      if (!valid) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      req.callerAddress = walletAddress as Address;

      // Optional: verify caller matches expected address
      if (getExpectedAddress) {
        const expected = getExpectedAddress(req);
        if (expected && req.callerAddress.toLowerCase() !== expected.toLowerCase()) {
          return res.status(403).json({ error: "Unauthorized: address mismatch" });
        }
      }

      next();
    } catch {
      return res.status(401).json({ error: "Signature verification failed" });
    }
  };
}

/**
 * Session-based authentication middleware (SIWE JWT).
 * Reads `Authorization: Bearer <jwt>`, verifies it, sets req.callerAddress.
 */
export function sessionAuth() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.sub) {
        return res.status(401).json({ error: "Invalid token: missing subject" });
      }

      req.callerAddress = payload.sub as Address;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }
  };
}

/**
 * Combined middleware: accepts either API key or session token.
 * Replaces apiKeyOrWalletAuth() for dashboard routes.
 */
export function apiKeyOrSessionAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.headers["x-api-key"]) {
      return apiKeyAuth()(req, res, next);
    }
    if (req.headers.authorization?.startsWith("Bearer ")) {
      return sessionAuth()(req, res, next);
    }
    if (config.apiKeys.length === 0) {
      return next(); // Open mode
    }
    res.status(401).json({ error: "Authentication required (API key or session token)" });
  };
}
