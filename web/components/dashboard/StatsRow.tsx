"use client";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
}

function StatCard({ label, value, accent, warn }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-light ${
          warn ? "text-warning" : accent ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

interface StatsRowProps {
  activeEscrows: number;
  pendingRelease: number;
  netEarnings: string;
  reputationScore: number | null;
  confidence: string | null;
}

export function StatsRow({
  activeEscrows,
  pendingRelease,
  netEarnings,
  reputationScore,
  confidence,
}: StatsRowProps) {
  const earningsNum = parseFloat(netEarnings) || 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Active Escrows" value={<AnimatedNumber value={activeEscrows} />} />
      <StatCard label="Pending Release" value={<AnimatedNumber value={pendingRelease} />} />
      <StatCard
        label="Total Revenue"
        value={<AnimatedNumber value={earningsNum} format={(n) => `$${n.toFixed(2)}`} />}
        accent
      />
      <StatCard
        label={`Credit Score${confidence ? ` (${confidence})` : ""}`}
        value={
          reputationScore !== null
            ? <><AnimatedNumber value={reputationScore} />/100</>
            : "\u2014"
        }
      />
    </div>
  );
}
