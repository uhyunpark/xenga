import { NextResponse } from "next/server";
import { getSession, getSessionUsage, updateSessionStatus } from "@server/services/sessionService.js";
import { getChainAdapter } from "@/lib/chain";

/**
 * POST /api/sessions/:sessionId/settle
 * Trigger batch settlement — captures used amount on-chain and refunds remainder
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
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Validate session token
  const sessionToken = request.headers.get("x-session-token");
  if (session.session_token && (!sessionToken || sessionToken !== session.session_token)) {
    return NextResponse.json({ error: "Invalid or missing session token" }, { status: 401 });
  }

  if (session.status !== "active") {
    return NextResponse.json(
      { error: `Session is already ${session.status}` },
      { status: 400 }
    );
  }

  try {
    // Settle on-chain: capture used amount, refund remainder to buyer
    const finalAmount = BigInt(session.used_amount);
    const txHash = await getChainAdapter().settleSession(sessionId, finalAmount);

    // Only update DB after successful on-chain settlement
    updateSessionStatus(sessionId, "settled");

    const usage = getSessionUsage(sessionId);
    const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();

    return NextResponse.json({
      success: true,
      sessionId,
      txHash,
      settled: {
        totalCalls: usage.length,
        captured: session.used_amount,
        refunded: remaining,
        deposit: session.deposit_amount,
      },
    });
  } catch (err) {
    console.error("[SessionSettle] On-chain settlement failed:", err);
    return NextResponse.json(
      { error: "On-chain settlement failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
