"use client";

import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

const demos = [
  {
    title: "Agent Demo",
    description:
      "Autonomous agent payments with on-chain escrow and reputation scoring. x402 compatible — no SDK needed.",
    href: "/playground/agent",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
        <path d="M9 15h6" />
      </svg>
    ),
    badge: "Autonomous",
    highlights: ["Autonomous escrow settlement", "Reputation-driven trust scoring", "x402 compatible — no SDK needed"],
    color: "accent-purple",
  },
  {
    title: "Human Escrow Demo",
    description:
      "Buyer-driven escrow checkout with delivery confirmation, disputes, and reputation tracking.",
    href: "/playground/marketplace",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    badge: "Human-in-the-loop",
    highlights: ["Manual release/dispute", "Step-by-step protocol view", "On-chain reputation scoring"],
    color: "accent",
  },
];

export function DemoCards() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-24" ref={ref}>
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-4 text-center text-3xl font-semibold text-text-primary"
        >
          Choose Your Demo Path
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="mb-10 text-center text-base text-text-secondary max-w-2xl mx-auto"
        >
          {isMockChainClient
            ? "Test interactive and autonomous escrow flows with simulated protocol events."
            : "Test interactive and autonomous escrow flows with real protocol events on Base Sepolia."}
        </motion.p>

        <div className="grid gap-6 md:grid-cols-2">
          {demos.map((demo, i) => (
            <motion.div
              key={demo.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              <Link href={demo.href} className="group block">
                <div className="rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className={`rounded-lg p-2.5 ${
                        demo.color === "accent"
                          ? "bg-accent/10 text-accent"
                          : demo.color === "success"
                            ? "bg-success/10 text-success"
                            : demo.color === "warning"
                              ? "bg-warning/10 text-warning"
                              : "bg-accent-purple/10 text-accent-purple"
                      }`}
                    >
                      {demo.icon}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        demo.color === "accent"
                          ? "bg-accent/10 text-accent"
                          : demo.color === "success"
                            ? "bg-success/10 text-success"
                            : demo.color === "warning"
                              ? "bg-warning/10 text-warning"
                              : "bg-accent-purple/10 text-accent-purple"
                      }`}
                    >
                      {demo.badge}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{demo.title}</h3>
                  <p className="text-sm text-text-secondary">
                    {demo.description}
                  </p>
                  <div className="mt-4 space-y-1.5">
                    {demo.highlights.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        <span>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-text-tertiary transition-colors group-hover:text-accent">
                    Start Demo
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
