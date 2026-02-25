"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DemoStep } from "./StepTracker";

interface SellerPanelProps {
  step: DemoStep;
  productTitle?: string;
  deliveryConfirmed?: boolean;
  loading?: boolean;
  onConfirmDelivery?: () => void;
  onRefund?: () => void;
}

const sellerMessages: Record<DemoStep, { text: string; status: "idle" | "active" | "done" }> = {
  select: { text: "Waiting for buyer...", status: "idle" },
  create_order: { text: "New order received!", status: "active" },
  request_payment: { text: "Waiting for payment...", status: "active" },
  sign: { text: "Buyer is signing payment...", status: "active" },
  submit: { text: "Processing payment...", status: "active" },
  escrowed: { text: "Payment escrowed! Ready to ship.", status: "active" },
  delivery: { text: "Confirm delivery when order is shipped.", status: "active" },
  complete: { text: "Funds received! Order complete.", status: "done" },
};

export function SellerPanel({ step, productTitle, deliveryConfirmed, loading, onConfirmDelivery, onRefund }: SellerPanelProps) {
  const message = step === "delivery" && deliveryConfirmed
    ? { text: "Delivery confirmed on-chain.", status: "done" as const }
    : sellerMessages[step];

  const showActions = step === "escrowed" || (step === "delivery" && !deliveryConfirmed);
  const showRefundAfterDelivery = step === "delivery" && deliveryConfirmed;

  return (
    <div className="panel-surface rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="5" r="3" />
            <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          </svg>
        </div>
        <span className="text-sm font-semibold">Seller</span>
        <span className="text-xs text-text-tertiary">(You)</span>
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
          {productTitle && step !== "select" && (
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

          {/* Action buttons for escrowed / pre-delivery states */}
          {showActions && (
            <div className="space-y-2">
              <button
                onClick={onConfirmDelivery}
                disabled={loading}
                className="w-full rounded-lg bg-accent-purple px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-purple/90 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Confirm Delivery"
                )}
              </button>
              <button
                onClick={onRefund}
                disabled={loading}
                className="w-full rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
              >
                Refund Buyer
              </button>
            </div>
          )}

          {/* After delivery confirmed, still allow refund */}
          {showRefundAfterDelivery && (
            <div className="space-y-2">
              <div className="rounded-lg border border-success/20 bg-success/5 p-2 text-xs text-success">
                Delivery has been confirmed on-chain. Waiting for buyer to release funds.
              </div>
              <button
                onClick={onRefund}
                disabled={loading}
                className="w-full rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
              >
                Refund Buyer
              </button>
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
