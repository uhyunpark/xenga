"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DemoStep } from "./StepTracker";

interface SellerPanelProps {
  step: DemoStep;
  productTitle?: string;
  deliveryConfirmed?: boolean;
}

const sellerMessages: Record<DemoStep, { text: string; status: "idle" | "active" | "done" }> = {
  select: { text: "Waiting for buyer...", status: "idle" },
  create_order: { text: "New order received!", status: "active" },
  request_payment: { text: "Waiting for payment...", status: "active" },
  sign: { text: "Buyer is signing payment...", status: "active" },
  submit: { text: "Processing payment...", status: "active" },
  escrowed: { text: "Payment received! Preparing to ship...", status: "active" },
  delivery: { text: "Shipping item & confirming delivery...", status: "active" },
  complete: { text: "Funds received! Order complete.", status: "done" },
};

export function SellerPanel({ step, productTitle, deliveryConfirmed }: SellerPanelProps) {
  const message = step === "delivery" && deliveryConfirmed
    ? { text: "Delivery confirmed!", status: "done" as const }
    : sellerMessages[step];

  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="5" r="3" />
            <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          </svg>
        </div>
        <span className="text-sm font-medium">Seller</span>
        <span className="text-xs text-text-tertiary">(Auto-simulated)</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${deliveryConfirmed}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          {productTitle && step !== "select" && (
            <div className="rounded-lg bg-bg-tertiary p-3 text-xs text-text-secondary">
              Order: {productTitle}
            </div>
          )}

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

          {step === "delivery" && !deliveryConfirmed && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-2 text-xs text-warning">
              Auto-confirming delivery in ~5 seconds...
            </div>
          )}

          {step === "delivery" && deliveryConfirmed && (
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
