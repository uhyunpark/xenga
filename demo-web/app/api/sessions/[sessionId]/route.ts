import { NextResponse } from "next/server";
import { getSession, getSessionUsage } from "@server/services/sessionService.js";

/**
 * GET /api/sessions/:sessionId
 * Get session status and usage history
 */
export async function GET(
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

  const usage = getSessionUsage(sessionId);
  const remaining = (BigInt(session.deposit_amount) - BigInt(session.used_amount)).toString();

  return NextResponse.json({
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
}
