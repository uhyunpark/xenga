import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getChainAdapter } from "@/lib/chain";
import { getTimeWindowedStats } from "@server/services/metricsService.js";

function serializeStats(stats: Record<string, bigint>) {
  return Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, String(v)])
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seller = searchParams.get("seller") || undefined;
  const serviceType = searchParams.get("serviceType") || undefined;
  const daysParam = searchParams.get("days") || "30";
  const days = parseInt(daysParam, 10);

  if (isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json(
      { error: "days must be between 1 and 365" },
      { status: 400 }
    );
  }

  try {
    const adapter = getChainAdapter();
    const allTime: Record<string, any> = {};

    if (seller) {
      allTime.sellerStats = serializeStats(
        await adapter.getSellerStats(seller as Address) as any
      );
    }
    if (serviceType) {
      allTime.serviceStats = serializeStats(
        await adapter.getServiceTypeStats(serviceType) as any
      );
    }

    const windowed = {
      days,
      stats: getTimeWindowedStats(days, seller, serviceType),
    };

    return NextResponse.json({ allTime, windowed });
  } catch (err) {
    console.error("[metrics] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
