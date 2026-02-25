"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderActions } from "@/components/dashboard/OrderActions";

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
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your escrow orders and confirm deliveries.
        </p>
      </div>

      <OrderTable
        orders={orders}
        actionSlot={(order) => (
          <OrderActions order={order} onComplete={fetchOrders} />
        )}
      />
    </div>
  );
}
