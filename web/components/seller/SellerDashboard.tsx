"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { WalletSelector } from "@/components/ui/WalletSelector";
import { facilitatorFetch } from "@/lib/api/client";
import { OrderList } from "./OrderList";
import { EarningsCard } from "./EarningsCard";

interface OrderData {
  id: string;
  title: string;
  price: string;
  priceUsdc: number;
  status: string;
  buyerAddress?: string;
  escrowId?: number;
  txHash?: string;
  createdAt: number;
}

interface ReputationData {
  overall: number;
  confidence: "low" | "medium" | "high";
  seller?: {
    score: number;
    completionRate: number;
    disputeRate: number;
    refundRate: number;
    volume: number;
    escrows: number;
  };
}

export function SellerDashboard() {
  const { address } = useWallet();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [ordersRes, repRes] = await Promise.all([
        facilitatorFetch(`/api/orders?seller=${address}&limit=50`),
        facilitatorFetch(`/api/reputation/${address}`),
      ]);

      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as { orders: OrderData[] };
        setOrders(data.orders);
      }
      if (repRes.ok) {
        setReputation((await repRes.json()) as ReputationData);
      }
    } catch {
      // silently fail — will show empty state
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!address) {
    return (
      <div className="panel-surface rounded-2xl p-8 text-center">
        <h2 className="text-lg font-semibold">Connect Your Wallet</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Connect as a seller to view your orders and reputation.
        </p>
        <div className="mt-4 flex justify-center">
          <WalletSelector />
        </div>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="panel-surface rounded-2xl p-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="mt-4 text-sm text-text-secondary">Loading dashboard...</p>
      </div>
    );
  }

  const escrowedOrders = orders.filter((o) => o.status === "escrowed");
  const completedOrders = orders.filter((o) => o.status === "completed" || o.status === "delivery_confirmed");
  const disputedOrders = orders.filter((o) => o.status === "disputed");

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Orders" value={orders.length.toString()} />
        <StatCard label="Active Escrows" value={escrowedOrders.length.toString()} accent />
        <StatCard label="Completed" value={completedOrders.length.toString()} />
        <StatCard label="Disputes" value={disputedOrders.length.toString()} warn={disputedOrders.length > 0} />
      </div>

      {/* Reputation + Earnings */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Reputation card */}
        <div className="panel-surface rounded-2xl p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
            Reputation
          </h3>
          {reputation?.seller ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{reputation.seller.score}</span>
                <span className="text-sm text-text-tertiary">/ 100</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                    reputation.confidence === "high"
                      ? "bg-success/10 text-success"
                      : reputation.confidence === "medium"
                        ? "bg-warning/10 text-warning"
                        : "bg-bg-tertiary text-text-tertiary"
                  }`}
                >
                  {reputation.confidence} confidence
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <MetricRow label="Completion Rate" value={`${(reputation.seller.completionRate * 100).toFixed(0)}%`} />
                <MetricRow label="Dispute Rate" value={`${(reputation.seller.disputeRate * 100).toFixed(1)}%`} />
                <MetricRow label="Refund Rate" value={`${(reputation.seller.refundRate * 100).toFixed(1)}%`} />
                <MetricRow label="Total Escrows" value={reputation.seller.escrows.toString()} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-tertiary">No reputation data yet. Complete escrows to build your score.</p>
          )}
        </div>

        <EarningsCard orders={orders} />
      </div>

      {/* Order list */}
      <OrderList orders={orders} onRefresh={fetchData} />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="panel-surface rounded-xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${
          warn ? "text-error" : accent ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
