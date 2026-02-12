"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

const installCmd = "bun add x402-escrow";

const curlExample = `# 1. Create an order
curl -X POST http://localhost:3000/api/orders \\
  -H "Content-Type: application/json" \\
  -d '{"title":"API Access","price":5,"serviceType":"agent-service","sellerAddress":"0x..."}'

# 2. Pay for the order (returns 402, then submit with X-PAYMENT)
curl -X POST http://localhost:3000/api/orders/{id}/pay

# 3. Check escrow status
curl http://localhost:3000/api/escrows/{escrowId}`;

export function DevSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [copied, setCopied] = useState(false);

  const copyInstall = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="px-4 py-20" ref={ref}>
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-4 text-center text-2xl font-semibold md:text-3xl"
        >
          Quick Start
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="mb-10 text-center text-text-secondary"
        >
          Add escrow payments to your app in minutes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Install command */}
          <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
            <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
              <span className="text-xs text-text-tertiary">Terminal</span>
              <button
                onClick={copyInstall}
                className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="p-4">
              <code className="font-mono text-sm">
                <span className="text-text-tertiary">$ </span>
                <span className="text-text-primary">{installCmd}</span>
              </code>
            </div>
          </div>

          {/* curl examples */}
          <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
            <div className="border-b border-border-default px-4 py-2">
              <span className="text-xs text-text-tertiary">
                curl examples
              </span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
              {curlExample.split("\n").map((line, i) => (
                <div key={i}>
                  {line.startsWith("#") ? (
                    <span className="text-text-tertiary">{line}</span>
                  ) : (
                    <span className="text-text-secondary">{line}</span>
                  )}
                </div>
              ))}
            </pre>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
