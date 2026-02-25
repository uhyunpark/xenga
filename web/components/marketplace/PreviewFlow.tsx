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
    case "select":
      return (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10" />
          <div>
            <p className="font-medium">{PREVIEW_PRODUCT.title}</p>
            <p className="text-sm text-text-tertiary">{PREVIEW_PRODUCT.price} USDC</p>
          </div>
        </div>
      );
    case "create_order":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p><span className="text-text-tertiary">POST</span> /api/orders</p>
          <p><span className="text-text-tertiary">orderId:</span> {PREVIEW_ORDER.orderId.slice(0, 18)}...</p>
          <p><span className="text-text-tertiary">seller:</span> {PREVIEW_ORDER.sellerAddress.slice(0, 10)}...</p>
          <p><span className="text-text-tertiary">status:</span> <span className="text-success">created</span></p>
        </div>
      );
    case "request_payment":
      return (
        <div className="space-y-2 font-mono text-xs">
          <p className="text-warning">HTTP 402 Payment Required</p>
          <div className="space-y-1 text-text-tertiary">
            <p>scheme: <span className="text-text-primary">escrow</span></p>
            <p>amount: <span className="text-text-primary">{PREVIEW_PAYMENT_REQUIRED.amount}</span> (25 USDC)</p>
            <p>releaseWindow: <span className="text-text-primary">604800</span> (7 days)</p>
            <p>serviceType: <span className="text-text-primary">marketplace</span></p>
            <p>facilitatorFee: <span className="text-text-primary">{PREVIEW_PAYMENT_REQUIRED.facilitatorFee}</span></p>
          </div>
        </div>
      );
    case "sign":
      return (
        <div className="space-y-2 font-mono text-xs">
          <p className="text-accent">EIP-712 ReceiveWithAuthorization</p>
          <div className="space-y-1 text-text-tertiary">
            <p>domain: <span className="text-text-primary">USDC on Base Sepolia</span></p>
            <p>from: <span className="text-text-primary">0xBuyer...1234</span></p>
            <p>to: <span className="text-text-primary">EscrowVault</span></p>
            <p>value: <span className="text-text-primary">25000000</span></p>
            <p>nonce: <span className="text-text-primary">0xabc123...</span></p>
          </div>
        </div>
      );
    case "submit":
      return (
        <div className="space-y-2 font-mono text-xs">
          <p className="text-success">HTTP 200 OK</p>
          <div className="space-y-1 text-text-tertiary">
            <p>escrowId: <span className="text-text-primary">{PREVIEW_SETTLEMENT.escrowId}</span></p>
            <p>txHash: <span className="text-text-primary">{PREVIEW_SETTLEMENT.txHash.slice(0, 18)}...</span></p>
            <p>onChain: <span className="text-text-primary">createEscrowWithAuth()</span></p>
          </div>
        </div>
      );
    case "escrowed":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p>state: <span className="text-accent">Active</span></p>
          <p>buyer: 0xBuyer...1234</p>
          <p>seller: {PREVIEW_ORDER.sellerAddress.slice(0, 10)}...</p>
          <p>amount: 25 USDC (locked)</p>
          <p>autoRelease: 7 days + dispute window</p>
        </div>
      );
    case "delivery":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p>seller calls: <span className="text-accent">confirmDelivery(42)</span></p>
          <p>buyer calls: <span className="text-success">releaseFunds(42)</span></p>
          <p>state: Active → <span className="text-success">Completed</span></p>
        </div>
      );
    case "complete":
      return (
        <div className="space-y-1 font-mono text-xs">
          <p>seller receives: <span className="text-success">24.925 USDC</span> (minus fee)</p>
          <p>feeRecipient: <span className="text-text-primary">0.075 USDC</span></p>
          <p>reputation: seller +1 completed, buyer +1 completed</p>
        </div>
      );
    default:
      return null;
  }
}

