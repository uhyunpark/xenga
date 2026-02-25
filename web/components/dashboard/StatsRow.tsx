"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
}

function StatCard({ label, value, accent, warn }: StatCardProps) {
  return (
    <div className="panel-surface rounded-xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${
          warn ? "text-warning" : accent ? "text-success" : "text-text-primary"
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
  const repDisplay =
    reputationScore !== null
      ? `${reputationScore}/100`
      : "\u2014";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Active Escrows" value={activeEscrows} />
      <StatCard label="Pending Release" value={pendingRelease} />
      <StatCard label="Net Earnings" value={`$${netEarnings}`} accent />
      <StatCard
        label={`Reputation${confidence ? ` (${confidence})` : ""}`}
        value={repDisplay}
      />
    </div>
  );
}
