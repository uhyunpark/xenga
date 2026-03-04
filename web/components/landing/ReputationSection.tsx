"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export function ReputationSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-24" ref={ref}>
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4 }}
          className="mb-4 text-center text-3xl font-semibold text-text-primary"
        >
          Open Credit Data
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-10 text-center text-base text-text-secondary max-w-2xl mx-auto"
        >
          Every escrow outcome is recorded on-chain as raw stats — permissionless
          and portable. Any protocol can read the data and compute scores their
          own way.
        </motion.p>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Raw On-Chain Data */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-accent/10 p-2 text-accent">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="14" height="14" rx="2" />
                  <path d="M3 7h14" />
                  <path d="M7 3v14" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Raw On-Chain Data</h3>
            </div>
            <div className="rounded-lg bg-bg-primary/80 border border-border-default p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
              <div className="text-text-tertiary mb-1">{"// Stats struct per address"}</div>
              <div>totalEscrows</div>
              <div>completedCount</div>
              <div>completedAmount</div>
              <div>disputedCount</div>
              <div>disputedAmount</div>
              <div>resolvedCount</div>
              <div>refundedCount</div>
              <div>refundedAmount</div>
              <div>totalAmount</div>
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Stored per address in EscrowVault. Readable by anyone
              — <span className="font-mono">getSellerStats(addr)</span> / <span className="font-mono">getBuyerStats(addr)</span>.
            </p>
          </motion.div>

          {/* Card 2: Example — Marketplace Scoring */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-success/10 p-2 text-success">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 17l4-4m0 0l4-8 4 8m-8 0h8" />
                  <circle cx="4" cy="17" r="1.5" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Example: Marketplace Scoring</h3>
            </div>
            <div className="rounded-lg bg-bg-primary/80 border border-border-default p-3 font-mono text-[11px] leading-relaxed text-text-secondary overflow-x-auto">
              <div className="text-text-tertiary mb-1">{"// weight completion + disputes"}</div>
              <div>completionRate =</div>
              <div className="pl-2">completed / totalEscrows</div>
              <div className="mt-1">disputeRate =</div>
              <div className="pl-2">disputed / totalEscrows</div>
              <div className="mt-1">score =</div>
              <div className="pl-2">completionRate * 0.6</div>
              <div className="pl-2">+ (1 - disputeRate) * 0.4</div>
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Weight completion and dispute history for buyer-seller trust. One
              possible interpretation.
            </p>
          </motion.div>

          {/* Card 3: Example — Lending Protocol */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-accent-purple/10 p-2 text-accent-purple">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2v3m0 10v3M2 10h3m10 0h3" />
                  <circle cx="10" cy="10" r="4" />
                  <path d="M8.5 10h3M10 8.5v3" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Example: Lending Protocol</h3>
            </div>
            <div className="rounded-lg bg-bg-primary/80 border border-border-default p-3 font-mono text-[11px] leading-relaxed text-text-secondary overflow-x-auto">
              <div className="text-text-tertiary mb-1">{"// weight volume + repayment"}</div>
              <div>repaymentRate =</div>
              <div className="pl-2">completedAmount / totalAmount</div>
              <div className="mt-1">volumeFactor =</div>
              <div className="pl-2">log10(totalAmount + 1) / 6</div>
              <div className="mt-1">score =</div>
              <div className="pl-2">repaymentRate * 0.7</div>
              <div className="pl-2">+ volumeFactor * 0.3</div>
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Same on-chain data, different formula. Lenders can weight volume
              and repayment differently.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
