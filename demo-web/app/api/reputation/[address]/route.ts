import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { computeReputation } from "@server/services/reputationService.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const reputation = await computeReputation(address as Address);
    return NextResponse.json(reputation);
  } catch (err) {
    console.error("[reputation] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute reputation" },
      { status: 500 }
    );
  }
}
