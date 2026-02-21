"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

const useCaseCards = [
  {
    title: "Marketplaces & Freelance",
    color: "accent" as const,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    items: [
      "Buyer-seller escrow with configurable release windows",
      "Delivery confirmation + built-in dispute resolution",
      "Reputation-adjusted terms shorten windows for trusted pairs",
    ],
    footer: "7-day default. High-trust pairs settle in 3 days.",
  },
  {
    title: "Agent & API Commerce",
    color: "accent-purple" as const,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
        <path d="M9 15h6" />
      </svg>
    ),
    items: [
      "Auto-verified delivery for machine-to-machine payments",
      "Session micropayments for high-frequency API access",
      "Reputation gating screens low-trust counterparties",
    ],
    footer:
      "1-hour auto-release. Quality checks trigger disputes automatically.",
  },
  {
    title: "Custom Use Cases",
    color: "success" as const,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="5" y1="4" x2="5" y2="16" />
        <line x1="10" y1="4" x2="10" y2="16" />
        <line x1="15" y1="4" x2="15" y2="16" />
        <circle cx="5" cy="7" r="2" fill="currentColor" />
        <circle cx="10" cy="13" r="2" fill="currentColor" />
        <circle cx="15" cy="9" r="2" fill="currentColor" />
      </svg>
    ),
    items: [
      "Define your own release windows and verification logic",
      "Plug custom delivery checks into the escrow lifecycle",
      "Dynamically adjust terms based on on-chain reputation",
    ],
    footer: "SaaS billing, consulting, rentals \u2014 shape escrow to your domain.",
  },
];

const codeTabs = [
  {
    label: "Next.js",
    lang: "TypeScript",
    code: `// Next.js Route Handler — same core, different framework
export async function POST(request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await handleEscrowPayment(
    request, { id }, deps
  );
  return toNextResponse(result);
}`,
  },
  {
    label: "Standalone Client",
    lang: "TypeScript",
    code: `// No server SDK required — works with any backend
const { response, payment } = await escrowFetch(
  "https://any-api.com/order/42/pay",
  { method: "POST" },
  {
    walletClient,
    onSellerReputation: (rep) => rep.score >= 50,
  }
);
// payment.escrowId — on-chain reference`,
  },
  {
    label: "Custom Service Type",
    lang: "TypeScript",
    code: `// Define escrow rules for your domain
registerServiceType({
  name: "consulting",
  releaseWindow: 14 * 24 * 60 * 60,
  autoVerify: false,
  adjustParams(params, rep) {
    if (rep.sellerScore >= 80)
      return { ...params, releaseWindow: 7 * 24 * 60 * 60 };
    return params;
  },
});`,
  },
];

const colorMap = {
  accent: {
    iconBg: "bg-accent/10 text-accent",
    dot: "bg-accent",
  },
  "accent-purple": {
    iconBg: "bg-accent-purple/10 text-accent-purple",
    dot: "bg-accent-purple",
  },
  success: {
    iconBg: "bg-success/10 text-success",
    dot: "bg-success",
  },
};

export function AdaptabilitySection() {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-20" ref={ref}>
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4 }}
          className="mb-4 text-center text-2xl font-semibold md:text-3xl"
        >
          Built to Fit Your Stack
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-10 text-center text-text-secondary"
        >
          Drop-in escrow infrastructure for any framework. Use built-in service
          types or define your own.
        </motion.p>

        {/* Use-case cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {useCaseCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
              className="panel-surface rounded-2xl p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <div className={`rounded-lg p-2 ${colorMap[card.color].iconBg}`}>
                  {card.icon}
                </div>
                <h3 className="text-sm font-semibold">{card.title}</h3>
              </div>
              <div className="space-y-2">
                {card.items.map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorMap[card.color].dot}`}
                    />
                    <span className="flex-1 text-xs text-text-secondary">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-text-tertiary">
                {card.footer}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Tabbed code panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mx-auto mt-8 max-w-4xl"
        >
          <div className="panel-surface overflow-hidden rounded-2xl">
            <div className="flex border-b border-border-default bg-bg-tertiary/55">
              {codeTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  className={`relative flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === i
                      ? "text-text-primary"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {tab.label}
                  {activeTab === i && (
                    <motion.div
                      layoutId="adaptability-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="p-4">
              <div className="mb-2 text-xs text-text-tertiary">
                {codeTabs[activeTab].lang}
              </div>
              <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-text-secondary">
                {highlightBlock(codeTabs[activeTab].code)}
              </pre>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function highlightBlock(code: string): React.ReactNode {
  return code.split("\n").map((line, i) => (
    <div key={i}>
      {line
        .split(
          /(\/\/.*$|"[^"]*"|'[^']*'|\b(?:import|from|const|await|function|export|app|external|async|return)\b|\b(?:string|address|uint256|bytes32|uint8)\b)/gm
        )
        .map((part, j) => {
          if (!part) return null;
          if (part.startsWith("//")) {
            return (
              <span key={j} className="text-text-tertiary">
                {part}
              </span>
            );
          }
          if (/^["']/.test(part)) {
            return (
              <span key={j} className="text-success">
                {part}
              </span>
            );
          }
          if (
            /^(import|from|const|await|function|export|async|return|external|app)$/.test(
              part
            )
          ) {
            return (
              <span key={j} className="text-accent-purple">
                {part}
              </span>
            );
          }
          if (/^(string|address|uint256|bytes32|uint8)$/.test(part)) {
            return (
              <span key={j} className="text-accent">
                {part}
              </span>
            );
          }
          return <span key={j}>{part}</span>;
        })}
    </div>
  ));
}
