"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const scoringFactors = [
  { label: "Completion Rate",    color: "bg-accent" },
  { label: "Dispute Rate",       color: "bg-warning" },
  { label: "Refund Rate",        color: "bg-accent-purple" },
  { label: "Transaction Volume", color: "bg-success" },
];

const confidenceLevels = [
  {
    label: "Low",
    range: "< 3 escrows",
    desc: "Default parameters, score not shown",
    badgeClass: "bg-bg-tertiary text-text-secondary border-border-default",
  },
  {
    label: "Medium",
    range: "3–9 escrows",
    desc: "Score visible, history building",
    badgeClass: "bg-warning/10 text-warning border-warning/25",
  },
  {
    label: "High",
    range: "10+ escrows",
    desc: "Full parameter adjustments active",
    badgeClass: "bg-success/10 text-success border-success/25",
  },
];

const windowTiers = [
  {
    condition: "High trust (score ≥ 80, high confidence)",
    window: "Shortened",
    badgeClass: "text-success",
  },
  {
    condition: "New or moderate trust",
    window: "Default",
    badgeClass: "text-text-tertiary",
  },
  {
    condition: "Low trust (score < 40)",
    window: "Extended",
    badgeClass: "text-error",
  },
];

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
          The On-Chain Credit Score
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-10 text-center text-base text-text-secondary max-w-2xl mx-auto"
        >
          Every escrow outcome builds a portable credit score. Today it shapes settlement terms. Tomorrow it unlocks lending, insurance, and priority access across any protocol.
        </motion.p>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Score Formula */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-accent/10 p-2 text-accent">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="10" width="3" height="7" rx="0.5" />
                  <rect x="8.5" y="6" width="3" height="11" rx="0.5" />
                  <rect x="14" y="3" width="3" height="14" rx="0.5" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Score Signals</h3>
            </div>
            <div className="space-y-2">
              {scoringFactors.map((factor) => (
                <div key={factor.label} className="flex items-center gap-2.5">
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${factor.color}`} />
                  <span className="flex-1 text-xs text-text-secondary">{factor.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Computed from on-chain escrow history. Portable across any protocol that reads the chain.
            </p>
          </motion.div>

          {/* Card 2: Confidence Levels */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-success/10 p-2 text-success">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2L3 6v5c0 4.4 3 7.5 7 9 4-1.5 7-4.6 7-9V6l-7-4z" />
                  <path d="M7 10l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Confidence Levels</h3>
            </div>
            <div className="space-y-3">
              {confidenceLevels.map((level) => (
                <div key={level.label} className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${level.badgeClass}`}
                  >
                    {level.label}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-text-primary">{level.range}</p>
                    <p className="text-[11px] text-text-tertiary">{level.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Card 3: Dynamic Release Windows */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg bg-accent-purple/10 p-2 text-accent-purple">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l2.5 2.5" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold">Beyond Settlement</h3>
            </div>
            <div className="space-y-2">
              {windowTiers.map((tier) => (
                <div
                  key={tier.condition}
                  className="flex items-center justify-between rounded-lg border border-border-default bg-bg-primary/50 px-3 py-2"
                >
                  <span className="text-xs text-text-secondary">{tier.condition}</span>
                  <span className={`ml-2 shrink-0 font-mono text-xs font-medium ${tier.badgeClass}`}>
                    {tier.window}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Faster settlement today. Lending, insurance, and priority access next.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
