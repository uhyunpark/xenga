"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderActions } from "@/components/dashboard/OrderActions";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { OrdersPageSkeleton } from "@/components/dashboard/Skeletons";

interface OrderData {
  id: string;
  title: string;
  price: string;
  priceUsdc: number;
  status: string;
  buyerAddress?: string;
  escrowId?: number;
  txHash?: string;
  contentHash?: string;
  contentMetadata?: string;
  createdAt: number;
}

export default function OrdersPage() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/orders?seller=${address}&limit=100`,
        token
      );
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardPageHeader title="Orders" subtitle="Manage your escrow orders and confirm deliveries." />
        <OrdersPageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Orders"
        subtitle="Manage your escrow orders and confirm deliveries."
      />

      <OrderTable
        orders={orders}
        actionSlot={(order) => (
          <OrderActions order={order} onComplete={fetchOrders} />
        )}
      />
    </div>
  );
}
