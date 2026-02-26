"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { BuyerStep } from "./StepTracker";

interface SellerPanelProps {
  step: BuyerStep;
  productTitle?: string;
  deliveryConfirmed?: boolean;
}

const sellerMessages: Record<BuyerStep, { text: string; status: "idle" | "active" | "done" }> = {
  browse: { text: "Waiting for buyer...", status: "idle" },
  configure: { text: "Buyer customizing order...", status: "active" },
  review_terms: { text: "Buyer reviewing terms...", status: "active" },
  paying: { text: "Processing payment...", status: "active" },
  tracking: { text: "Shipping item...", status: "active" },
  complete: { text: "Funds received! Order complete.", status: "done" },
};

export function SellerPanel({ step, productTitle, deliveryConfirmed }: SellerPanelProps) {
  const message = step === "tracking" && deliveryConfirmed
    ? { text: "Delivery confirmed!", status: "done" as const }
    : sellerMessages[step];

  return (
    <div className="panel-surface rounded-xl p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="5" r="3" />
            <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          </svg>
        </div>
        <span className="text-sm font-semibold">Seller Operator</span>
        <span className="text-xs text-text-tertiary">(Auto-simulated)</span>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            message.status === "done"
              ? "border-success/30 bg-success/10 text-success"
              : message.status === "active"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border-default bg-bg-primary/55 text-text-tertiary"
          }`}
        >
          {message.status === "done"
            ? "Settled"
            : message.status === "active"
              ? "In progress"
              : "Idle"}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${deliveryConfirmed}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          {productTitle && step !== "browse" && (
            <div className="rounded-lg border border-border-default bg-bg-primary/55 p-3 text-xs text-text-secondary">
              Order: {productTitle}
            </div>
          )}

          <div className="rounded-lg border border-border-default bg-bg-secondary/50 p-3">
            <div className="flex items-center gap-2">
              {message.status === "active" && (
                <div className="h-2 w-2 animate-pulse rounded-full bg-warning" />
              )}
              {message.status === "done" && (
                <div className="h-2 w-2 rounded-full bg-success" />
              )}
              {message.status === "idle" && (
                <div className="h-2 w-2 rounded-full bg-text-tertiary" />
              )}
              <span
                className={`text-sm ${
                  message.status === "done"
                    ? "text-success"
                    : message.status === "active"
                      ? "text-text-primary"
                      : "text-text-tertiary"
                }`}
              >
                {message.text}
              </span>
            </div>
          </div>

          {step === "tracking" && !deliveryConfirmed && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-2 text-xs text-warning">
              Auto-confirming delivery in ~5 seconds...
            </div>
          )}

          {step === "tracking" && deliveryConfirmed && (
            <div className="rounded-lg border border-success/20 bg-success/5 p-2 text-xs text-success">
              Delivery has been confirmed on-chain. Waiting for buyer to release funds.
            </div>
          )}

          {step === "complete" && (
            <div className="rounded-lg border border-success/20 bg-success/5 p-2 text-xs text-success">
              Transaction complete. Seller has been paid.
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
