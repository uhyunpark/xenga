"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const steps = [
  {
    number: "01",
    label: "Client",
    description: "Sign and send the payment",
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
    number: "02",
    label: "Server",
    description: "Protect your endpoint",
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
];

export function HowItWorks() {
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
          Add escrow-protected payments to your API in two steps.
        </motion.p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="panel-surface overflow-hidden rounded-2xl p-5"
            >
              <div className="mb-3 flex items-baseline gap-2">
                <span className="font-mono text-xs text-accent">
                  {step.number}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {step.label}
                </span>
                <span className="text-xs text-text-secondary">
                  — {step.description}
                </span>
              </div>
              <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-text-secondary">
                {highlightBlock(step.code)}
              </pre>
            </motion.div>
          ))}
        </div>
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
