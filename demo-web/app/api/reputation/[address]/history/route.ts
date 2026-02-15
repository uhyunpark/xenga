import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { computeReputationHistory } from "@server/services/reputationService.js";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "90", 10);
  const bucket = parseInt(searchParams.get("bucket") || "7", 10);

  if (isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json(
      { error: "days must be between 1 and 365" },
      { status: 400 }
    );
  }
  if (isNaN(bucket) || bucket < 1 || bucket > 30) {
    return NextResponse.json(
      { error: "bucket must be between 1 and 30" },
      { status: 400 }
    );
  }

  try {
    const history = computeReputationHistory(address, days, bucket);
    return NextResponse.json({ address, days, bucket, history });
  } catch (err) {
    console.error("[reputation] History error:", err);
    return NextResponse.json(
      { error: "Failed to compute reputation history" },
      { status: 500 }
    );
  }
}
