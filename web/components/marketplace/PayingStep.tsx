"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PaySubStep } from "./StepTracker";

const PAY_SUB_STEPS: { key: Exclude<PaySubStep, "locked">; label: string; description: string }[] = [
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
  const isLocked = paySubStep === "locked";
  const currentIndex = isLocked ? PAY_SUB_STEPS.length : PAY_SUB_STEPS.findIndex((s) => s.key === paySubStep);

  return (
    <motion.div
      key="paying"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="panel-surface rounded-xl p-4"
    >
      <AnimatePresence mode="wait">
        {isLocked ? (
          <motion.div
            key="locked"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-6"
          >
            {/* Pulsing rings */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border-2 border-accent/30"
                style={{ animation: "lock-pulse 2s ease-out infinite" }}
              />
              <div
                className="absolute inset-1 rounded-full border-2 border-accent/20"
                style={{ animation: "lock-pulse 2s ease-out infinite 0.3s" }}
              />
              <div
                className="absolute inset-2 rounded-full border-2 border-accent/10"
                style={{ animation: "lock-pulse 2s ease-out infinite 0.6s" }}
              />
              {/* Shield/lock icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.08, 1] }}
                transition={{ duration: 0.5, times: [0, 0.7, 1], type: "spring", stiffness: 200, damping: 15 }}
                className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15"
              >
                <svg
                  className="h-6 w-6 text-accent"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" className="animate-draw-check" />
                </svg>
              </motion.div>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-4 text-sm font-semibold text-accent"
            >
              Funds securely locked in escrow
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-1 text-xs text-text-tertiary"
            >
              Protected until delivery is confirmed
            </motion.p>
          </motion.div>
        ) : (
          <motion.div key="steps" exit={{ opacity: 0 }}>
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
                      <AnimatePresence mode="wait">
                        {isPast ? (
                          <motion.div
                            key="check"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15"
                          >
                            <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M4 8l3 3 5-5" className="animate-draw-check" />
                            </svg>
                          </motion.div>
                        ) : isError ? (
                          <motion.div
                            key="error"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-error/15"
                          >
                            <svg className="h-3 w-3 text-error" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 5l6 6M11 5l-6 6" />
                            </svg>
                          </motion.div>
                        ) : isCurrent ? (
                          <motion.div
                            key="spinner"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          </motion.div>
                        ) : (
                          <div key="dot" className="h-2 w-2 rounded-full bg-border-default" />
                        )}
                      </AnimatePresence>
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
        )}
      </AnimatePresence>
    </motion.div>
  );
}
