import { createPublicClient, http, type Address } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import {
  CHAIN,
  REPUTATION_CACHE_TTL_MS,
  REPUTATION_CACHE_MAX_SIZE,
} from "../../shared/constants.js";
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

// ──────────────────────── LRU Cache ────────────────────────

const CACHE_TTL_MS = REPUTATION_CACHE_TTL_MS;
const MAX_CACHE_SIZE = REPUTATION_CACHE_MAX_SIZE;

interface CacheEntry {
  data: ReputationScore;
  expiresAt: number;
}

/**
 * LRU cache: Map preserves insertion order; on access, we delete and re-insert
 * to move the entry to the end (most recently used). Eviction removes from the front.
 */
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Move to end (LRU: most recently used)
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry) {
  // If key already exists, delete first to refresh position
  cache.delete(key);
  // Evict least recently used (first entry) if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const lruKey = cache.keys().next().value;
    if (lruKey) cache.delete(lruKey);
  }
  cache.set(key, entry);
}

// Periodic expired-entry cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}, 5 * 60_000).unref();

// ──────────────────────── SQLite Queries ────────────────────────

interface DisputeOutcomes {
  wonCount: number;
  lostCount: number;
  partialCount: number;
  openCount: number;
  totalResolved: number;
  // legacy fields kept for backward compat computation
  frivolousCount: number;
  sellerFavorRate: number | null;
}

// SQL column names cannot be parameterized — two separate prepared statements required.

function getSellerDisputeOutcomes(sellerAddress: string): DisputeOutcomes {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct < 50  THEN 1 END) as wonCount,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct > 70  THEN 1 END) as lostCount,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct >= 50 AND d.buyer_pct <= 70 THEN 1 END) as partialCount,
        COUNT(CASE WHEN d.status='open' THEN 1 END) as openCount,
        COUNT(CASE WHEN d.status='resolved' THEN 1 END) as totalResolved,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct < 30 THEN 1 END) as frivolousCount,
        AVG(CASE WHEN d.status='resolved' AND d.buyer_pct <= 50 THEN 1.0 ELSE 0.0 END) as sellerFavorRate
      FROM disputes d
      JOIN orders o ON d.order_id = o.order_id
      WHERE LOWER(o.seller_address) = LOWER(?)`
    )
    .get(sellerAddress) as DisputeOutcomes | undefined;
  return row ?? {
    wonCount: 0, lostCount: 0, partialCount: 0, openCount: 0,
    totalResolved: 0, frivolousCount: 0, sellerFavorRate: null,
  };
}

function getBuyerDisputeOutcomes(buyerAddress: string): DisputeOutcomes {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct >= 50 THEN 1 END) as wonCount,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct < 30  THEN 1 END) as lostCount,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct >= 30 AND d.buyer_pct < 50 THEN 1 END) as partialCount,
        COUNT(CASE WHEN d.status='open' THEN 1 END) as openCount,
        COUNT(CASE WHEN d.status='resolved' THEN 1 END) as totalResolved,
        COUNT(CASE WHEN d.status='resolved' AND d.buyer_pct < 30 THEN 1 END) as frivolousCount,
        NULL as sellerFavorRate
      FROM disputes d
      JOIN orders o ON d.order_id = o.order_id
      WHERE LOWER(o.buyer_address) = LOWER(?)`
    )
    .get(buyerAddress) as DisputeOutcomes | undefined;
  return row ?? {
    wonCount: 0, lostCount: 0, partialCount: 0, openCount: 0,
    totalResolved: 0, frivolousCount: 0, sellerFavorRate: null,
  };
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

// Outcome-weighted dispute rates: won disputes penalize minimally; lost disputes penalize fully.
// Denominator is totalEscrows so the rate reflects overall trustworthiness, not just disputes.

function computeAdjustedSellerDisputeRate(
  outcomes: DisputeOutcomes,
  totalEscrows: number
): number {
  if (totalEscrows === 0) return 0;
  const weightedSum =
    outcomes.wonCount * 0.0 +    // seller won (buyerPct < 50): no penalty
    outcomes.partialCount * 0.3 + // partial (50 <= buyerPct <= 70): mild penalty
    outcomes.lostCount * 1.0 +    // seller at fault (buyerPct > 70): full penalty
    outcomes.openCount * 0.3;     // open dispute: provisional
  return weightedSum / totalEscrows;
}

function computeAdjustedBuyerDisputeRate(
  outcomes: DisputeOutcomes,
  totalEscrows: number
): number {
  if (totalEscrows === 0) return 0;
  const weightedSum =
    outcomes.wonCount * 0.0 +    // buyer won (buyerPct >= 50): vindicated, no penalty
    outcomes.partialCount * 0.3 + // partial (30 <= buyerPct < 50): mild penalty
    outcomes.lostCount * 1.0 +    // frivolous (buyerPct < 30): full penalty
    outcomes.openCount * 0.2;     // open dispute: provisional
  return weightedSum / totalEscrows;
}

function computeSellerScore(
  stats: Stats,
  adjustedDisputeRate: number
): number {
  const total = Number(stats.totalEscrows);
  if (total === 0) return 0;

  const completionRate = Number(stats.completedCount) / total;
  const refundRate = Number(stats.refundedCount) / total;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);

  return Math.round(
    completionRate * 40 +
      (1 - adjustedDisputeRate) * 35 +
      (1 - refundRate) * 15 +
      volumeBonus * 10
  );
}

function computeBuyerScore(
  stats: Stats,
  adjustedDisputeRate: number
): number {
  const total = Number(stats.totalEscrows);
  if (total === 0) return 0;

  // Exclude seller-initiated refunds from completion denominator
  const adjustedTotal = Math.max(1, total - Number(stats.refundedCount));
  const adjustedCompletionRate = Number(stats.completedCount) / adjustedTotal;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);

  return Math.round(
    adjustedCompletionRate * 45 +
      (1 - adjustedDisputeRate) * 45 +
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
  address: Address,
  options?: { skipCache?: boolean }
): Promise<ReputationScore> {
  const cacheKey = address.toLowerCase();
  if (!options?.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return cached.data;
    }
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
    const sellerOutcomes = getSellerDisputeOutcomes(address);
    const adjSellerRate = computeAdjustedSellerDisputeRate(
      sellerOutcomes,
      Number(sellerStats.totalEscrows)
    );
    // resolutionFairness kept for backward compat
    const resolutionFairness =
      sellerOutcomes.totalResolved > 0
        ? (sellerOutcomes.sellerFavorRate ?? 0)
        : 0.5;
    const total = Number(sellerStats.totalEscrows);

    seller = {
      score: computeSellerScore(sellerStats, adjSellerRate),
      completionRate: Number(sellerStats.completedCount) / total,
      disputeRate: Number(sellerStats.disputedCount) / total,
      refundRate: Number(sellerStats.refundedCount) / total,
      resolutionFairness,
      adjustedDisputeRate: adjSellerRate,
      wonDisputeCount: sellerOutcomes.wonCount,
      lostDisputeCount: sellerOutcomes.lostCount,
      partialDisputeCount: sellerOutcomes.partialCount,
      openDisputeCount: sellerOutcomes.openCount,
      totalVolume: sellerStats.totalAmount.toString(),
      totalEscrows: total,
      firstSeen: getFirstSeen(address, "seller"),
    };
    maxEscrows = Math.max(maxEscrows, total);
  }

  // Compute buyer reputation
  if (buyerStats && Number(buyerStats.totalEscrows) > 0) {
    const buyerOutcomes = getBuyerDisputeOutcomes(address);
    const adjBuyerRate = computeAdjustedBuyerDisputeRate(
      buyerOutcomes,
      Number(buyerStats.totalEscrows)
    );
    // frivolousDisputeRate kept for backward compat
    const frivolousDisputeRate =
      buyerOutcomes.totalResolved > 0
        ? buyerOutcomes.lostCount / buyerOutcomes.totalResolved
        : 0;
    const total = Number(buyerStats.totalEscrows);
    const adjustedTotal = Math.max(
      1,
      total - Number(buyerStats.refundedCount)
    );

    buyer = {
      score: computeBuyerScore(buyerStats, adjBuyerRate),
      disputeRate: Number(buyerStats.disputedCount) / total,
      frivolousDisputeRate,
      completionRate: Number(buyerStats.completedCount) / total,
      adjustedDisputeRate: adjBuyerRate,
      adjustedCompletionRate: Number(buyerStats.completedCount) / adjustedTotal,
      wonDisputeCount: buyerOutcomes.wonCount,
      lostDisputeCount: buyerOutcomes.lostCount,
      partialDisputeCount: buyerOutcomes.partialCount,
      openDisputeCount: buyerOutcomes.openCount,
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

  cacheSet(cacheKey, {
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
