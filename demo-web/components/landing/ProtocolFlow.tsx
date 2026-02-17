"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const steps = [
  { label: "Request", icon: "1", desc: "Client sends HTTP request" },
  { label: "402", icon: "402", desc: "Server returns Payment Required" },
  { label: "Sign", icon: "3", desc: "Client signs EIP-712 authorization" },
  { label: "Retry", icon: "4", desc: "Client retries with X-PAYMENT" },
  { label: "Escrow", icon: "5", desc: "Funds locked in smart contract" },
  { label: "Deliver", icon: "6", desc: "Seller confirms delivery" },
  { label: "Release", icon: "7", desc: "Funds released to seller" },
];

export function ProtocolFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="px-4 py-20" ref={ref}>
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-12 text-center text-2xl font-semibold md:text-3xl"
        >
          End-to-End x402 Escrow Flow
        </motion.h2>

        <div className="panel-surface overflow-x-auto rounded-2xl p-4 md:p-5">
          <div className="flex min-w-max items-stretch gap-3 pb-1">
            {steps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.06 }}
                className="relative flex min-h-[108px] w-[170px] shrink-0 rounded-xl border border-border-default bg-bg-secondary p-3"
              >
                <div className="flex h-full flex-col">
                  <span
                    className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      step.icon === "402"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-accent/30 bg-accent/10 text-accent"
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
                {i < steps.length - 1 && (
                  <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-text-tertiary md:block">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M1.5 5h7M5.5 1.5L9 5 5.5 8.5" />
                    </svg>
                  </span>
                )}
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            Sequence: 402 negotiation, typed-data signature, and escrow settlement all visible in the protocol inspector.
          </p>
        </div>
      </div>
    </section>
  );
}
