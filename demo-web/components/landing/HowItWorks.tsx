"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

const tabs = [
  {
    label: "Client SDK",
    lang: "TypeScript",
    code: `// Automatic escrow payment flow
const { payment } = await escrowFetch(
  "https://api.example.com/order/123/pay",
  { method: "POST" },
  { walletClient }
);

// payment.txHash — on-chain escrow
// payment.escrowId — escrow ID`,
  },
  {
    label: "Server Middleware",
    lang: "TypeScript",
    code: `// One-line payment protection
app.post("/api/orders/:id/pay",
  escrowPaymentMiddleware(),
  (req, res) => {
    // Only reached after payment verified
    const { txHash, escrowId } = req.escrowPayment;
    res.json({ message: "Payment received" });
  }
);`,
  },
  {
    label: "Smart Contract",
    lang: "Solidity",
    code: `// EscrowVault.sol — gasless escrow
function createEscrowWithAuth(
  bytes32 orderId,
  address seller,
  uint256 amount,
  string serviceType,
  uint256 releaseWindow,
  // ERC-3009 signature params
  address from, uint256 validAfter,
  uint256 validBefore, bytes32 nonce,
  uint8 v, bytes32 r, bytes32 s
) external { ... }`,
  },
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-20" ref={ref}>
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-4 text-center text-2xl font-semibold md:text-3xl"
        >
          How It Works
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="mb-10 text-center text-text-secondary"
        >
          Three layers working together: client SDK, server middleware, and smart
          contract.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="panel-surface overflow-hidden rounded-2xl"
        >
          {/* Tab bar */}
          <div className="flex border-b border-border-default bg-bg-tertiary/55">
            {tabs.map((tab, i) => (
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
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Code content */}
          <div className="p-4">
            <div className="mb-2 text-xs text-text-tertiary">
              {tabs[activeTab].lang}
            </div>
            <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-text-secondary">
              {highlightBlock(tabs[activeTab].code)}
            </pre>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function highlightBlock(code: string): React.ReactNode {
  return code.split("\n").map((line, i) => (
    <div key={i}>
      {line.split(/(\/\/.*$|"[^"]*"|'[^']*'|\b(?:import|from|const|await|function|export|app|external|async|return)\b|\b(?:string|address|uint256|bytes32|uint8)\b)/gm).map((part, j) => {
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
        if (/^(import|from|const|await|function|export|async|return|external|app)$/.test(part)) {
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
