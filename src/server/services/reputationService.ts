import { createPublicClient, http, type Address } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import { CHAIN } from "../../shared/constants.js";
import type {
  Stats,
  ReputationScore,
  SellerReputation,
  BuyerReputation,
} from "../../shared/types.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

// ──────────────────────── Public Client ────────────────────────

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient)
    _publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(config.rpcUrl),
    });
  return _publicClient;
};

// ──────────────────────── On-Chain Readers ────────────────────────

function toStats(raw: any): Stats {
  return {
    totalEscrows: BigInt(raw.totalEscrows ?? raw[0] ?? 0),
    totalAmount: BigInt(raw.totalAmount ?? raw[1] ?? 0),
    completedCount: BigInt(raw.completedCount ?? raw[2] ?? 0),
    completedAmount: BigInt(raw.completedAmount ?? raw[3] ?? 0),
    disputedCount: BigInt(raw.disputedCount ?? raw[4] ?? 0),
    disputedAmount: BigInt(raw.disputedAmount ?? raw[5] ?? 0),
    resolvedCount: BigInt(raw.resolvedCount ?? raw[6] ?? 0),
    refundedCount: BigInt(raw.refundedCount ?? raw[7] ?? 0),
    refundedAmount: BigInt(raw.refundedAmount ?? raw[8] ?? 0),
  };
}

export async function getOnChainBuyerStats(
  buyer: Address
): Promise<Stats> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getBuyerStats",
    args: [buyer],
  });
  return toStats(result);
}

export async function getOnChainSellerStats(
  seller: Address
): Promise<Stats> {
  const result = await getPublicClient().readContract({
    address: config.escrowVaultAddress,
    abi: escrowVaultAbi,
    functionName: "getSellerStats",
    args: [seller],
  });
  return toStats(result);
}

// ──────────────────────── Cache ────────────────────────

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_SIZE = 1000;
const cache = new Map<
  string,
  { data: ReputationScore; expiresAt: number }
>();

// Periodic cache cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}, 5 * 60_000).unref();

// ──────────────────────── SQLite Queries ────────────────────────

interface ResolutionRow {
  sellerFavorRate: number | null;
  resolvedCount: number;
}

function getSellerResolutionFairness(sellerAddress: string): ResolutionRow {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        AVG(CASE WHEN d.buyer_pct <= 50 THEN 1.0 ELSE 0.0 END) as sellerFavorRate,
        COUNT(*) as resolvedCount
      FROM disputes d
      JOIN orders o ON d.order_id = o.order_id
      WHERE d.status = 'resolved'
        AND LOWER(o.seller_address) = LOWER(?)`
    )
    .get(sellerAddress) as ResolutionRow | undefined;
  return row ?? { sellerFavorRate: null, resolvedCount: 0 };
}

interface FrivolousRow {
  frivolousCount: number;
  totalResolved: number;
}

function getBuyerFrivolousDisputeRate(buyerAddress: string): FrivolousRow {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(CASE WHEN d.buyer_pct < 30 THEN 1 END) as frivolousCount,
        COUNT(*) as totalResolved
      FROM disputes d
      JOIN orders o ON d.order_id = o.order_id
      WHERE d.status = 'resolved'
        AND LOWER(o.buyer_address) = LOWER(?)`
    )
    .get(buyerAddress) as FrivolousRow | undefined;
  return row ?? { frivolousCount: 0, totalResolved: 0 };
}

function getFirstSeen(
  address: string,
  role: "seller" | "buyer"
): number {
  const db = getDb();
  const col =
    role === "seller" ? "seller_address" : "buyer_address";
  const row = db
    .prepare(
      `SELECT MIN(created_at) as firstSeen FROM orders WHERE LOWER(${col}) = LOWER(?)`
    )
    .get(address) as { firstSeen: number | null } | undefined;
  return row?.firstSeen ?? 0;
}

// ──────────────────────── Scoring ────────────────────────

function computeVolumeBonus(totalAmount: bigint): number {
  // 0 at 1 USDC, 10 at 1000 USDC (log-scaled)
  const usdc = Number(totalAmount) / 1e6;
  if (usdc <= 0) return 0;
  return Math.min(10, Math.log10(usdc) * 3.33);
}

function computeSellerScore(
  stats: Stats,
  resolutionFairness: number
): number {
  const total = Number(stats.totalEscrows);
  if (total === 0) return 0;

  const completionRate =
    Number(stats.completedCount) / total;
  const disputeRate =
    Number(stats.disputedCount) / total;
  const refundRate =
    Number(stats.refundedCount) / total;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);

  return Math.round(
    completionRate * 40 +
      (1 - disputeRate) * 25 +
      (1 - refundRate) * 15 +
      resolutionFairness * 10 +
      volumeBonus * 10
  );
}

function computeBuyerScore(
  stats: Stats,
  frivolousDisputeRate: number
): number {
  const total = Number(stats.totalEscrows);
  if (total === 0) return 0;

  const completionRate =
    Number(stats.completedCount) / total;
  const disputeRate =
    Number(stats.disputedCount) / total;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);

  return Math.round(
    completionRate * 45 +
      (1 - disputeRate) * 25 +
      (1 - frivolousDisputeRate) * 20 +
      volumeBonus * 10
  );
}

function getConfidence(
  totalEscrows: number
): "low" | "medium" | "high" {
  if (totalEscrows < 3) return "low";
  if (totalEscrows < 10) return "medium";
  return "high";
}

// ──────────────────────── Main API ────────────────────────

export async function computeReputation(
  address: Address
): Promise<ReputationScore> {
  const cacheKey = address.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch on-chain stats in parallel
  const [sellerStats, buyerStats] = await Promise.all([
    getOnChainSellerStats(address).catch(() => null),
    getOnChainBuyerStats(address).catch(() => null),
  ]);

  let seller: SellerReputation | undefined;
  let buyer: BuyerReputation | undefined;
  let maxEscrows = 0;

  // Compute seller reputation
  if (sellerStats && Number(sellerStats.totalEscrows) > 0) {
    const resolution = getSellerResolutionFairness(address);
    const resolutionFairness =
      resolution.resolvedCount > 0
        ? (resolution.sellerFavorRate ?? 0)
        : 0.5; // neutral default
    const total = Number(sellerStats.totalEscrows);

    seller = {
      score: computeSellerScore(sellerStats, resolutionFairness),
      completionRate: Number(sellerStats.completedCount) / total,
      disputeRate: Number(sellerStats.disputedCount) / total,
      refundRate: Number(sellerStats.refundedCount) / total,
      resolutionFairness,
      totalVolume: sellerStats.totalAmount.toString(),
      totalEscrows: total,
      firstSeen: getFirstSeen(address, "seller"),
    };
    maxEscrows = Math.max(maxEscrows, total);
  }

  // Compute buyer reputation
  if (buyerStats && Number(buyerStats.totalEscrows) > 0) {
    const frivolous = getBuyerFrivolousDisputeRate(address);
    const frivolousRate =
      frivolous.totalResolved > 0
        ? frivolous.frivolousCount / frivolous.totalResolved
        : 0;
    const total = Number(buyerStats.totalEscrows);

    buyer = {
      score: computeBuyerScore(buyerStats, frivolousRate),
      disputeRate: Number(buyerStats.disputedCount) / total,
      frivolousDisputeRate: frivolousRate,
      completionRate: Number(buyerStats.completedCount) / total,
      totalVolume: buyerStats.totalAmount.toString(),
      totalEscrows: total,
      firstSeen: getFirstSeen(address, "buyer"),
    };
    maxEscrows = Math.max(maxEscrows, total);
  }

  // Overall = weighted average of available scores
  let overall = 0;
  if (seller && buyer) {
    overall = Math.round((seller.score + buyer.score) / 2);
  } else if (seller) {
    overall = seller.score;
  } else if (buyer) {
    overall = buyer.score;
  }

  const result: ReputationScore = {
    address,
    overall,
    confidence: getConfidence(maxEscrows),
    seller,
    buyer,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  // Evict oldest entry if cache is at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

// ──────────────────────── History ────────────────────────

export interface ReputationHistoryPoint {
  timestamp: number;
  totalEscrows: number;
  completedCount: number;
  disputedCount: number;
  disputeRate: number;
}

export function computeReputationHistory(
  address: string,
  days: number = 90,
  bucketDays: number = 7
): ReputationHistoryPoint[] {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - days * 86400;

  // Get all orders for this address (as buyer or seller) since cutoff
  const rows = db
    .prepare(
      `SELECT created_at, status
       FROM orders
       WHERE (LOWER(seller_address) = LOWER(?) OR LOWER(buyer_address) = LOWER(?))
         AND created_at > ?
       ORDER BY created_at ASC`
    )
    .all(address, address, cutoff) as {
    created_at: number;
    status: string;
  }[];

  const buckets: ReputationHistoryPoint[] = [];
  let bucketStart = cutoff;

  while (bucketStart < now) {
    const bucketEnd = bucketStart + bucketDays * 86400;
    const bucketOrders = rows.filter(
      (r) => r.created_at >= bucketStart && r.created_at < bucketEnd
    );

    const totalEscrows = bucketOrders.length;
    const completedCount = bucketOrders.filter(
      (r) => r.status === "completed"
    ).length;
    const disputedCount = bucketOrders.filter(
      (r) => r.status === "disputed" || r.status === "resolved"
    ).length;

    buckets.push({
      timestamp: bucketStart,
      totalEscrows,
      completedCount,
      disputedCount,
      disputeRate:
        totalEscrows > 0 ? disputedCount / totalEscrows : 0,
    });

    bucketStart = bucketEnd;
  }

  return buckets;
}
