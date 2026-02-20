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
  adjustedDisputeRate: number
): number {
  if (stats.totalEscrows === 0) return 0;
  const completionRate = stats.completedCount / stats.totalEscrows;
  const refundRate = stats.refundedCount / stats.totalEscrows;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);
  return Math.round(
    completionRate * 40 +
      (1 - adjustedDisputeRate) * 35 +
      (1 - refundRate) * 15 +
      volumeBonus * 10
  );
}

function computeBuyerScoreRaw(
  stats: SimulatedStats,
  adjustedDisputeRate: number
): number {
  if (stats.totalEscrows === 0) return 0;
  const adjustedTotal = Math.max(1, stats.totalEscrows - stats.refundedCount);
  const adjustedCompletionRate = stats.completedCount / adjustedTotal;
  const volumeBonus = computeVolumeBonus(stats.totalAmount);
  return Math.round(
    adjustedCompletionRate * 45 +
      (1 - adjustedDisputeRate) * 45 +
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
function getReleaseWindowTier(
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
      buyerStats.refundedCount++; // mirrors on-chain behavior
    }

    // Outcome-weighted adjusted dispute rates (mirrors server formula exactly)
    const adjSellerNum = resolvedDisputes.reduce((sum, d) => {
      if (d.buyerPct < 50) return sum + 0.0;   // seller won: no penalty
      if (d.buyerPct <= 70) return sum + 0.3;  // partial: mild penalty
      return sum + 1.0;                          // seller at fault: full penalty
    }, 0);
    const adjSellerRate = sellerStats.totalEscrows > 0
      ? adjSellerNum / sellerStats.totalEscrows
      : 0;

    const adjBuyerNum = resolvedDisputes.reduce((sum, d) => {
      if (d.buyerPct >= 50) return sum + 0.0;  // buyer won: no penalty
      if (d.buyerPct >= 30) return sum + 0.3;  // partial: mild penalty
      return sum + 1.0;                          // frivolous: full penalty
    }, 0);
    const adjBuyerRate = buyerStats.totalEscrows > 0
      ? adjBuyerNum / buyerStats.totalEscrows
      : 0;

    // Raw scores (unclamped, for delta computation)
    const rawSeller = computeSellerScoreRaw({ ...sellerStats }, adjSellerRate);
    const rawBuyer = computeBuyerScoreRaw({ ...buyerStats }, adjBuyerRate);

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

// ── Multi-agent screening scenario ──

export const SCREENING_THRESHOLD = 50; // minimum score for service access

export type ConfidenceLevel = "low" | "medium" | "high";

export interface ScreeningAgentProfile {
  id: string;
  name: string;
  address: string;
  score: number;
  confidence: ConfidenceLevel;
  decision: "accepted" | "rejected";
  rejectionReason?: string;
  windowLabel?: string;
  windowTier?: "high" | "default";
  stats: {
    totalEscrows: number;
    completionRate: number;
    disputeRate: number;
    adjustedDisputeRate: number; // outcome-weighted; the key comparison vs raw disputeRate
    totalAmount: number;
  };
}

// Pre-computed profiles — scores verified against computeSellerScoreRaw formula (NEW):
//   score = completionRate*40 + (1-adjDisputeRate)*35 + (1-refundRate)*15 + volumeBonus*10
//   adjDisputeRate = sum(weights) / totalEscrows
//   Seller weights: buyer-won (pct<50)=0.0, partial (50-70)=0.3, seller-fault (pct>70)=1.0
//   volumeBonus = min(10, log10(amount) * 3.33)
//
// Alice:  0 escrows → score 0,  "low"    → REJECTED (no history)
// Bob:   12 escrows → score 40, "high"   → REJECTED (below threshold 50; 7 seller-fault disputes)
// Carol:  7 escrows → score 63, "medium" → ACCEPTED (1-hour window)
// Dave:  18 escrows → score 92, "high"   → ACCEPTED (30-min fast lane)
//        Dave's 1 dispute was a frivolous buyer complaint — adjDisputeRate=0, no seller penalty.
export const SCREENING_AGENTS: ScreeningAgentProfile[] = [
  {
    id: "alice",
    name: "Alice",
    address: "0xA1ce7f4b...0001",
    score: 0,
    confidence: "low",
    decision: "rejected",
    rejectionReason: "No transaction history — minimum 3 escrows required",
    stats: { totalEscrows: 0, completionRate: 0, disputeRate: 0, adjustedDisputeRate: 0, totalAmount: 0 },
  },
  {
    id: "bob",
    name: "Bob",
    address: "0xB0b5a8c1...0002",
    score: 40,
    confidence: "high",
    decision: "rejected",
    rejectionReason: "Score 40 below threshold 50 — 7 seller-fault disputes (58%)",
    // adjustedDisputeRate = 7×1.0/12 ≈ 0.58 (all disputes were buyer-won → seller at fault)
    stats: { totalEscrows: 12, completionRate: 0.25, disputeRate: 0.58, adjustedDisputeRate: 0.58, totalAmount: 60 },
  },
  {
    id: "carol",
    name: "Carol",
    address: "0xCA30b2f7...0003",
    score: 63,
    confidence: "medium",
    decision: "accepted",
    windowLabel: "1 hour (standard)",
    windowTier: "default",
    // adjustedDisputeRate = 2×1.0/7 ≈ 0.29 (all disputes were buyer-won → seller at fault)
    stats: { totalEscrows: 7, completionRate: 0.57, disputeRate: 0.29, adjustedDisputeRate: 0.29, totalAmount: 35 },
  },
  {
    id: "dave",
    name: "Dave",
    address: "0xDA5ef8b3...0004",
    score: 92,
    confidence: "high",
    decision: "accepted",
    windowLabel: "30 min (fast lane)",
    windowTier: "high",
    // adjustedDisputeRate = 0: Dave's 1 dispute was a frivolous buyer (buyerPct=20 → seller won → weight 0.0)
    stats: { totalEscrows: 18, completionRate: 0.94, disputeRate: 0.06, adjustedDisputeRate: 0.00, totalAmount: 180 },
  },
];

// ── Round definitions for the Trust Building scenario ──

export const TRUST_BUILDING_ROUNDS: RoundDefinition[] = [
  {
    label: "Round 1: First API Call",
    description:
      "First interaction — agent purchases weather data; seller delivers correctly.",
    outcome: "completed",
    amount: 1.0,
  },
  {
    label: "Round 2: Repeat Purchase",
    description:
      "Positive experience leads to second purchase. Track record growing.",
    outcome: "completed",
    amount: 2.0,
  },
  {
    label: "Round 3: Legitimate Dispute",
    description:
      "Seller delivers stale data. Buyer disputes; arbiter rules 70% to buyer. " +
      "Buyer score drops only −9 — winning a justified dispute carries almost no penalty.",
    outcome: "disputed",
    amount: 1.5,
    buyerPct: 70,
  },
  {
    label: "Round 4: Frivolous Dispute",
    description:
      "Buyer disputes a correct delivery. Arbiter rules 20% to buyer — clearly frivolous. " +
      "Buyer drops −15. Seller loses only −2 since arbiter cleared them.",
    outcome: "disputed",
    amount: 1.5,
    buyerPct: 20,
  },
  {
    label: "Round 5: Recovery",
    description:
      "Buyer resumes honest trading. Clean delivery starts rebuilding trust.",
    outcome: "completed",
    amount: 1.5,
  },
  {
    label: "Round 6: Trust Restored",
    description:
      "Consistent completions restore scores. Frivolous dispute diluted by history.",
    outcome: "completed",
    amount: 2.0,
  },
];
