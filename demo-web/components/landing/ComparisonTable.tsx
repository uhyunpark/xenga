"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const features = [
  {
    name: "Gasless for buyer",
    x402: true,
    direct: false,
    traditional: true,
  },
  {
    name: "Trustless (no counterparty risk)",
    x402: true,
    direct: false,
    traditional: false,
  },
  {
    name: "Programmable release",
    x402: true,
    direct: false,
    traditional: false,
  },
  {
    name: "Dispute resolution",
    x402: true,
    direct: false,
    traditional: true,
  },
  {
    name: "Settlement time",
    x402: "~10s",
    direct: "~10s",
    traditional: "3-5 days",
  },
  {
    name: "Protocol fees",
    x402: "0%",
    direct: "0%",
    traditional: "2-5%",
  },
  {
    name: "HTTP native",
    x402: true,
    direct: false,
    traditional: false,
  },
  {
    name: "Machine-to-machine",
    x402: true,
    direct: true,
    traditional: false,
  },
];

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-text-secondary">{value}</span>;
  }
  return value ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="mx-auto"
    >
      <circle cx="9" cy="9" r="8" fill="rgba(34,197,94,0.15)" />
      <path
        d="M5.5 9.5l2 2 5-5"
        stroke="#22C55E"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="mx-auto"
    >
      <circle cx="9" cy="9" r="8" fill="rgba(113,113,122,0.15)" />
      <path
        d="M6.5 6.5l5 5M11.5 6.5l-5 5"
        stroke="#71717A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ComparisonTable() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="px-4 py-20" ref={ref}>
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="mb-10 text-center text-2xl font-semibold md:text-3xl"
        >
          Why x402 Escrow?
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1 }}
          className="overflow-x-auto rounded-2xl border border-border-default"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default bg-bg-secondary">
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Feature
                </th>
                <th className="px-4 py-3 text-center font-semibold text-accent">
                  x402 Escrow
                </th>
                <th className="px-4 py-3 text-center font-medium text-text-secondary">
                  Direct Transfer
                </th>
                <th className="px-4 py-3 text-center font-medium text-text-secondary">
                  Traditional Escrow
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr
                  key={f.name}
                  className={`border-b border-border-default last:border-0 ${
                    i % 2 === 0 ? "bg-bg-primary" : "bg-bg-secondary/50"
                  }`}
                >
                  <td className="px-4 py-3 text-text-primary">{f.name}</td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={f.x402} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={f.direct} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={f.traditional} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
