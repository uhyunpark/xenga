import { Router } from "express";
import { parseUnits, type Address } from "viem";
import { USDC_DECIMALS } from "../../shared/constants.js";
import { fundWallet } from "../facilitator/settler.js";

const router = Router();

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

// ──────────── Demo faucet ────────────
router.post("/fund", async (req, res) => {
  if (process.env.DEMO_MODE !== "true") {
    return res.status(403).json({ error: "Demo faucet is not enabled" });
  }

  const address = req.body?.address as Address;

  if (!address || !address.startsWith("0x")) {
    return res.status(400).json({ error: "Valid address is required" });
  }

  // Rate limit by IP + address
  const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown";
  const rateLimitKey = `${ip}:${address.toLowerCase()}`;
  const fundAmount = parseUnits("10", USDC_DECIMALS);

  if (!checkRateLimit(rateLimitKey, fundAmount)) {
    return res.status(429).json({
      error: "Rate limit exceeded: max 100 USDC per hour per address",
    });
  }

  try {
    const { usdcTx, ethTx } = await fundWallet(address);

    res.json({
      message: "Funded successfully: 10 USDC + 0.005 ETH",
      usdcTx,
      ethTx,
    });
  } catch (err) {
    console.error("[DemoFund] Failed:", err);
    res.status(500).json({
      error: "Funding failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
