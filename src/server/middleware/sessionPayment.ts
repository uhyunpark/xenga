import type { Request, Response, NextFunction } from "express";
import type { SessionPaymentPayload, SessionPaymentRequired } from "../../shared/types.js";
import { SESSION_PRICE_PER_USE, DEFAULT_SESSION_DURATION, DEFAULT_SESSION_DEPOSIT } from "../../shared/constants.js";
import { config } from "../config.js";
import { getSession, recordUsage, updateSessionStatus } from "../services/sessionService.js";

/**
 * Session Payment Middleware — authorize-once, use-many pattern
 *
 * Flow A (no X-SESSION-ID): Session creation via 402 flow
 * Flow B (with X-SESSION-ID): Session usage — deducts from balance, no signing needed
 */
export function sessionPaymentMiddleware(pricePerUse: bigint = BigInt(SESSION_PRICE_PER_USE)) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionIdHeader = req.headers["x-session-id"] as string | undefined;

    if (sessionIdHeader) {
      // ─── Flow B: Session Usage ───
      const sessionId = parseInt(sessionIdHeader, 10);
      if (isNaN(sessionId)) {
        return res.status(400).json({ error: "Invalid X-SESSION-ID" });
      }

      const session = getSession(sessionId);
      if (!session || session.status !== "active") {
        return res.status(401).json({ error: "Invalid or inactive session" });
      }

      // Validate session token
      const sessionToken = req.headers["x-session-token"] as string | undefined;
      if (session.session_token && (!sessionToken || sessionToken !== session.session_token)) {
        return res.status(401).json({ error: "Invalid or missing session token" });
      }

      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (now > session.expires_at) {
        updateSessionStatus(sessionId, "expired");
        return res.status(401).json({ error: "Session expired" });
      }

      // Check balance
      const remaining = BigInt(session.deposit_amount) - BigInt(session.used_amount);
      if (remaining < pricePerUse) {
        return res.status(402).json({
          error: "Insufficient session balance",
          remaining: remaining.toString(),
          pricePerUse: pricePerUse.toString(),
        });
      }

      // Record usage
      const result = recordUsage(sessionId, pricePerUse.toString(), req.path);

      // Set balance header for client
      res.setHeader("X-SESSION-BALANCE", result.remaining);
      res.setHeader("X-SESSION-USED", result.usedAmount);

      return next();
    }

    // ─── Flow A: Session Creation (402 flow) ───
    if (!config.sessionEscrowAddress) {
      return res.status(501).json({ error: "Session escrow not configured" });
    }

    const paymentHeader = (req.headers["payment-signature"] ?? req.headers["x-payment"]) as string | undefined;

    if (!paymentHeader) {
      // Return 402 with session-escrow requirements
      const sessionRequired: SessionPaymentRequired = {
        scheme: "session-escrow",
        network: "base-sepolia",
        sessionContract: config.sessionEscrowAddress,
        asset: config.usdcAddress,
        maxAmount: DEFAULT_SESSION_DEPOSIT.toString(),
        sellerAddress: config.sessionEscrowAddress, // seller is the service itself
        duration: DEFAULT_SESSION_DURATION,
        pricePerUse: pricePerUse.toString(),
      };

      const paymentRequirements = [sessionRequired];
      const encodedArray = Buffer.from(JSON.stringify(paymentRequirements)).toString("base64");
      const encodedSingle = Buffer.from(JSON.stringify(sessionRequired)).toString("base64");

      res.setHeader("PAYMENT-REQUIRED", encodedArray);
      res.setHeader("X-PAYMENT-REQUIRED", encodedSingle);
      return res.status(402).json({
        error: "Session payment required",
        paymentRequired: sessionRequired,
        paymentRequirements,
      });
    }

    // Session creation with signed payload is handled by the session routes
    // This middleware only handles session usage (Flow B)
    return next();
  };
}
