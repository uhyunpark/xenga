"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { isMockChainClient } from "@/lib/env/isMockChainClient";
import { CodeBlock } from "@/components/ui/CodeBlock";

const code = `import { escrowFetch } from "xenga";

const { payment } = await escrowFetch(
  "https://merchant.xyz/api/order/981/pay",
  { method: "POST", body: JSON.stringify(order) },
  { walletClient }
);

// payment.escrowId + payment.txHash`;

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 py-12 md:py-20 lg:py-32">
      <div className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-6xl gap-10 overflow-hidden lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.45 }}
          className="min-w-0"
        >
          <span className="inline-flex rounded-full border border-accent-muted bg-accent-light px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            Escrow + Reputation Protocol
          </span>
          <h1
            className="gradient-text mt-5 pb-1 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl"
            style={{ textWrap: "balance" }}
          >
            On-chain escrow and reputation for humans and autonomous agents
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-text-secondary md:text-xl">
            {isMockChainClient
              ? "Simulated escrow settlement and reputation scoring — every transaction builds a permissionless credit history that shapes future terms."
              : "Escrow settlement and reputation scoring on-chain — every transaction builds a permissionless credit history that shapes future terms."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/playground/agent"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Try Agent Service
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link
              href="/playground/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-light"
            >
              Try Human Escrow
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
          </div>

        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="panel-surface shadow-md rounded-2xl p-4 md:p-5 min-w-0"
        >
          <CodeBlock code={code} lang="payment.ts" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Buyer Gas Cost" value="$0" />
            <MiniStat label="Reputation" value="On-Chain" />
            <MiniStat label="Escrow Visibility" value="Realtime" />
            <MiniStat label="Authorization" value="EIP-712" />
            <MiniStat label="Asset" value="USDC" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary px-3 py-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-text-primary">{value}</div>
    </div>
  );
}
