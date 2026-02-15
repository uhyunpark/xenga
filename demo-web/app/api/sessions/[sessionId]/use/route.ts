import { NextResponse } from "next/server";
import { SESSION_PRICE_PER_USE } from "@shared/constants.js";
import { getSession, recordUsage, updateSessionStatus } from "@server/services/sessionService.js";

/**
 * POST /api/sessions/:sessionId/use
 * Use a session — deducts pricePerUse from balance
 * Requires X-SESSION-ID header matching the sessionId param
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: sessionIdStr } = await params;
  const sessionId = parseInt(sessionIdStr, 10);

  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Invalid or inactive session" }, { status: 401 });
  }

  // Validate session token
  const sessionToken = request.headers.get("x-session-token");
  if (session.session_token && (!sessionToken || sessionToken !== session.session_token)) {
    return NextResponse.json({ error: "Invalid or missing session token" }, { status: 401 });
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (now > session.expires_at) {
    updateSessionStatus(sessionId, "expired");
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  // Check balance
  const pricePerUse = BigInt(SESSION_PRICE_PER_USE);
  const remaining = BigInt(session.deposit_amount) - BigInt(session.used_amount);
  if (remaining < pricePerUse) {
    return NextResponse.json(
      {
        error: "Insufficient session balance",
        remaining: remaining.toString(),
        pricePerUse: pricePerUse.toString(),
      },
      { status: 402 }
    );
  }

  // Record usage
  const result = recordUsage(sessionId, pricePerUse.toString(), "/api/sessions/use");

  return NextResponse.json(
    {
      message: "API call successful",
      timestamp: now,
      data: {
        result: "Session micropayment processed",
        priceCharged: pricePerUse.toString(),
      },
      balance: {
        used: result.usedAmount,
        remaining: result.remaining,
      },
    },
    {
      headers: {
        "X-SESSION-BALANCE": result.remaining,
        "X-SESSION-USED": result.usedAmount,
      },
    }
  );
}
