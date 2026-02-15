"use client";

import { useState } from "react";
import type { ReputationScore } from "@shared/types";
import type { ReputationHistoryPoint } from "@server/services/reputationService";

export default function ReputationPage() {
  const [query, setQuery] = useState("");
  const [rep, setRep] = useState<ReputationScore | null>(null);
  const [history, setHistory] = useState<ReputationHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    const addr = query.trim();
    if (!addr) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setError("Invalid Ethereum address");
      return;
    }

    setLoading(true);
    setError(null);
    setRep(null);
    setHistory([]);

    try {
      const [repRes, histRes] = await Promise.all([
        fetch(`/api/reputation/${addr}`),
        fetch(`/api/reputation/${addr}/history?days=90&bucket=7`),
      ]);

      if (!repRes.ok) {
        const data = await repRes.json();
        setError(data.error || "Failed to fetch reputation");
        return;
      }

      const repData = await repRes.json();
      setRep(repData);

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.history ?? []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-success";
    if (score >= 40) return "text-warning";
    return "text-error";
  };

  const scoreBg = (score: number) => {
    if (score >= 70) return "border-success/30 bg-success/10";
    if (score >= 40) return "border-warning/30 bg-warning/10";
    return "border-error/30 bg-error/10";
  };

  const confidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "border-success/30 bg-success/10 text-success";
      case "medium":
        return "border-warning/30 bg-warning/10 text-warning";
      default:
        return "border-border-default bg-bg-primary/50 text-text-tertiary";
    }
  };

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const formatUsdc = (val: string) => {
    const n = Number(val) / 1e6;
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k USDC` : `${n.toFixed(2)} USDC`;
  };

  const formatDate = (ts: number) =>
    ts > 0 ? new Date(ts * 1000).toLocaleDateString() : "—";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Header */}
        <div className="panel-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
              Trust Score
            </span>
            <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
              On-Chain Reputation
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">
            Reputation Lookup
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Query any address to see their trust score computed from on-chain
            escrow history — dispute rates, completion rates, and resolution
            fairness.
          </p>
        </div>

        {/* Search */}
        <div className="panel-surface flex flex-col gap-3 rounded-xl p-4 sm:flex-row">
          <input
            type="text"
            placeholder="Enter wallet address (0x...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 rounded-lg border border-border-default bg-bg-primary/55 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-[#031018] transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Looking up..." : "Lookup"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-error">
            {error}
          </div>
        )}

        {rep && (
          <div className="space-y-4">
            {/* Overall Score */}
            <div className="panel-surface rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Overall Score
                  </p>
                  <p className={`mt-1 text-5xl font-bold ${scoreColor(rep.overall)}`}>
                    {rep.overall}
                    <span className="text-lg text-text-tertiary">/100</span>
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${confidenceBadge(rep.confidence)}`}
                  >
                    {rep.confidence} confidence
                  </span>
                  <p className="mt-1 font-mono text-xs text-text-tertiary">
                    {rep.address.slice(0, 6)}...{rep.address.slice(-4)}
                  </p>
                </div>
              </div>
            </div>

            {/* Seller + Buyer Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {rep.seller && (
                <div className="panel-surface rounded-xl p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Seller Metrics
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreBg(rep.seller.score)} ${scoreColor(rep.seller.score)}`}
                    >
                      {rep.seller.score}/100
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <MetricRow
                      label="Completion Rate"
                      value={pct(rep.seller.completionRate)}
                    />
                    <MetricRow
                      label="Dispute Rate"
                      value={pct(rep.seller.disputeRate)}
                      warn={rep.seller.disputeRate > 0.2}
                    />
                    <MetricRow
                      label="Refund Rate"
                      value={pct(rep.seller.refundRate)}
                      warn={rep.seller.refundRate > 0.1}
                    />
                    <MetricRow
                      label="Resolution Fairness"
                      value={pct(rep.seller.resolutionFairness)}
                    />
                    <MetricRow
                      label="Total Volume"
                      value={formatUsdc(rep.seller.totalVolume)}
                    />
                    <MetricRow
                      label="Total Escrows"
                      value={String(rep.seller.totalEscrows)}
                    />
                    <MetricRow
                      label="First Seen"
                      value={formatDate(rep.seller.firstSeen)}
                    />
                  </div>
                </div>
              )}

              {rep.buyer && (
                <div className="panel-surface rounded-xl p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Buyer Metrics
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreBg(rep.buyer.score)} ${scoreColor(rep.buyer.score)}`}
                    >
                      {rep.buyer.score}/100
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <MetricRow
                      label="Completion Rate"
                      value={pct(rep.buyer.completionRate)}
                    />
                    <MetricRow
                      label="Dispute Rate"
                      value={pct(rep.buyer.disputeRate)}
                      warn={rep.buyer.disputeRate > 0.2}
                    />
                    <MetricRow
                      label="Frivolous Dispute Rate"
                      value={pct(rep.buyer.frivolousDisputeRate)}
                      warn={rep.buyer.frivolousDisputeRate > 0.3}
                    />
                    <MetricRow
                      label="Total Volume"
                      value={formatUsdc(rep.buyer.totalVolume)}
                    />
                    <MetricRow
                      label="Total Escrows"
                      value={String(rep.buyer.totalEscrows)}
                    />
                    <MetricRow
                      label="First Seen"
                      value={formatDate(rep.buyer.firstSeen)}
                    />
                  </div>
                </div>
              )}

              {!rep.seller && !rep.buyer && (
                <div className="panel-surface col-span-full rounded-xl p-5 text-center">
                  <p className="text-sm text-text-tertiary">
                    No escrow history found for this address.
                  </p>
                </div>
              )}
            </div>

            {/* History Chart */}
            {history.length > 0 && (
              <div className="panel-surface rounded-xl p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  Activity History (90 days)
                </p>
                <div className="flex items-end gap-1" style={{ height: 120 }}>
                  {history.map((h, i) => {
                    const maxEscrows = Math.max(
                      ...history.map((p) => p.totalEscrows),
                      1
                    );
                    const height =
                      maxEscrows > 0
                        ? Math.max((h.totalEscrows / maxEscrows) * 100, 2)
                        : 2;
                    const hasDisputes = h.disputedCount > 0;
                    return (
                      <div
                        key={i}
                        className="group relative flex-1"
                        title={`${new Date(h.timestamp * 1000).toLocaleDateString()}: ${h.totalEscrows} escrows, ${h.disputedCount} disputes`}
                      >
                        <div
                          className={`w-full rounded-t transition-colors ${hasDisputes ? "bg-warning/60" : "bg-accent/40"} group-hover:bg-accent/70`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-text-tertiary">
                  <span>90d ago</span>
                  <span>Now</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-default pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span
        className={`text-xs font-medium ${warn ? "text-error" : "text-text-primary"}`}
      >
        {value}
      </span>
    </div>
  );
}
