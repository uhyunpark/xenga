"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";
import { facilitatorFetch } from "@/lib/api/client";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

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
}

export default function DashboardOverview() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [ordersRes, repRes] = await Promise.all([
        authenticatedFetch(
          `/api/orders?seller=${address}&limit=50`,
          token
        ),
        facilitatorFetch(`/api/reputation/${address}`),
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }
      if (repRes.ok) {
        const data = await repRes.json();
        setReputation(data);
      }
    } catch {
      // Silently handle — stats will show defaults
    } finally {
      setLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeEscrows = orders.filter((o) => o.status === "escrowed").length;
  const pendingRelease = orders.filter((o) => o.status === "delivery_confirmed").length;

  const netEarnings = orders
    .filter((o) => o.status === "completed" || o.status === "resolved")
    .reduce((sum, o) => sum + o.priceUsdc, 0)
    .toFixed(2);

  if (loading && orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your escrow activity at a glance.
        </p>
      </div>

      <StatsRow
        activeEscrows={activeEscrows}
        pendingRelease={pendingRelease}
        netEarnings={netEarnings}
        reputationScore={reputation?.overall ?? null}
        confidence={reputation?.confidence ?? null}
      />

      <ActivityFeed orders={orders} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-accent">Payment Links</h3>
          <p className="mt-1 text-xs text-text-tertiary">
            Create shareable checkout links for buyers.
          </p>
          <span className="mt-3 inline-block rounded-full border border-border-default px-2.5 py-1 text-xs text-text-tertiary">
            Coming soon
          </span>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-accent">API Documentation</h3>
          <p className="mt-1 text-xs text-text-tertiary">
            Integrate Xenga escrow into your backend.
          </p>
          <span className="mt-3 inline-block rounded-full border border-border-default px-2.5 py-1 text-xs text-text-tertiary">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
