"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { DemoWalletSetup } from "./DemoWalletSetup";

/* ── Demo data ───────────────────────────────────────────────────────── */

const demos = [
  {
    title: "Agent Service",
    description:
      "Watch an autonomous agent discover a service, negotiate payment, and settle on-chain — including dispute resolution.",
    href: "/playground/agent",
    badge: "Autonomous",
    color: "accent-purple" as const,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
        <path d="M9 15h6" />
      </svg>
    ),
    highlights: [
      "Auto-advancing terminal walkthrough",
      "Machine-to-machine escrow settlement",
      "Dispute resolution demo",
    ],
  },
  {
    title: "Human Escrow",
    description:
      "Step through a marketplace checkout — product selection, EIP-712 signing, escrow lock, delivery confirmation, and fund release.",
    href: "/playground/marketplace",
    badge: "Interactive",
    color: "accent" as const,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    highlights: [
      "Step-by-step payment flow",
      "Protocol Inspector shows every detail",
      "Release, dispute, or auto-release",
    ],
  },
];

function colorClasses(color: "accent-purple" | "accent") {
  return color === "accent-purple"
    ? { badge: "bg-accent-purple/10 text-accent-purple", icon: "bg-accent-purple/10 text-accent-purple" }
    : { badge: "bg-accent/10 text-accent", icon: "bg-accent/10 text-accent" };
}

/* ── Hub component ───────────────────────────────────────────────────── */

export function PlaygroundHub() {
  const { address, usdcBalance } = useWallet();

  const isWalletReady =
    address !== null && usdcBalance !== null && parseFloat(usdcBalance) > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Playground</h1>
        <p className="mt-3 text-text-secondary">
          Try the Xenga escrow protocol hands-on. Pick a demo to get started.
        </p>
      </div>

      <div className="mb-8">
        <DemoWalletSetup />
      </div>

      <div
        className={`transition-opacity duration-300 ${isWalletReady ? "opacity-100" : "opacity-50"}`}
      >
        <div className="grid gap-6 md:grid-cols-2">
          {demos.map((demo) => {
            const c = colorClasses(demo.color);
            return (
              <Link key={demo.href} href={demo.href} className="group block">
                <div className="flex h-full flex-col rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
                  <div className="mb-4 flex items-center justify-between">
                    <div className={`rounded-lg p-2.5 ${c.icon}`}>
                      {demo.icon}
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.badge}`}>
                      {demo.badge}
                    </span>
                  </div>
                  <h2 className="mb-2 text-lg font-semibold">{demo.title}</h2>
                  <p className="text-sm text-text-secondary">{demo.description}</p>
                  <div className="mt-4 flex-1 space-y-1.5">
                    {demo.highlights.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-1 text-sm font-medium text-text-tertiary transition-colors group-hover:text-text-primary">
                    Start Demo
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {!isWalletReady && (
          <p className="mt-4 text-center text-xs text-text-tertiary">
            Set up your demo wallet above to get the full experience — or click a demo to jump in.
          </p>
        )}
      </div>
    </div>
  );
}
