"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const codeLines = [
  'import { escrowFetch } from "x402-escrow";',
  "",
  "const { payment } = await escrowFetch(",
  '  "https://api.example.com/service",',
  "  { method: \"POST\", body: data },",
  "  { walletClient }",
  ");",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-24 md:pt-32">
      {/* Background grid */}
      <div className="bg-grid pointer-events-none absolute inset-0" />
      {/* Radial glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-accent/5 blur-[120px]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="gradient-text text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl"
          style={{ textWrap: "balance" }}
        >
          Escrow Payments for the Agentic world
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary md:text-xl"
        >
          On-chain escrow. Trustless commerce in one fetch call.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/marketplace"
            className="glow-blue inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            Try the Demo
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border-default px-6 py-3 text-sm font-semibold text-text-primary transition-all hover:border-border-active hover:bg-bg-tertiary"
          >
            Read the Docs
          </a>
        </motion.div>

        {/* Animated code snippet */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-12 max-w-xl"
        >
          <CodeSnippet />
        </motion.div>
      </div>
    </section>
  );
}

function CodeSnippet() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines < codeLines.length) {
      const timer = setTimeout(
        () => setVisibleLines((v) => v + 1),
        visibleLines === 0 ? 800 : 150
      );
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  return (
    <div className="code-block overflow-hidden p-4 text-left">
      <div className="mb-2 flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-full bg-error/60" />
        <div className="h-3 w-3 rounded-full bg-warning/60" />
        <div className="h-3 w-3 rounded-full bg-success/60" />
        <span className="ml-2 text-xs text-text-tertiary">payment.ts</span>
      </div>
      <pre className="text-[13px] leading-relaxed">
        {codeLines.slice(0, visibleLines).map((line, i) => (
          <div key={i}>
            {highlightCode(line)}
            {i === visibleLines - 1 && visibleLines < codeLines.length && (
              <span className="inline-block h-4 w-[2px] animate-pulse bg-text-primary" />
            )}
          </div>
        ))}
        {visibleLines >= codeLines.length && (
          <div>
            <span className="inline-block h-4 w-[2px] animate-pulse bg-text-primary" />
          </div>
        )}
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
        <span key={i} className="text-accent-purple">
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
