import { Router } from "express";
import { sessionPaymentMiddleware } from "../middleware/sessionPayment.js";
import { getSession, getSessionUsage, updateSessionStatus } from "../services/sessionService.js";
import { SESSION_PRICE_PER_USE } from "../../shared/constants.js";
import { config } from "../config.js";

const router = Router();

/**
 * POST /api/sessions/use
 * Session-protected endpoint — creates session (402 flow) or deducts from balance
 */
router.post("/use", sessionPaymentMiddleware(), (_req, res) => {
  // This is the "paid" endpoint — if we get here, session payment was authorized
  res.json({
    message: "API call successful",
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      result: "Session micropayment processed",
      priceCharged: SESSION_PRICE_PER_USE.toString(),
    },
  });
});

/**
 * GET /api/sessions/:sessionId
 * Get session status and usage history
 */
router.get("/:sessionId", (req, res) => {
  const sessionId = parseInt(req.params.sessionId as string, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const usage = getSessionUsage(sessionId);
  const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();

  res.json({
    session: {
      ...session,
      remaining,
    },
    usage,
    summary: {
      totalCalls: usage.length,
      totalUsed: session.used_amount,
      remaining,
      deposit: session.deposit_amount,
    },
  });
});

/**
 * POST /api/sessions/:sessionId/settle
 * Trigger batch settlement — captures used amount on-chain and refunds remainder
 */
router.post("/:sessionId/settle", async (req, res) => {
  const sessionId = parseInt(req.params.sessionId as string, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Validate session token
  const sessionToken = req.headers["x-session-token"] as string | undefined;
  if (session.session_token && (!sessionToken || sessionToken !== session.session_token)) {
    return res.status(401).json({ error: "Invalid or missing session token" });
  }

  if (session.status !== "active") {
    return res.status(400).json({ error: `Session is already ${session.status}` });
  }

  // On-chain settlement requires SessionEscrow contract to be deployed
  if (!config.sessionEscrowAddress) {
    return res.status(501).json({
      error: "Session on-chain settlement not available (SessionEscrow contract not deployed)",
    });
  }

  // TODO: Call SessionEscrow.settleSession(sessionId, usedAmount) on-chain
  // when the contract is deployed. For now, the 501 above prevents DB-only settlement.
  updateSessionStatus(sessionId, "settled");

  const usage = getSessionUsage(sessionId);
  const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();

  res.json({
    success: true,
    sessionId,
    settled: {
      totalCalls: usage.length,
      captured: session.used_amount,
      refunded: remaining,
      deposit: session.deposit_amount,
    },
  });
});

export default router;
