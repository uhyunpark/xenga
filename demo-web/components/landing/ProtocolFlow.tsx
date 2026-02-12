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
          The x402 Payment Flow
        </motion.h2>

        <div className="relative flex items-start justify-between overflow-x-auto pb-4">
          {/* Connection line */}
          <div className="absolute left-0 right-0 top-6 h-[2px] bg-border-default" />

          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1 }}
              className="relative z-10 flex min-w-[80px] flex-col items-center px-1 md:min-w-[100px]"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-500 ${
                  isInView
                    ? step.icon === "402"
                      ? "border-warning bg-warning/20 text-warning"
                      : "border-accent bg-accent/20 text-accent"
                    : "border-border-default bg-bg-secondary text-text-tertiary"
                }`}
              >
                {step.icon}
              </div>
              <span className="mt-2 text-center text-xs font-medium text-text-primary">
                {step.label}
              </span>
              <span className="mt-1 text-center text-[10px] text-text-tertiary hidden md:block">
                {step.desc}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
