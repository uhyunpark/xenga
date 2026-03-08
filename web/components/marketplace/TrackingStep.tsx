"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

interface TrackingEvent {
  label: string;
  detail: string;
  delayMs: number;
}

const TRACKING_EVENTS: TrackingEvent[] = [
  { label: "Order Confirmed", detail: "Seller acknowledged order", delayMs: 0 },
  { label: "Preparing Shipment", detail: "Item being packaged", delayMs: 3000 },
  { label: "In Transit", detail: "Package picked up", delayMs: 6000 },
  { label: "Delivered", detail: "Delivery confirmed", delayMs: 9000 },
];

interface TrackingStepProps {
  escrowId: number | null;
  txHash: string | null;
  contentHash?: string | null;
  deliveryConfirmed: boolean;
  disputeFiled: boolean;
  loading: boolean;
  loadingAction?: "release" | "dispute" | null;
  onRelease: () => void;
  onDispute: () => void;
}

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function TrackingStep({
  escrowId,
  txHash,
  contentHash,
  deliveryConfirmed,
  disputeFiled,
  loading,
  loadingAction,
  onRelease,
  onDispute,
}: TrackingStepProps) {
  const [visibleEvents, setVisibleEvents] = useState(1); // first event shows immediately
  const [showDetails, setShowDetails] = useState(false);

  // Animate tracking events over time
  useEffect(() => {
    if (visibleEvents >= TRACKING_EVENTS.length) return;

    const nextEvent = TRACKING_EVENTS[visibleEvents];
    const delay = nextEvent.delayMs - (visibleEvents > 0 ? TRACKING_EVENTS[visibleEvents - 1].delayMs : 0);

    const timer = setTimeout(() => {
      setVisibleEvents((v) => v + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [visibleEvents]);

  return (
    <motion.div
      key="tracking"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel-surface rounded-xl p-4"
    >
      <div className="mb-4 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2">
          <circle cx="8" cy="8" r="6" />
          <path d="M5 8l2 2 4-4" />
        </svg>
        <span className="text-sm font-semibold text-success">Funds in Escrow</span>
      </div>

      {/* Delivery timeline */}
      <div className="mb-4 space-y-0">
        {TRACKING_EVENTS.slice(0, visibleEvents).map((evt, i) => {
          const isLatest = i === visibleEvents - 1;
          const isLast = i === TRACKING_EVENTS.length - 1;

          return (
            <motion.div
              key={evt.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-3"
            >
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className={`h-2.5 w-2.5 rounded-full ${
                  isLatest && !isLast
                    ? "bg-accent animate-pulse"
                    : isLast
                      ? "bg-success"
                      : "bg-accent/50"
                }`} />
                {!isLast && (
                  <div className="w-px flex-1 bg-border-default" />
                )}
              </div>

              {/* Content */}
              <div className={`pb-3 ${isLast ? "pb-0" : ""}`}>
                <p className={`text-xs font-medium ${
                  isLatest ? "text-text-primary" : "text-text-secondary"
                }`}>
                  {evt.label}
                </p>
                <p className="text-[11px] text-text-tertiary">{evt.detail}</p>
              </div>
            </motion.div>
          );
        })}

        {/* Loading indicator for next event */}
        {visibleEvents < TRACKING_EVENTS.length && (
          <div className="flex items-center gap-3 pt-1">
            <div className="flex h-2.5 w-2.5 items-center justify-center">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-tertiary/30" />
            </div>
            <span className="text-[11px] text-text-tertiary">
              {TRACKING_EVENTS[visibleEvents].label}...
            </span>
          </div>
        )}
      </div>

      {/* Action buttons after delivery confirmed */}
      {deliveryConfirmed && !disputeFiled && visibleEvents >= TRACKING_EVENTS.length && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-2.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 8l2 2 4-4" />
              </svg>
              <span className="text-xs font-medium text-success">
                Seller confirmed delivery
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary">
              You can release funds to the seller or file a dispute.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onRelease}
                disabled={!!loadingAction}
                className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
              >
                {loadingAction === "release" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Releasing...
                  </span>
                ) : "Release Funds"}
              </button>
              <button
                onClick={onDispute}
                disabled={!!loadingAction}
                className="flex-1 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
              >
                {loadingAction === "dispute" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-error border-t-transparent" />
                    Filing Dispute...
                  </span>
                ) : "Dispute"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Waiting for delivery */}
      {!deliveryConfirmed && !disputeFiled && visibleEvents >= TRACKING_EVENTS.length && (
        <div className="flex items-center gap-3 py-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-xs text-text-secondary">
            Waiting for on-chain delivery confirmation...
          </p>
        </div>
      )}

      {/* Dispute filed */}
      {disputeFiled && (
        <div className="flex items-center gap-3 rounded-lg border border-error/20 bg-error/5 p-3">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-error border-t-transparent" />
          <span className="text-xs text-error">
            Arbiter reviewing dispute...
          </span>
        </div>
      )}

      {/* Escrow details (collapsible) */}
      {(escrowId || txHash) && (
        <div className="mt-3 border-t border-border-default pt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex w-full items-center justify-between text-xs text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <span>Escrow Details</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`transition-transform ${showDetails ? "rotate-180" : ""}`}
            >
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </button>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 space-y-1 text-xs"
            >
              {escrowId && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Escrow ID</span>
                  <span className="font-mono">#{escrowId}</span>
                </div>
              )}
              {txHash && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Tx Hash</span>
                  {isMockChainClient ? (
                    <span className="font-mono text-text-secondary">
                      {txHash.slice(0, 10)}...
                    </span>
                  ) : (
                    <a
                      href={`https://sepolia.basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-accent hover:underline"
                    >
                      {txHash.slice(0, 10)}...
                    </a>
                  )}
                </div>
              )}
              {contentHash && contentHash !== ZERO_HASH && (
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Evidence Hash</span>
                  <span className="font-mono text-text-secondary" title={contentHash}>
                    {contentHash.slice(0, 10)}...{contentHash.slice(-4)}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
