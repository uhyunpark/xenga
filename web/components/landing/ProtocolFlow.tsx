"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const steps = [
  { label: "Request", icon: "1", desc: "Client sends HTTP request" },
  { label: "402", icon: "402", desc: "Server returns Payment Required" },
  { label: "Sign", icon: "3", desc: "Client signs EIP-712 authorization" },
  { label: "Retry", icon: "4", desc: "Client retries with PAYMENT-SIGNATURE" },
  { label: "Escrow", icon: "5", desc: "Funds locked in smart contract" },
  { label: "Deliver", icon: "6", desc: "Seller confirms delivery" },
  { label: "Release", icon: "7", desc: "Funds released to seller" },
  { label: "Reputation", icon: "★", desc: "On-chain reputation score updated" },
];

export function ProtocolFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="px-4 py-24" ref={ref}>
      <div className="mx-auto max-w-7xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-12 text-center text-3xl font-semibold text-text-primary"
        >
          End-to-End Escrow Settlement Flow
        </motion.h2>

        <div className="panel-surface rounded-2xl p-4 md:p-5">
          <div className="grid gap-4 pb-1 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.06 }}
                className="flex min-h-[88px] rounded-xl border border-border-default bg-bg-secondary p-3 shadow-sm"
              >
                <div className="flex h-full flex-col">
                  <span
                    className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      step.icon === "402"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : step.icon === "★"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-accent/30 bg-accent-light text-accent"
                    }`}
                  >
                    {step.icon}
                  </span>
                  <span className="mt-2 text-sm font-semibold text-text-primary">
                    {step.label}
                  </span>
                  <span className="mt-1 text-xs text-text-secondary">
                    {step.desc}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            Sequence: payment negotiation, typed-data signature, and escrow settlement all visible in the protocol inspector.
          </p>
        </div>
      </div>
    </section>
  );
}
