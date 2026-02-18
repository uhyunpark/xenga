import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { computeReputation } from "@server/services/reputationService.js";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "true";
    const reputation = await computeReputation(address as Address, { skipCache: fresh });
    return NextResponse.json(reputation);
  } catch (err) {
    console.error("[reputation] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute reputation" },
      { status: 500 }
    );
  }
}
