import { NextResponse } from "next/server";
import { parseUnits, type Address } from "viem";
import { USDC_DECIMALS } from "@shared/constants.js";
import { getChainAdapter } from "@/lib/chain";

// Rate limiting: IP+address -> { amount: bigint, resetAt: number }
const rateLimitMap = new Map<string, { amount: bigint; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const RATE_LIMIT_AMOUNT = parseUnits("100", USDC_DECIMALS); // 100 USDC

function checkRateLimit(key: string, requestAmount: bigint): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { amount: requestAmount, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.amount + requestAmount > RATE_LIMIT_AMOUNT) {
    return false;
  }

  entry.amount += requestAmount;
  return true;
}

export async function POST(request: Request) {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo faucet is not enabled" }, { status: 403 });
  }

  const body = await request.json();
  const address = body.address as Address;

  if (!address || !address.startsWith("0x")) {
    return NextResponse.json({ error: "Valid address is required" }, { status: 400 });
  }

  // Rate limit by IP + address
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rateLimitKey = `${ip}:${address.toLowerCase()}`;
  const fundAmount = parseUnits("10", USDC_DECIMALS);

  if (!checkRateLimit(rateLimitKey, fundAmount)) {
    return NextResponse.json(
      { error: "Rate limit exceeded: max 100 USDC per hour per address" },
      { status: 429 }
    );
  }

  try {
    const { usdcTx, ethTx } = await getChainAdapter().fundWallet(address);

    return NextResponse.json({
      message: "Funded successfully: 10 USDC + 0.005 ETH",
      usdcTx,
      ethTx,
    });
  } catch (err) {
    console.error("[DemoFund] Failed:", err);
    return NextResponse.json(
      { error: "Funding failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
