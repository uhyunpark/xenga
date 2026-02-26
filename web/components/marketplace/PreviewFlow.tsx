"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PREVIEW_STEPS,
  PREVIEW_PRODUCT,
  PREVIEW_ORDER,
  PREVIEW_PAYMENT_REQUIRED,
  PREVIEW_SETTLEMENT,
} from "./previewData";

export function PreviewFlow({ onExit }: { onExit: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const startPreview = useCallback(() => {
    setCurrentIndex(0);
    setRunning(true);
  }, []);

  // Auto-advance through steps
  useEffect(() => {
    if (!running || currentIndex < 0 || currentIndex >= PREVIEW_STEPS.length) return;

    const timer = setTimeout(() => {
      if (currentIndex < PREVIEW_STEPS.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setRunning(false);
      }
    }, PREVIEW_STEPS[currentIndex].durationMs);

    return () => clearTimeout(timer);
  }, [currentIndex, running]);

  // Auto-scroll to latest step (now at top)
  useEffect(() => {
    if (currentIndex >= 0) {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentIndex]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-center">
        <p className="text-sm font-medium text-accent">
          Preview Mode — Watch the demo, then try it live
        </p>
      </div>

      {/* Start / Replay button */}
      {currentIndex < 0 && (
        <div className="flex flex-col items-center gap-4 py-8">
          <h2 className="text-xl font-bold">Watch the Xenga Payment Flow</h2>
          <p className="max-w-md text-center text-sm text-text-secondary">
            See how escrow payments work end-to-end — from product selection
            to on-chain settlement and fund release. No wallet required.
          </p>
          <button
            onClick={startPreview}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent/90"
          >
            Watch Demo
          </button>
        </div>
      )}

      {currentIndex >= 0 && (
        <>
          {/* Step progress bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
            {PREVIEW_STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    i < currentIndex
                      ? "bg-success text-bg-primary"
                      : i === currentIndex
                        ? "bg-accent text-bg-primary"
                        : "border border-border-default text-text-tertiary"
                  }`}
                >
                  {i < currentIndex ? (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < PREVIEW_STEPS.length - 1 && (
                  <div
                    className={`h-px w-4 shrink-0 ${
                      i < currentIndex ? "bg-success" : "bg-border-default"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Stacked step cards — descending order (latest on top) */}
          <div ref={topRef} />
          <div className="space-y-3">
            <AnimatePresence>
              {PREVIEW_STEPS.slice(0, currentIndex + 1)
                .map((step, originalIndex) => ({ step, originalIndex }))
                .reverse()
                .map(({ step, originalIndex }) => {
                  const isActive = originalIndex === currentIndex;
                  const isCompleted = originalIndex < currentIndex;

                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className={`panel-surface rounded-2xl p-6 transition-all ${
                        isCompleted ? "opacity-75" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isCompleted ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        ) : (
                          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                            Step {originalIndex + 1}
                          </span>
                        )}
                        <span className={`text-sm font-semibold ${isCompleted ? "text-text-secondary" : "text-text-primary"}`}>
                          {step.label}
                        </span>
                        {isActive && running && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        )}
                      </div>

                      <p className={`mt-2 text-sm ${isCompleted ? "text-text-tertiary" : "text-text-secondary"}`}>
                        {step.description}
                      </p>
                      <div className={`mt-4 rounded-xl border p-4 ${
                        isCompleted
                          ? "border-border-default/50 bg-bg-primary/30"
                          : "border-border-default bg-bg-primary/50"
                      }`}>
                        <StepDetail stepId={step.id} />
                      </div>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          </div>

          {/* Completed state */}
          {!running && currentIndex >= PREVIEW_STEPS.length - 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setCurrentIndex(-1);
                  setRunning(false);
                }}
                className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary transition-colors hover:border-border-active hover:text-text-primary"
              >
                Replay
              </button>
              <button
                onClick={onExit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent/90"
              >
                Try It Live
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Full detail view for the active step */
function StepDetail({ stepId }: { stepId: string }) {
  switch (stepId) {
    case "browse":
      return (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10" />
          <div>
            <p className="font-medium">{PREVIEW_PRODUCT.title}</p>
            <p className="text-sm text-text-tertiary">{PREVIEW_PRODUCT.price} USDC</p>
          </div>
        </div>
      );
    case "review_terms":
      return (
        <div className="space-y-1.5 text-xs">
          <p className="font-medium text-accent">Escrow Terms</p>
          <div className="space-y-1 text-text-tertiary">
            <p>Release Window: <span className="text-text-primary">7 days</span></p>
            <p>Dispute Window: <span className="text-text-primary">3 days</span></p>
            <p>Facilitator Fee: <span className="text-text-primary">{(Number(PREVIEW_PAYMENT_REQUIRED.facilitatorFee) / 1_000_000).toFixed(4)} USDC ({(PREVIEW_PAYMENT_REQUIRED.feeBps / 100).toFixed(1)}%)</span></p>
            <p>Buyer Protection: <span className="text-success">Full refund on cancel</span></p>
          </div>
        </div>
      );
    case "pay":
      return (
        <div className="space-y-2 text-xs">
          <p className="font-medium">Payment Protocol (4 sub-steps)</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-text-tertiary">
              <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 8l3 3 5-5" /></svg>
              <span>Create order — <span className="text-text-primary">POST /api/orders</span></span>
            </div>
            <div className="flex items-center gap-2 text-text-tertiary">
              <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 8l3 3 5-5" /></svg>
              <span>Request terms — <span className="text-warning">HTTP 402</span></span>
            </div>
            <div className="flex items-center gap-2 text-text-tertiary">
              <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 8l3 3 5-5" /></svg>
              <span>Sign — <span className="text-accent">EIP-712 ReceiveWithAuthorization</span></span>
            </div>
            <div className="flex items-center gap-2 text-text-tertiary">
              <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 8l3 3 5-5" /></svg>
              <span>Submit — <span className="text-success">200 OK, escrowId: {PREVIEW_SETTLEMENT.escrowId}</span></span>
            </div>
          </div>
        </div>
      );
    case "tracking":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p>t+0s: <span className="text-success">Order Confirmed</span></p>
          <p>t+3s: <span className="text-text-primary">Preparing Shipment</span></p>
          <p>t+6s: <span className="text-text-primary">In Transit</span></p>
          <p>t+9s: <span className="text-success">Delivered</span></p>
          <p className="pt-1 text-text-tertiary">buyer calls: <span className="text-success">releaseFunds({PREVIEW_SETTLEMENT.escrowId})</span></p>
        </div>
      );
    case "complete":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p>seller receives: <span className="text-success">{(PREVIEW_PRODUCT.price - Number(PREVIEW_PAYMENT_REQUIRED.facilitatorFee) / 1_000_000).toFixed(4)} USDC</span> (minus fee)</p>
          <p>feeRecipient: <span className="text-text-primary">{(Number(PREVIEW_PAYMENT_REQUIRED.facilitatorFee) / 1_000_000).toFixed(4)} USDC</span></p>
          <p>reputation: seller +1 completed, buyer +1 completed</p>
        </div>
      );
    default:
      return null;
  }
}
