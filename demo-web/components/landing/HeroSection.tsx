"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

const codeLines = [
  'import { escrowFetch } from "x402-escrow";',
  "",
  "const { payment } = await escrowFetch(",
  '  "https://merchant.xyz/api/order/981/pay",',
  '  { method: "POST", body: JSON.stringify(order) },',
  "  { walletClient }",
  ");",
  "",
  "// payment.escrowId + payment.txHash",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-20 md:pt-24">
      <div className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            Protocol-Grade Checkout
          </span>
          <h1
            className="gradient-text mt-5 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl"
            style={{ textWrap: "balance" }}
          >
            Escrowed x402 payments for autonomous commerce
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-text-secondary md:text-xl">
            {isMockChainClient
              ? "Integrate x402 with simulated escrow state, signed USDC authorization, and programmable release logic."
              : "Integrate x402 while guaranteeing settlement with on-chain escrow state, signed USDC authorization, and programmable release logic."}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
            >
              Launch Marketplace Demo
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            {!isMockChainClient && (
              <Link
                href="/explorer"
                className="inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-secondary px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                Inspect Escrow State
              </Link>
            )}
          </div>

        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="panel-surface rounded-2xl p-4 md:p-5"
        >
          <CodeSnippet />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniStat label="Buyer Gas Cost" value="$0" />
            <MiniStat label="Settlement" value={isMockChainClient ? "Simulated" : "Base Sepolia"} />
            <MiniStat label="Escrow Visibility" value="Realtime" />
            <MiniStat label="Authorization" value="EIP-712" />
            <MiniStat label="Asset" value="USDC" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CodeSnippet() {
  return (
    <div className="code-block overflow-hidden p-4 text-left">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-full bg-error/60" />
        <div className="h-3 w-3 rounded-full bg-warning/60" />
        <div className="h-3 w-3 rounded-full bg-success/60" />
        <span className="ml-2 text-xs text-text-tertiary">payment.ts</span>
      </div>
      <pre className="text-[13px] leading-relaxed text-text-secondary">
        {codeLines.map((line, i) => (
          <div key={i}>{highlightCode(line)}</div>
        ))}
      </pre>
    </div>
  );
}

function highlightCode(line: string): React.ReactNode {
  if (!line) return "\u00A0";

  return line.split(/("[^"]*"|'[^']*'|import|from|const|await|{|})/g).map((part, i) => {
    if (/^["']/.test(part)) {
      return (
        <span key={i} className="text-success">
          {part}
        </span>
      );
    }
    if (/^(import|from|const|await)$/.test(part)) {
      return (
        <span key={i} className="text-accent">
          {part}
        </span>
      );
    }
    if (part === "{" || part === "}") {
      return (
        <span key={i} className="text-text-secondary">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-text-primary">{value}</div>
    </div>
  );
}
