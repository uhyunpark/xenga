"use client";

import { useState } from "react";

interface EscrowData {
  escrowId: number;
  orderId: string;
  buyer: string;
  seller: string;
  amount: string;
  serviceType: string;
  state: string;
  stateNum: number;
  createdAt: number;
  releaseWindow: number;
  deliveryConfirmedAt: number;
  disputeWindow: number;
  isReleasable: boolean;
}

export default function ExplorerPage() {
  const [query, setQuery] = useState("");
  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setEscrow(null);

    try {
      const escrowId = parseInt(query.trim(), 10);
      if (isNaN(escrowId) || escrowId <= 0) {
        setError("Please enter a valid escrow ID (positive integer)");
        return;
      }

      const res = await fetch(`/api/escrows/${escrowId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Escrow not found");
        return;
      }

      setEscrow(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stateColor = (state: string) => {
    switch (state) {
      case "Active":
        return "border-warning/30 bg-warning/10 text-warning";
      case "DeliveryConfirmed":
        return "border-accent/30 bg-accent/10 text-accent";
      case "Completed":
      case "AutoReleased":
        return "border-success/30 bg-success/10 text-success";
      case "Disputed":
        return "border-error/30 bg-error/10 text-error";
      case "Resolved":
        return "border-accent-purple/30 bg-accent-purple/10 text-accent-purple";
      case "Refunded":
        return "border-border-default bg-bg-primary/55 text-text-secondary";
      default:
        return "border-border-default bg-bg-primary/55 text-text-tertiary";
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds >= 86400) {
      return `${(seconds / 86400).toFixed(1)} days`;
    }
    if (seconds >= 3600) {
      return `${(seconds / 3600).toFixed(1)} hours`;
    }
    return `${seconds} sec`;
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="panel-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
              On-Chain Lookup
            </span>
            <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
              Escrow State Reader
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">Escrow Explorer</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Query escrow IDs and inspect lifecycle state, timing windows, and release eligibility.
          </p>
        </div>

        <div className="panel-surface flex flex-col gap-3 rounded-xl p-4 sm:flex-row">
          <input
            type="text"
            placeholder="Enter escrow ID (e.g., 1)"
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
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-error">
            {error}
          </div>
        )}

        {escrow && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="panel-surface rounded-xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Escrow #{escrow.escrowId}
                </h2>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateColor(escrow.state)}`}
                >
                  {escrow.state}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <Row label="Order ID" value={escrow.orderId} mono />
                <Row label="Buyer" value={escrow.buyer} mono />
                <Row label="Seller" value={escrow.seller} mono />
                <Row
                  label="Amount"
                  value={`${(Number(escrow.amount) / 1e6).toFixed(2)} USDC`}
                />
                <Row label="Service Type" value={escrow.serviceType} />
                <Row
                  label="Created"
                  value={new Date(escrow.createdAt * 1000).toLocaleString()}
                />
                <Row
                  label="Release Window"
                  value={`${formatDuration(escrow.releaseWindow)} (${escrow.releaseWindow}s)`}
                />
                <Row
                  label="Dispute Window"
                  value={`${formatDuration(escrow.disputeWindow)} (${escrow.disputeWindow}s)`}
                />
                {escrow.deliveryConfirmedAt > 0 && (
                  <Row
                    label="Delivery Confirmed"
                    value={new Date(
                      escrow.deliveryConfirmedAt * 1000
                    ).toLocaleString()}
                  />
                )}
                <Row
                  label="Releasable"
                  value={escrow.isReleasable ? "Yes" : "No"}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel-surface rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  Lifecycle Metrics
                </p>
                <div className="mt-3 space-y-2">
                  <Metric label="State Index" value={String(escrow.stateNum)} />
                  <Metric label="Release Window" value={formatDuration(escrow.releaseWindow)} />
                  <Metric label="Dispute Window" value={formatDuration(escrow.disputeWindow)} />
                  <Metric
                    label="Funds Status"
                    value={escrow.isReleasable ? "Eligible to release" : "Locked"}
                  />
                </div>
              </div>

              <div className="panel-surface rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  State Notes
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  Escrow states transition on-chain and can be cross-checked from the Protocol Inspector and BaseScan transaction history.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-default pb-2 last:border-0">
      <span className="text-text-tertiary shrink-0">{label}</span>
      <span
        className={`text-right break-all ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-default pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-xs font-medium text-text-primary">{value}</span>
    </div>
  );
}
