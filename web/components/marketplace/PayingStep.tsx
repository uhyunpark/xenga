"use client";

import { motion } from "framer-motion";
import type { PaySubStep } from "./StepTracker";

const PAY_SUB_STEPS: { key: PaySubStep; label: string; description: string }[] = [
  { key: "creating_order", label: "Creating order", description: "Registering order with the facilitator" },
  { key: "requesting_payment", label: "Requesting payment terms", description: "Fetching escrow terms via HTTP 402" },
  { key: "signing", label: "Signing authorization", description: "EIP-712 ReceiveWithAuthorization for USDC" },
  { key: "submitting", label: "Submitting to chain", description: "Creating escrow on-chain" },
];

interface PayingStepProps {
  paySubStep: PaySubStep;
  error: string | null;
  onRetry: () => void;
  walletType?: string | null;
}

export function PayingStep({ paySubStep, error, onRetry, walletType }: PayingStepProps) {
  const currentIndex = PAY_SUB_STEPS.findIndex((s) => s.key === paySubStep);

  return (
    <motion.div
      key="paying"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel-surface rounded-xl p-4"
    >
      <h3 className="mb-4 text-sm font-semibold">Processing Payment</h3>

      <div className="space-y-3">
        {PAY_SUB_STEPS.map((sub, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isError = isCurrent && !!error;

          return (
            <div key={sub.key} className="flex items-start gap-3">
              {/* Status indicator */}
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {isPast ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15">
                    <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 8l3 3 5-5" />
                    </svg>
                  </div>
                ) : isError ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-error/15">
                    <svg className="h-3 w-3 text-error" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 5l6 6M11 5l-6 6" />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-border-default" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <p className={`text-xs font-medium ${
                  isPast ? "text-success" : isError ? "text-error" : isCurrent ? "text-text-primary" : "text-text-tertiary"
                }`}>
                  {sub.label}
                  {isCurrent && sub.key === "signing" && walletType === "browser" && (
                    <span className="ml-1.5 text-[10px] font-normal text-text-tertiary">
                      (check MetaMask)
                    </span>
                  )}
                </p>
                <p className={`text-[11px] ${
                  isPast ? "text-text-tertiary" : isCurrent ? "text-text-secondary" : "text-text-tertiary/50"
                }`}>
                  {sub.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 space-y-2">
          <div className="rounded-lg border border-error/20 bg-error/5 p-2.5 text-xs text-error">
            {error}
          </div>
          <button
            onClick={onRetry}
            className="w-full rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Retry
          </button>
        </div>
      )}
    </motion.div>
  );
}
