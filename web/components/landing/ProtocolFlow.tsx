"use client";

import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

const steps = [
  { label: "Request", icon: "1", desc: "Client sends HTTP request" },
  { label: "402", icon: "402", desc: "Server returns Payment Required" },
  { label: "Sign", icon: "3", desc: "Client signs EIP-712 authorization" },
  { label: "Retry", icon: "4", desc: "Client retries with PAYMENT-SIGNATURE" },
  { label: "Escrow", icon: "5", desc: "Funds locked in smart contract" },
  { label: "Deliver", icon: "6", desc: "Seller confirms delivery" },
  { label: "Release", icon: "7", desc: "Funds released to seller" },
  { label: "Credit Data", icon: "★", desc: "Open on-chain credit stats updated" },
];

function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="shrink-0 text-border-default"
    >
      <path
        d="M6 10h8M11 7l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
          From Payment to Credit Data
        </motion.h2>

        <div className="panel-surface rounded-2xl p-4 md:p-5">
          {/* Desktop: 8-col with arrows */}
          <div className="hidden lg:flex lg:items-stretch lg:gap-1 pb-1">
            {steps.map((step, i) => (
              <React.Fragment key={step.label}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.08 }}
                  className="flex min-h-[88px] min-w-0 flex-1 rounded-xl border border-border-default bg-bg-secondary p-3 shadow-sm"
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
                {i < steps.length - 1 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : {}}
                    transition={{ delay: i * 0.08 + 0.04 }}
                    className="flex shrink-0 items-center"
                  >
                    <Arrow />
                  </motion.div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Tablet: 4-col grid */}
          <div className="hidden sm:grid sm:grid-cols-4 sm:gap-4 lg:hidden pb-1">
            {steps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.08 }}
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

          {/* Mobile: 2-col grid */}
          <div className="grid grid-cols-2 gap-4 sm:hidden pb-1">
            {steps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.08 }}
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
