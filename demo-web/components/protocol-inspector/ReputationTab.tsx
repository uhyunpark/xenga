"use client";

import { useRef, useEffect } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { SCREENING_THRESHOLD } from "@/lib/reputation/client-scoring";
import { cn } from "@/lib/utils";

export function ReputationTab() {
  const { events } = useInspector();
  const scrollRef = useRef<HTMLDivElement>(null);

  const repEvents = events.filter((e) => e.type === "reputation_check");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [repEvents.length]);

  if (repEvents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-text-tertiary">
          Run &quot;Agent Screening&quot; or &quot;Reputation Over Time&quot; to see reputation events
        </p>
      </div>
    );
  }

  // Group by mode
  const screeningEvents = repEvents.filter((e) => e.data.mode === "screening");
  const roundEvents = repEvents.filter((e) => e.data.mode === "round");

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto space-y-3 pr-1">
      {/* Screening cards */}
      {screeningEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Access Screening
            </span>
            <span className="rounded-full border border-border-default bg-bg-tertiary/60 px-1.5 py-0.5 text-[10px] text-text-tertiary">
              threshold {SCREENING_THRESHOLD}/100
            </span>
          </div>
          {screeningEvents.map((e) => (
            <ScreeningCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {/* Round snapshots */}
      {roundEvents.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            Score Progression
          </span>
          {roundEvents.map((e) => (
            <RoundCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScreeningCard({ event }: { event: { data: Record<string, any> } }) {
  const { agentName, address, score, confidence, decision, reason, windowLabel, stats } = event.data;
  const accepted = decision === "accepted";
  const pct = Math.min(100, Math.max(0, score)) as number;
  const thresholdPct = SCREENING_THRESHOLD;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        accepted
          ? "border-success/20 bg-success/5"
          : "border-error/20 bg-error/5"
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold text-text-primary">{agentName}</span>
          <span className="ml-1.5 font-mono text-[10px] text-text-tertiary">{address}</span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            accepted
              ? "bg-success/20 text-success"
              : "bg-error/20 text-error"
          )}
        >
          {accepted ? "ACCEPTED" : "REJECTED"}
        </span>
      </div>

      {/* Score bar with threshold marker */}
      <div className="space-y-1">
        <div className="relative h-2 overflow-visible rounded-full bg-bg-tertiary">
          {/* Filled bar */}
          <div
            className={cn(
              "h-full rounded-full transition-all",
              accepted ? "bg-success" : score === 0 ? "bg-text-tertiary/40" : "bg-error"
            )}
            style={{ width: `${pct}%` }}
          />
          {/* Threshold marker */}
          <div
            className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-warning/80 rounded-full"
            style={{ left: `${thresholdPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span className="font-mono font-medium text-text-primary">{score}/100</span>
          <span className={cn("capitalize", confidence === "high" ? "text-success" : confidence === "medium" ? "text-warning" : "text-text-tertiary")}>
            {confidence} conf · {stats?.totalEscrows ?? 0} escrows
          </span>
        </div>
      </div>

      {/* Stats row (if data) */}
      {stats && stats.totalEscrows > 0 && (
        <div className="flex gap-3 text-[10px] text-text-tertiary">
          <span>Completion <span className="text-text-secondary">{(stats.completionRate * 100).toFixed(0)}%</span></span>
          <span>Adj. Disputes <span className={(stats.adjustedDisputeRate ?? stats.disputeRate) > 0.3 ? "text-error" : "text-text-secondary"}>{((stats.adjustedDisputeRate ?? stats.disputeRate) * 100).toFixed(0)}%</span></span>
          <span>Volume <span className="text-text-secondary">{stats.totalAmount} USDC</span></span>
        </div>
      )}

      {/* Reason / window */}
      <p className="text-[10px] leading-relaxed text-text-tertiary">
        {accepted && windowLabel ? (
          <>
            <span className="text-success">✓</span>{" "}
            Release window: <span className="font-mono text-success">{windowLabel}</span>
          </>
        ) : (
          <>
            <span className="text-error">✗</span> {reason}
          </>
        )}
      </p>
    </div>
  );
}

function RoundCard({ event }: { event: { data: Record<string, any> } }) {
  const {
    round,
    label,
    outcome,
    buyerPct,
    sellerScore,
    buyerScore,
    sellerDelta,
    buyerDelta,
    confidence,
    windowLabel,
  } = event.data;

  const disputed = outcome === "disputed";

  // Determine dispute outcome tier for badge + annotation
  const disputeTier =
    !disputed ? null
    : buyerPct != null && buyerPct >= 50 ? "buyer-won"
    : buyerPct != null && buyerPct >= 30 ? "partial"
    : "frivolous";

  const badgeClass =
    !disputed ? "bg-success/10 text-success"
    : disputeTier === "buyer-won" ? "bg-warning/10 text-warning"
    : disputeTier === "partial" ? "bg-warning/10 text-warning"
    : "bg-error/10 text-error";

  const badgeLabel =
    !disputed ? "Completed"
    : disputeTier === "buyer-won" ? "Buyer Won"
    : disputeTier === "partial" ? "Partial"
    : "Frivolous";

  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-text-secondary">{label ?? `Round ${round}`}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badgeClass)}>
          {badgeLabel}
        </span>
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-2 gap-2">
        <ScoreBar label="Seller" score={sellerScore} delta={sellerDelta} isFirst={round === 1} />
        <ScoreBar label="Buyer" score={buyerScore} delta={buyerDelta} isFirst={round === 1} />
      </div>

      {/* Arbiter annotation (disputed rounds only) */}
      {disputed && buyerPct != null && (
        <div className={cn(
          "rounded px-2 py-1 text-[10px]",
          disputeTier === "buyer-won" ? "bg-success/10 text-success"
          : disputeTier === "partial" ? "bg-warning/10 text-warning"
          : "bg-error/10 text-error"
        )}>
          Arbiter: {buyerPct}% to buyer
          {disputeTier === "buyer-won"
            ? " — buyer vindicated, no score penalty"
            : disputeTier === "partial"
              ? " — partial outcome, mild penalty"
              : " — frivolous claim, full penalty to buyer"}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-text-tertiary">
        <span className={cn("capitalize", confidence === "high" ? "text-success" : confidence === "medium" ? "text-warning" : "text-text-tertiary")}>
          {confidence} confidence
        </span>
        <span className="font-mono">{windowLabel}</span>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  score,
  delta,
  isFirst,
}: {
  label: string;
  score: number;
  delta: number;
  isFirst: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-error";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">{label}</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] font-medium text-text-primary">{score}</span>
          {!isFirst && delta !== 0 && (
            <span className={cn("text-[9px] font-semibold", delta > 0 ? "text-success" : "text-error")}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
