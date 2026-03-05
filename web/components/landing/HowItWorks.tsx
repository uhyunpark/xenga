"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";

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
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-24" ref={ref}>
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-4 text-center text-3xl font-semibold text-text-primary"
        >
          Add escrow payments in minutes
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="mb-10 text-center text-base text-text-secondary max-w-2xl mx-auto"
        >
          Two SDK calls — client and server. The rest is handled on-chain.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          className="panel-surface overflow-hidden rounded-2xl shadow-sm"
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
          <div>
            <CodeBlock
              code={tabs[activeTab].code}
              lang={tabs[activeTab].lang}
              showDots={false}
              className="border-0 shadow-none rounded-none"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
