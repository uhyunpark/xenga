"use client";

import Link from "next/link";
import { shortenAddress } from "@/lib/utils";

interface OrderEvent {
  id: string;
  title: string;
  status: string;
  priceUsdc: number;
  buyerAddress?: string;
  createdAt: number;
}

const STATUS_LABELS: Record<string, string> = {
  created: "Order created",
  escrowed: "Payment received",
  delivery_confirmed: "Delivery confirmed",
  completed: "Funds released",
  disputed: "Dispute filed",
  resolved: "Dispute resolved",
  refunded: "Refunded",
};

export function ActivityFeed({ orders }: { orders: OrderEvent[] }) {
  const recent = orders.slice(0, 10);

  if (recent.length === 0) {
    return (
      <div className="panel-surface rounded-xl p-6 text-center text-sm text-text-secondary">
        No orders yet. Create a payment link or integrate via API to get started.
      </div>
    );
  }

  return (
    <div className="panel-surface rounded-xl">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
        <Link
          href="/dashboard/orders"
          className="text-xs text-accent hover:text-accent/80"
        >
          View all orders &rarr;
        </Link>
      </div>
      <div className="divide-y divide-border-default">
        {recent.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{order.title}</p>
              <p className="text-xs text-text-tertiary">
                {STATUS_LABELS[order.status] || order.status}
                {order.buyerAddress
                  ? ` \u00b7 ${shortenAddress(order.buyerAddress)}`
                  : ""}
              </p>
            </div>
            <div className="ml-4 text-right">
              <p className="text-sm font-medium">
                ${order.priceUsdc.toFixed(2)}
              </p>
              <p className="text-xs text-text-tertiary">
                {new Date(order.createdAt * 1000).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
