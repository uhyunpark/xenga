"use client";

import { useState } from "react";
import { formatUsdc } from "@/lib/utils";

interface AllTimeStats {
  totalEscrows: string;
  totalAmount: string;
  completedCount: string;
  completedAmount: string;
  disputedCount: string;
  disputedAmount: string;
  resolvedCount: string;
  refundedCount: string;
  refundedAmount: string;
}

interface WindowedRow {
  sellerAddress: string;
  serviceType: string;
  totalEscrows: number;
  totalAmount: number;
  completedCount: number;
  completedAmount: number;
  disputedCount: number;
  disputedAmount: number;
  disputeRatio: number;
}

interface MetricsResponse {
  allTime: {
    sellerStats?: AllTimeStats;
    serviceStats?: AllTimeStats;
  };
  windowed: {
    days: number;
    stats: WindowedRow[];
  };
}

export default function MetricsPage() {
  const [seller, setSeller] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams();
      if (seller.trim()) params.set("seller", seller.trim());
      if (serviceType) params.set("serviceType", serviceType);
      params.set("days", String(days));

      const res = await fetch(`/api/metrics/disputes?${params}`);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to fetch metrics");
        return;
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Header */}
        <div className="panel-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent-purple/35 bg-accent-purple/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-purple">
              Dispute Analytics
            </span>
            <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
              On-Chain + Off-Chain
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">
            Dispute Metrics
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Query on-chain aggregate stats and time-windowed dispute data per
            seller and service type.
          </p>
        </div>

        {/* Filters */}
        <div className="panel-surface flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-text-tertiary">
              Seller Address
            </label>
            <input
              type="text"
              placeholder="0x... (optional)"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-primary/55 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-tertiary">
              Service Type
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-bg-primary/55 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-40"
            >
              <option value="">All</option>
              <option value="marketplace">Marketplace</option>
              <option value="agent-service">Agent Service</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-tertiary">
              Window
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-lg border border-border-default bg-bg-primary/55 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-28"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <button
            onClick={handleFetch}
            disabled={loading}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-[#031018] transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Query"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-error">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* All-Time On-Chain Stats */}
            {(data.allTime.sellerStats || data.allTime.serviceStats) && (
              <div className="panel-surface rounded-xl p-5">
                <h2 className="text-lg font-semibold">
                  All-Time (On-Chain)
                </h2>
                <p className="mt-1 text-xs text-text-tertiary">
                  Directly from the EscrowVault contract — trustless and
                  verifiable.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {data.allTime.sellerStats && (
                    <StatsCard
                      title="Seller Stats"
                      stats={data.allTime.sellerStats}
                    />
                  )}
                  {data.allTime.serviceStats && (
                    <StatsCard
                      title="Service Type Stats"
                      stats={data.allTime.serviceStats}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Time-Windowed Stats */}
            <div className="panel-surface rounded-xl p-5">
              <h2 className="text-lg font-semibold">
                Last {data.windowed.days} Days
              </h2>
              <p className="mt-1 text-xs text-text-tertiary">
                Computed from local order history.
              </p>

              {data.windowed.stats.length === 0 ? (
                <p className="mt-4 text-sm text-text-tertiary">
                  No orders found in this time window.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-default text-left text-xs font-medium text-text-tertiary">
                        <th className="pb-2 pr-4">Seller</th>
                        <th className="pb-2 pr-4">Service</th>
                        <th className="pb-2 pr-4 text-right">Escrows</th>
                        <th className="pb-2 pr-4 text-right">Volume</th>
                        <th className="pb-2 pr-4 text-right">Completed</th>
                        <th className="pb-2 pr-4 text-right">Disputed</th>
                        <th className="pb-2 text-right">Dispute %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.windowed.stats.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border-default/50 last:border-0"
                        >
                          <td className="py-2 pr-4 font-mono text-xs">
                            {row.sellerAddress.slice(0, 6)}...
                            {row.sellerAddress.slice(-4)}
                          </td>
                          <td className="py-2 pr-4">{row.serviceType}</td>
                          <td className="py-2 pr-4 text-right">
                            {row.totalEscrows}
                          </td>
                          <td className="py-2 pr-4 text-right text-accent">
                            {formatUsdc(row.totalAmount)}
                          </td>
                          <td className="py-2 pr-4 text-right text-success">
                            {row.completedCount}
                          </td>
                          <td className="py-2 pr-4 text-right text-error">
                            {row.disputedCount}
                          </td>
                          <td className="py-2 text-right">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.disputeRatio > 0.2
                                  ? "bg-error/10 text-error"
                                  : row.disputeRatio > 0
                                    ? "bg-warning/10 text-warning"
                                    : "bg-success/10 text-success"
                              }`}
                            >
                              {(row.disputeRatio * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsCard({
  title,
  stats,
}: {
  title: string;
  stats: AllTimeStats;
}) {
  const total = Number(stats.totalEscrows);
  const disputed = Number(stats.disputedCount);
  const ratio = total > 0 ? disputed / total : 0;

  return (
    <div className="rounded-lg border border-border-default bg-bg-primary/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        <StatRow label="Total Escrows" value={stats.totalEscrows} />
        <StatRow
          label="Total Volume"
          value={`${formatUsdc(stats.totalAmount)} USDC`}
          accent
        />
        <StatRow label="Completed" value={stats.completedCount} />
        <StatRow
          label="Completed Volume"
          value={`${formatUsdc(stats.completedAmount)} USDC`}
        />
        <StatRow label="Disputed" value={stats.disputedCount} />
        <StatRow
          label="Disputed Volume"
          value={`${formatUsdc(stats.disputedAmount)} USDC`}
        />
        <StatRow label="Resolved" value={stats.resolvedCount} />
        <StatRow label="Refunded" value={stats.refundedCount} />
        <StatRow
          label="Refunded Volume"
          value={`${formatUsdc(stats.refundedAmount)} USDC`}
        />
        <div className="flex items-center justify-between border-t border-border-default pt-2">
          <span className="text-xs font-medium text-text-secondary">
            Dispute Ratio
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              ratio > 0.2
                ? "bg-error/10 text-error"
                : ratio > 0
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
            }`}
          >
            {(ratio * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-default/50 pb-1.5 last:border-0 last:pb-0">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span
        className={`text-xs font-medium ${accent ? "text-accent" : "text-text-primary"}`}
      >
        {value}
      </span>
    </div>
  );
}
