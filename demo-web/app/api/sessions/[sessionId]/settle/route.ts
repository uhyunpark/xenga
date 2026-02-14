import { NextResponse } from "next/server";
import { getSession, getSessionUsage, updateSessionStatus } from "@server/services/sessionService.js";

/**
 * POST /api/sessions/:sessionId/settle
 * Trigger batch settlement — captures used amount and refunds remainder
 */
export async function POST(
  _request: Request,
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

  if (session.status !== "active") {
    return NextResponse.json(
      { error: `Session is already ${session.status}` },
      { status: 400 }
    );
  }

  // Mark session as settled
  updateSessionStatus(sessionId, "settled");

  const usage = getSessionUsage(sessionId);
  const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();

  return NextResponse.json({
    success: true,
    sessionId,
    settled: {
      totalCalls: usage.length,
      captured: session.used_amount,
      refunded: remaining,
      deposit: session.deposit_amount,
    },
  });
}
