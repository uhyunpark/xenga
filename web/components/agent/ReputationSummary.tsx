"use client";

import { useState } from "react";
import type { ReputationScore } from "@shared/types";
import type { RoundSnapshot, ScreeningAgentProfile } from "@/lib/reputation/client-scoring";
import { SCREENING_THRESHOLD } from "@/lib/reputation/client-scoring";
import { Badge } from "@/components/ui/Badge";
import { shortenAddress } from "@/lib/utils";
import { isMockChainClient } from "@/lib/env/isMockChainClient";
import { cn } from "@/lib/utils";

interface ReputationSummaryProps {
  buyerAddress: string;
  sellerAddress: string;
  buyerRep: ReputationScore | null;
  sellerRep: ReputationScore | null;
  scenario: "happy" | "dispute" | "reputation" | "screening";
  progression?: RoundSnapshot[];
  screeningResults?: ScreeningAgentProfile[];
}

const BUYER_FORMULA = [
  { label: "Completion", weight: 45, color: "bg-accent" },
  { label: "Non-Dispute", weight: 25, color: "bg-warning" },
  { label: "Non-Frivolous", weight: 20, color: "bg-violet" },
  { label: "Volume", weight: 10, color: "bg-success" },
];

const SELLER_FORMULA = [
  { label: "Completion", weight: 40, color: "bg-accent" },
  { label: "Non-Dispute", weight: 25, color: "bg-warning" },
  { label: "Non-Refund", weight: 15, color: "bg-error/60" },
  { label: "Fairness", weight: 10, color: "bg-violet" },
  { label: "Volume", weight: 10, color: "bg-success" },
];

const RELEASE_WINDOWS = [
  { condition: "Score ≥80 + high confidence", window: "30 min", id: "high" },
  { condition: "Score 40-79 or low confidence", window: "1 hour (default)", id: "default" },
  { condition: "Score <40 + data", window: "4 hours", id: "low" },
];

function getActiveWindow(rep: ReputationScore | null): string {
  if (!rep?.seller) return "default";
  if (rep.confidence === "low") return "default";
  if (rep.seller.score >= 80 && rep.confidence === "high") return "high";
  if (rep.seller.score < 40) return "low";
  return "default";
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-warning";
  return "bg-error";
}

function confidenceBadge(confidence: string) {
  const variant = confidence === "high" ? "success" : confidence === "medium" ? "warning" : "default";
  const label =
    confidence === "high" ? "High (10+)" : confidence === "medium" ? "Medium (3-9)" : "Low (<3 escrows)";
  return <Badge variant={variant}>{label}</Badge>;
}

function formatVolume(totalVolume: string): string {
  return (Number(totalVolume) / 1e6).toFixed(2);
}

export function ReputationSummary({
  buyerAddress,
  sellerAddress,
  buyerRep,
  sellerRep,
  scenario,
  progression,
  screeningResults,
}: ReputationSummaryProps) {
  const [showFormula, setShowFormula] = useState(false);
  const hasBuyerData = !!buyerRep?.buyer;
  const hasSellerData = !!sellerRep?.seller;
  const hasAnyData = hasBuyerData || hasSellerData;
  const activeWindow = getActiveWindow(sellerRep);

  const badgeVariant =
    scenario === "dispute" ? "error"
    : scenario === "reputation" ? "info"
    : scenario === "screening" ? "warning"
    : "success";

  const badgeLabel =
    scenario === "happy" ? "Successful Payment"
    : scenario === "dispute" ? "Dispute & Resolution"
    : scenario === "reputation" ? "Reputation Over Time"
    : "Agent Screening";

  return (
    <div className="panel-surface overflow-hidden rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-5 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Reputation Impact</h3>
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
      </div>

      {/* ── Screening scenario: agent table ── */}
      {scenario === "screening" && screeningResults && screeningResults.length > 0 && (
        <>
          {/* Threshold callout */}
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2">
            <span className="text-xs font-semibold text-warning">Service threshold:</span>
            <span className="font-mono text-xs text-text-primary">{SCREENING_THRESHOLD}/100</span>
            <span className="text-xs text-text-tertiary">— agents below this score are rejected</span>
          </div>

          {/* Screening results table */}
          <div className="border-t border-border-default px-5 py-4 mt-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Screening Results
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-[480px] w-full text-xs">
                <thead>
                  <tr className="border-b border-border-default text-left text-text-tertiary">
                    <th className="pb-2 pr-3 font-medium">Agent</th>
                    <th className="pb-2 pr-3 font-medium">Score</th>
                    <th className="pb-2 pr-3 font-medium">Confidence</th>
                    <th className="pb-2 pr-3 font-medium">Decision</th>
                    <th className="pb-2 font-medium">Release Window</th>
                  </tr>
                </thead>
                <tbody>
                  {screeningResults.map((agent) => (
                    <tr
                      key={agent.id}
                      className={cn(
                        "border-b border-border-default/50",
                        agent.decision === "accepted" ? "bg-success/3" : "bg-error/3"
                      )}
                    >
                      <td className="py-2 pr-3">
                        <span className="font-medium text-text-primary">{agent.name}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-text-tertiary">{agent.address}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", agent.score >= 70 ? "bg-success" : agent.score >= 40 ? "bg-warning" : "bg-text-tertiary/40")}
                              style={{ width: `${agent.score}%` }}
                            />
                          </div>
                          <span className="font-mono font-medium text-text-primary">{agent.score}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 capitalize text-text-secondary">{agent.confidence}</td>
                      <td className="py-2 pr-3">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                          agent.decision === "accepted" ? "bg-success/15 text-success" : "bg-error/15 text-error"
                        )}>
                          {agent.decision === "accepted" ? "Accepted" : "Rejected"}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-text-secondary">
                        {agent.windowLabel ?? <span className="text-text-tertiary">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Non-screening: buyer/seller stats ── */}
      {scenario !== "screening" && (
        <>
          {/* Mock mode notice */}
          {!hasAnyData && isMockChainClient && scenario !== "reputation" && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2">
              <span className="text-xs text-warning">
                Simulation mode — on-chain stats are not updated in mock chain mode. The scoring formula and parameter table below show how the system works with real transactions.
              </span>
            </div>
          )}

          {/* Side-by-side stats */}
          <div className="grid grid-cols-2 gap-px bg-border-default">
            <PartyStats
              role="BUYER"
              address={buyerAddress}
              rep={buyerRep}
              data={buyerRep?.buyer ? {
                score: buyerRep.buyer.score,
                confidence: buyerRep.confidence,
                totalEscrows: buyerRep.buyer.totalEscrows,
                completionRate: buyerRep.buyer.completionRate,
                disputeRate: buyerRep.buyer.disputeRate,
                totalVolume: buyerRep.buyer.totalVolume,
              } : null}
            />
            <PartyStats
              role="SELLER"
              address={sellerAddress}
              rep={sellerRep}
              data={sellerRep?.seller ? {
                score: sellerRep.seller.score,
                confidence: sellerRep.confidence,
                totalEscrows: sellerRep.seller.totalEscrows,
                completionRate: sellerRep.seller.completionRate,
                disputeRate: sellerRep.seller.disputeRate,
                totalVolume: sellerRep.seller.totalVolume,
              } : null}
            />
          </div>
        </>
      )}

      {/* Section: Scoring formula (collapsible) */}
      <div className="border-t border-border-default px-5 py-4">
        <button
          onClick={() => setShowFormula((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <span>How Scores Are Computed</span>
          <span className="text-[10px] normal-case font-normal text-text-tertiary">
            {showFormula ? "Hide ▴" : "Show ▾"}
          </span>
        </button>
        {showFormula && (
          <div className="mt-3 space-y-4">
            <FormulaBar label="Buyer Formula" segments={BUYER_FORMULA} />
            <FormulaBar label="Seller Formula" segments={SELLER_FORMULA} />
          </div>
        )}
      </div>

      {/* Section: Release window impact */}
      <div className="border-t border-border-default px-5 py-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          How Reputation Affects Parameters
        </h4>
        <div className="overflow-hidden rounded-lg border border-border-default">
          {RELEASE_WINDOWS.map((row) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-3 py-2 text-xs ${
                row.id === activeWindow && scenario !== "screening"
                  ? "border-l-2 border-l-accent bg-accent/5"
                  : "border-l-2 border-l-transparent"
              } ${row.id !== "low" ? "border-b border-border-default" : ""}`}
            >
              <span className="text-text-secondary">{row.condition}</span>
              <span className="font-mono font-medium text-text-primary">{row.window}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Score Progression (reputation scenario only) */}
      {scenario === "reputation" && progression && progression.length > 0 && (
        <div className="border-t border-border-default px-5 py-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Score Progression
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-[500px] w-full text-xs">
              <thead>
                <tr className="border-b border-border-default text-left text-text-tertiary">
                  <th className="pb-2 pr-3 font-medium">Round</th>
                  <th className="pb-2 pr-3 font-medium">Outcome</th>
                  <th className="pb-2 pr-3 font-medium">Seller</th>
                  <th className="pb-2 pr-3 font-medium">Buyer</th>
                  <th className="pb-2 pr-3 font-medium">Confidence</th>
                  <th className="pb-2 font-medium">Window</th>
                </tr>
              </thead>
              <tbody>
                {progression.map((snap) => (
                  <tr key={snap.round} className="border-b border-border-default/50">
                    <td className="py-2 pr-3 font-mono text-text-secondary">{snap.round}</td>
                    <td className="py-2 pr-3">
                      <span className={snap.definition.outcome === "completed" ? "text-success" : "text-error"}>
                        {snap.definition.outcome === "completed" ? "Completed" : `Disputed ${snap.definition.buyerPct}/${100 - (snap.definition.buyerPct ?? 50)}`}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono font-medium text-text-primary">{snap.sellerScore}</span>
                      <DeltaBadge delta={snap.sellerDelta} isFirst={snap.round === 1} />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono font-medium text-text-primary">{snap.buyerScore}</span>
                      <DeltaBadge delta={snap.buyerDelta} isFirst={snap.round === 1} />
                    </td>
                    <td className="py-2 pr-3 capitalize text-text-secondary">{snap.confidence}</td>
                    <td className="py-2 font-mono text-text-secondary">{snap.windowLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-border-default px-5 py-3">
        <p className="text-[11px] leading-relaxed text-text-tertiary">
          {scenario === "happy"
            ? "Escrow created but not yet released — completion stats update after the 1-hour auto-release window. Repeating transactions builds confidence and unlocks shorter release windows."
            : scenario === "dispute"
              ? "Dispute recorded in on-chain stats. Both buyer's dispute rate and seller's dispute rate are now tracked. Resolution fairness (arbiter rulings) shapes long-term reputation scores."
              : scenario === "reputation"
                ? "Simulated using the same scoring formulas applied to on-chain data. The dispute in round 3 dropped the seller score by 21 points, but two subsequent completions restored trust. In production, these scores drive release window adjustments once confidence reaches \"high\" (10+ escrows)."
                : "Reputation is a portable on-chain credential. Services set their own thresholds — agents rejected here can build history elsewhere and re-apply. High-trust agents earn faster settlement (30 min vs 1 hour) as a tangible incentive."}
          {" "}Confidence thresholds: Low (&lt;3 escrows), Medium (3-9), High (10+). Parameter adjustments activate at Medium confidence.
        </p>
      </div>
    </div>
  );
}

function PartyStats({
  role,
  address,
  rep,
  data,
}: {
  role: "BUYER" | "SELLER";
  address: string;
  rep: ReputationScore | null;
  data: {
    score: number;
    confidence: string;
    totalEscrows: number;
    completionRate: number;
    disputeRate: number;
    totalVolume: string;
  } | null;
}) {
  return (
    <div className="bg-bg-secondary p-4 space-y-3">
      {/* Role + address */}
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{role}</span>
        <p className="font-mono text-xs text-text-secondary">{shortenAddress(address)}</p>
      </div>

      {data ? (
        <>
          {/* Score gauge */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className={`h-full rounded-full transition-all ${scoreColor(data.score)}`}
                  style={{ width: `${Math.min(data.score, 100)}%` }}
                />
              </div>
              <span className="font-mono text-sm font-semibold text-text-primary">{data.score}</span>
            </div>
            {confidenceBadge(data.confidence)}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatCell label="Escrows" value={String(data.totalEscrows)} />
            <StatCell label="Completed" value={`${(data.completionRate * 100).toFixed(0)}%`} />
            <StatCell label="Disputes" value={`${(data.disputeRate * 100).toFixed(0)}%`} />
            <StatCell label="Volume" value={`${formatVolume(data.totalVolume)} USDC`} />
          </div>
        </>
      ) : (
        <p className="text-xs text-text-tertiary">No on-chain activity yet</p>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-tertiary/60 px-2 py-1.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className="font-mono text-xs font-medium text-text-primary">{value}</p>
    </div>
  );
}

function FormulaBar({
  label,
  segments,
}: {
  label: string;
  segments: { label: string; weight: number; color: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.weight, 0);

  return (
    <div>
      <p className="mb-1.5 text-xs text-text-secondary">{label}</p>
      {/* Stacked bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.weight / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Labels */}
      <div className="mt-1 flex">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="overflow-hidden text-center"
            style={{ width: `${(seg.weight / total) * 100}%` }}
          >
            <p className="truncate text-[9px] text-text-tertiary">{seg.label}</p>
            <p className="text-[9px] font-medium text-text-secondary">&times;{seg.weight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaBadge({ delta, isFirst }: { delta: number; isFirst: boolean }) {
  if (isFirst) return null;
  const positive = delta > 0;
  return (
    <span
      className={`ml-1 text-[10px] font-medium ${
        positive ? "text-success" : "text-error"
      }`}
    >
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}
