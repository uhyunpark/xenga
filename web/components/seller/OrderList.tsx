"use client";

import { useState } from "react";
import { facilitatorFetch } from "@/lib/api/client";
import type { OrderData } from "./types";

const STATUS_STYLES: Record<string, string> = {
  created: "bg-bg-tertiary text-text-secondary",
  pending_payment: "bg-warning/10 text-warning",
  escrowed: "bg-accent/10 text-accent",
  delivery_confirmed: "bg-accent/10 text-accent",
  completed: "bg-success/10 text-success",
  disputed: "bg-error/10 text-error",
  resolved: "bg-bg-tertiary text-text-secondary",
  refunded: "bg-error/10 text-error",
};

export function OrderList({
  orders,
  onRefresh,
}: {
  orders: OrderData[];
  onRefresh: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmDelivery(orderId: string) {
    setConfirming(orderId);
    setError(null);
    try {
      const res = await facilitatorFetch(`/api/orders/${orderId}/confirm-delivery`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="panel-surface rounded-2xl p-8 text-center">
        <p className="text-sm text-text-tertiary">
          No orders yet. Orders where you are the seller will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-surface rounded-2xl p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-tertiary">
        Orders
      </h3>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex flex-col gap-3 rounded-xl border border-border-default bg-bg-primary/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{order.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_STYLES[order.status] ?? "bg-bg-tertiary text-text-secondary"
                  }`}
                >
                  {order.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-tertiary">
                <span>{order.priceUsdc.toFixed(2)} USDC</span>
                {order.buyerAddress && (
                  <span className="font-mono">
                    Buyer: {order.buyerAddress.slice(0, 6)}...{order.buyerAddress.slice(-4)}
                  </span>
                )}
                <span>
                  {new Date(order.createdAt * 1000).toLocaleDateString()}
                </span>
                {order.escrowId !== undefined && (
                  <span>Escrow #{order.escrowId}</span>
                )}
              </div>
            </div>

            {order.status === "escrowed" && (
              <button
                onClick={() => handleConfirmDelivery(order.id)}
                disabled={confirming === order.id}
                className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {confirming === order.id ? "Confirming..." : "Confirm Delivery"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
