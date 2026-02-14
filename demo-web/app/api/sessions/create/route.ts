import { NextResponse } from "next/server";
import type { SessionPaymentPayload, SessionPaymentRequired } from "@shared/types.js";
import { config } from "@server/config.js";
import { SESSION_PRICE_PER_USE, DEFAULT_SESSION_DURATION, DEFAULT_SESSION_DEPOSIT } from "@shared/constants.js";
import { createSession } from "@server/services/sessionService.js";
import { getChainAdapter } from "@/lib/chain";

/**
 * POST /api/sessions/create
 * Session creation via 402 flow:
 * - No payment header → 402 with session-escrow requirements
 * - With payment header → create session on-chain + in DB
 */
export async function POST(request: Request) {
  const paymentHeader =
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment");

  if (!paymentHeader) {
    // Return 402 with session-escrow requirements
    const sellerAddress = config.sessionEscrowAddress ?? config.escrowVaultAddress;

    const sessionRequired: SessionPaymentRequired = {
      scheme: "session-escrow",
      network: "base-sepolia",
      sessionContract: sellerAddress,
      asset: config.usdcAddress,
      maxAmount: DEFAULT_SESSION_DEPOSIT.toString(),
      sellerAddress: sellerAddress,
      duration: DEFAULT_SESSION_DURATION,
      pricePerUse: SESSION_PRICE_PER_USE.toString(),
    };

    const paymentRequirements = [sessionRequired];
    const encodedArray = Buffer.from(JSON.stringify(paymentRequirements)).toString("base64");
    const encodedSingle = Buffer.from(JSON.stringify(sessionRequired)).toString("base64");

    return NextResponse.json(
      {
        error: "Session payment required",
        paymentRequired: sessionRequired,
        paymentRequirements,
      },
      {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodedArray,
          "X-PAYMENT-REQUIRED": encodedSingle,
        },
      }
    );
  }

  // Parse payment payload
  let payload: SessionPaymentPayload;
  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    payload = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: "Invalid payment header" }, { status: 400 });
  }

  if (payload.scheme !== "session-escrow") {
    return NextResponse.json(
      { error: `Unsupported scheme: ${payload.scheme}` },
      { status: 400 }
    );
  }

  try {
    // Create session via chain adapter (on-chain or mock)
    const { txHash, sessionId, expiresAt } = await getChainAdapter().createSession(payload);

    // Record in DB
    createSession(
      sessionId,
      payload.from,
      payload.sellerAddress,
      payload.value,
      SESSION_PRICE_PER_USE.toString(),
      expiresAt,
      txHash
    );

    const response = {
      success: true,
      txHash,
      sessionId,
      expiresAt,
      deposit: payload.value,
      pricePerUse: SESSION_PRICE_PER_USE.toString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[SessionCreate] Failed:", err);
    return NextResponse.json(
      { error: "Session creation failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
