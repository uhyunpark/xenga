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
        return "text-warning";
      case "DeliveryConfirmed":
        return "text-accent";
      case "Completed":
      case "AutoReleased":
        return "text-success";
      case "Disputed":
        return "text-error";
      case "Resolved":
        return "text-accent-purple";
      case "Refunded":
        return "text-text-secondary";
      default:
        return "text-text-tertiary";
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Escrow Explorer</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Look up on-chain escrow state by escrow ID.
          </p>
        </div>

        {/* Search */}
        <div className="mb-6 flex gap-2">
          <input
            type="text"
            placeholder="Enter escrow ID (e.g., 1)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 rounded-lg border border-border-default bg-bg-secondary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
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
          <div className="rounded-xl border border-border-default bg-bg-secondary p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Escrow #{escrow.escrowId}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${stateColor(escrow.state)} ${
                  escrow.state === "Active"
                    ? "bg-warning/10"
                    : escrow.state === "Completed"
                      ? "bg-success/10"
                      : escrow.state === "Disputed"
                        ? "bg-error/10"
                        : "bg-bg-tertiary"
                }`}
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
                value={`${escrow.releaseWindow} seconds (${(escrow.releaseWindow / 3600).toFixed(1)} hours)`}
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
