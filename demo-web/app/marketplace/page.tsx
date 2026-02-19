"use client";

import { PaymentFlow } from "@/components/marketplace/PaymentFlow";
import { InspectorPanel } from "@/components/protocol-inspector/InspectorPanel";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

export default function MarketplacePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="panel-surface mb-6 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                Interactive Flow
              </span>
              <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                {isMockChainClient ? "Mock Chain" : "Base Sepolia"}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">By Human — Escrow Demo</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Simulate buyer-side checkout, typed-data signing, escrow settlement, and release/dispute decisions.
            </p>
          </div>
          <PaymentFlow />
        </div>
      </div>

      {/* Protocol Inspector panel */}
      <InspectorPanel />
    </div>
  );
}
