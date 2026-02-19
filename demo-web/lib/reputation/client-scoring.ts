// Client-side reputation scoring — mirrors src/server/services/reputationService.ts (lines 176-234)
// Pure functions, no API calls. Used by the Trust Building demo scenario.

export interface SimulatedStats {
  totalEscrows: number;
  completedCount: number;
  disputedCount: number;
  refundedCount: number;
  totalAmount: number; // human USDC (e.g. 3.0 = 3 USDC)
}

export type RoundOutcome = "completed" | "disputed" | "refunded";

export interface RoundDefinition {
  label: string;
  description: string;
  outcome: RoundOutcome;
  amount: number; // USDC
  buyerPct?: number; // for disputed rounds: arbiter's buyer percentage
}

export interface RoundSnapshot {
  round: number;
  definition: RoundDefinition;
  buyerStats: SimulatedStats;
  sellerStats: SimulatedStats;
  buyerScore: number; // clamped 0-100
  sellerScore: number; // clamped 0-100
  buyerDelta: number; // from raw unclamped scores
  sellerDelta: number;
  confidence: "low" | "medium" | "high";
  windowTier: "high" | "default" | "low";
  windowLabel: string;
}

// ── Scoring functions (mirror server exactly) ──

function computeVolumeBonus(usdc: number): number {
  if (usdc <= 0) return 0;
  return Math.min(10, Math.log10(usdc) * 3.33);
}

function computeSellerScoreRaw(
  stats: SimulatedStats,
  resolutionFairness: number
): number {
  if (stats.totalEscrows === 0) return 0;
  const completionRate = stats.completedCount / stats.totalEscrows;
  const disputeRate = stats.disputedCount / stats.totalEscrows;
  const refundRate = stats.refundedCount / stats.totalEscrows;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);
  return Math.round(
    completionRate * 40 +
      (1 - disputeRate) * 25 +
      (1 - refundRate) * 15 +
      resolutionFairness * 10 +
      volumeBonus * 10
  );
}

function computeBuyerScoreRaw(
  stats: SimulatedStats,
  frivolousDisputeRate: number
): number {
  if (stats.totalEscrows === 0) return 0;
  const completionRate = stats.completedCount / stats.totalEscrows;
  const disputeRate = stats.disputedCount / stats.totalEscrows;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);
  return Math.round(
    completionRate * 45 +
      (1 - disputeRate) * 25 +
      (1 - frivolousDisputeRate) * 20 +
      volumeBonus * 10
  );
}

export function getConfidence(
  totalEscrows: number
): "low" | "medium" | "high" {
  if (totalEscrows < 3) return "low";
  if (totalEscrows < 10) return "medium";
  return "high";
}

// Mirrors agent-service.ts adjustParams logic
export function getReleaseWindowTier(
  buyerScore: number,
  sellerScore: number,
  buyerConf: "low" | "medium" | "high",
  sellerConf: "low" | "medium" | "high"
): { tier: "high" | "default" | "low"; label: string } {
  if (
    buyerScore >= 80 &&
    sellerScore >= 80 &&
    buyerConf === "high" &&
    sellerConf === "high"
  ) {
    return { tier: "high", label: "30 min (high trust)" };
  }
  if (sellerScore < 40 && sellerConf !== "low") {
    return { tier: "low", label: "4 hours (low trust)" };
  }
  return { tier: "default", label: "1 hour (default)" };
}

// ── Simulation runner ──

export function simulateRounds(rounds: RoundDefinition[]): RoundSnapshot[] {
  const snapshots: RoundSnapshot[] = [];
  const buyerStats: SimulatedStats = {
    totalEscrows: 0,
    completedCount: 0,
    disputedCount: 0,
    refundedCount: 0,
    totalAmount: 0,
  };
  const sellerStats: SimulatedStats = { ...buyerStats };
  const resolvedDisputes: { buyerPct: number }[] = [];
  let prevRawBuyer = 0;
  let prevRawSeller = 0;

  for (let i = 0; i < rounds.length; i++) {
    const def = rounds[i];

    // Accumulate stats
    buyerStats.totalEscrows++;
    sellerStats.totalEscrows++;
    buyerStats.totalAmount += def.amount;
    sellerStats.totalAmount += def.amount;

    if (def.outcome === "completed") {
      buyerStats.completedCount++;
      sellerStats.completedCount++;
    } else if (def.outcome === "disputed") {
      buyerStats.disputedCount++;
      sellerStats.disputedCount++;
      resolvedDisputes.push({ buyerPct: def.buyerPct ?? 50 });
    } else if (def.outcome === "refunded") {
      sellerStats.refundedCount++;
    }

    // Compute resolution fairness (seller-favor rate among resolved disputes)
    const resolutionFairness =
      resolvedDisputes.length > 0
        ? resolvedDisputes.filter((d) => d.buyerPct <= 50).length /
          resolvedDisputes.length
        : 0.5; // neutral default when no disputes

    // Compute frivolous dispute rate (buyer got < 30%)
    const frivolousDisputeRate =
      resolvedDisputes.length > 0
        ? resolvedDisputes.filter((d) => d.buyerPct < 30).length /
          resolvedDisputes.length
        : 0;

    // Raw scores (unclamped, for delta computation)
    const rawSeller = computeSellerScoreRaw(
      { ...sellerStats },
      resolutionFairness
    );
    const rawBuyer = computeBuyerScoreRaw(
      { ...buyerStats },
      frivolousDisputeRate
    );

    const confidence = getConfidence(
      Math.max(buyerStats.totalEscrows, sellerStats.totalEscrows)
    );
    const clampedSeller = Math.min(100, rawSeller);
    const clampedBuyer = Math.min(100, rawBuyer);
    const { tier, label } = getReleaseWindowTier(
      clampedBuyer,
      clampedSeller,
      confidence,
      confidence
    );

    snapshots.push({
      round: i + 1,
      definition: def,
      buyerStats: { ...buyerStats },
      sellerStats: { ...sellerStats },
      buyerScore: clampedBuyer,
      sellerScore: clampedSeller,
      buyerDelta: rawBuyer - prevRawBuyer,
      sellerDelta: rawSeller - prevRawSeller,
      confidence,
      windowTier: tier,
      windowLabel: label,
    });

    prevRawBuyer = rawBuyer;
    prevRawSeller = rawSeller;
  }

  return snapshots;
}

// ── Round definitions for the Trust Building scenario ──

export const TRUST_BUILDING_ROUNDS: RoundDefinition[] = [
  {
    label: "First Call",
    description: "First interaction — agent purchases weather data; seller delivers correctly.",
    outcome: "completed",
    amount: 0.5,
  },
  {
    label: "Repeat Purchase",
    description: "Positive experience leads to repeat purchase. Track record growing.",
    outcome: "completed",
    amount: 0.8,
  },
  {
    label: "Growing Trust",
    description: "Agent increases commitment with a larger order. Clean delivery.",
    outcome: "completed",
    amount: 1.0,
  },
  {
    label: "Steady Use",
    description: "Consistent usage pattern. Reliability building on both sides.",
    outcome: "completed",
    amount: 0.8,
  },
  {
    label: "Larger Order",
    description: "Agent places a larger order, demonstrating confidence in the seller.",
    outcome: "completed",
    amount: 1.0,
  },
  {
    label: "Quality Dispute",
    description: "Seller delivers stale data. Agent files dispute; arbiter rules 70% to buyer.",
    outcome: "disputed",
    amount: 0.8,
    buyerPct: 70,
  },
  {
    label: "Recovery",
    description: "Seller improves data quality after dispute. Clean delivery rebuilds trust.",
    outcome: "completed",
    amount: 0.7,
  },
  {
    label: "Partial Dispute",
    description: "Minor accuracy issue. Arbiter rules 60% buyer, 40% seller — less severe.",
    outcome: "disputed",
    amount: 0.6,
    buyerPct: 60,
  },
  {
    label: "Rebuilding",
    description: "Seller delivers perfectly. Trust recovering after two disputes.",
    outcome: "completed",
    amount: 1.0,
  },
  {
    label: "Trust Established",
    description: "High confidence reached (10 escrows). Trust fully established.",
    outcome: "completed",
    amount: 1.3,
  },
];
// Total: 8.50 USDC — fits within the 10 USDC faucet amount
