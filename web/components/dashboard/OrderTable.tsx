"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { shortenAddress } from "@/lib/utils";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

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

const STATUS_STYLES: Record<string, string> = {
  created: "border-text-tertiary/30 bg-text-tertiary/10 text-text-tertiary",
  pending_payment: "border-warning/30 bg-warning/10 text-warning",
  escrowed: "border-accent/30 bg-accent/10 text-accent",
  delivery_confirmed: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
  completed: "border-success/30 bg-success/10 text-success",
  disputed: "border-error/30 bg-error/10 text-error",
  resolved: "border-warning/30 bg-warning/10 text-warning",
  refunded: "border-text-secondary/30 bg-text-secondary/10 text-text-secondary",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

function filterOrders(orders: OrderData[], filter: FilterKey): OrderData[] {
  switch (filter) {
    case "active":
      return orders.filter((o) => o.status === "escrowed" || o.status === "delivery_confirmed");
    case "completed":
      return orders.filter((o) => o.status === "completed" || o.status === "resolved" || o.status === "refunded");
    case "disputed":
      return orders.filter((o) => o.status === "disputed");
    default:
      return orders;
  }
}

interface OrderTableProps {
  orders: OrderData[];
  actionSlot?: (order: OrderData) => React.ReactNode;
}

export function OrderTable({ orders, actionSlot }: OrderTableProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = filterOrders(orders, filter);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-4 border-b border-border-default">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`relative px-1 pb-2 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
            {filter === tab.key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary p-8 text-center text-sm text-text-secondary shadow-sm">
          No orders match this filter.
        </div>
      ) : (
        <div className="divide-y divide-border-default rounded-xl border border-border-default bg-bg-secondary shadow-sm">
          {filtered.map((order) => (
            <div key={order.id}>
              <button
                onClick={() =>
                  setExpandedId(expandedId === order.id ? null : order.id)
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-bg-tertiary"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {order.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLES[order.status] || STATUS_STYLES.created
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
                    <span>${order.priceUsdc.toFixed(2)}</span>
                    {order.buyerAddress && (
                      <span>{shortenAddress(order.buyerAddress)}</span>
                    )}
                    <span>
                      {new Date(order.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <svg
                  className={`ml-2 h-4 w-4 shrink-0 transition-transform ${
                    expandedId === order.id ? "rotate-180 text-accent" : "text-text-tertiary"
                  }`}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Inline detail panel */}
              <AnimatePresence initial={false}>
                {expandedId === order.id && (
                  <motion.div
                    key="detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="border-t border-border-default bg-bg-tertiary/30 px-4 py-3 shadow-sm">
                      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div>
                          <span className="text-text-tertiary">Escrow ID</span>
                          <p className="font-mono font-medium">
                            {order.escrowId ?? "\u2014"}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Amount</span>
                          <p className="font-medium">
                            ${order.priceUsdc.toFixed(2)} USDC
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Tx Hash</span>
                          <p className="truncate font-mono font-medium">
                            {order.txHash
                              ? `${order.txHash.slice(0, 10)}...`
                              : "\u2014"}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Buyer</span>
                          <p className="font-mono font-medium">
                            {order.buyerAddress
                              ? shortenAddress(order.buyerAddress)
                              : "\u2014"}
                          </p>
                        </div>
                        {order.contentHash && order.contentHash !== ZERO_HASH && (
                          <div>
                            <span className="text-text-tertiary">Content Hash</span>
                            <p className="truncate font-mono font-medium" title={order.contentHash}>
                              {`${order.contentHash.slice(0, 10)}...`}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Evidence section */}
                      {order.contentMetadata && (
                        <EvidenceSection metadata={order.contentMetadata} />
                      )}

                      {/* Action slot */}
                      {actionSlot && (
                        <div className="mt-3 border-t border-border-default pt-3">
                          {actionSlot(order)}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceSection({ metadata }: { metadata: string }) {
  const [expanded, setExpanded] = useState(false);

  let parsed: any = null;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    // Not valid JSON, display as raw string
  }

  return (
    <div className="mt-3 border-t border-border-default pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-xs text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <span>View Evidence</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border-default bg-bg-primary p-2">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-text-secondary">
            {parsed ? JSON.stringify(parsed, null, 2) : metadata}
          </pre>
        </div>
      )}
    </div>
  );
}
