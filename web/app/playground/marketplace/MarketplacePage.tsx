"use client";

import { useState } from "react";
import { PaymentFlow } from "@/components/marketplace/PaymentFlow";
import { PreviewFlow } from "@/components/marketplace/PreviewFlow";
import { InspectorPanel } from "@/components/protocol-inspector/InspectorPanel";
import { PlaygroundTabs } from "@/components/playground/PlaygroundTabs";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

export default function MarketplacePage() {
  const [mode, setMode] = useState<"demo" | "live">("demo");

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          <PlaygroundTabs />
          <div className="panel-surface mb-6 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {mode === "demo" ? "Preview" : "Interactive Flow"}
              </span>
              <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                {isMockChainClient ? "Mock Chain" : "Base Sepolia"}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">Human Escrow Demo</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {mode === "demo"
                ? "Watch the full escrow payment lifecycle — no wallet needed."
                : "Configure, review escrow terms, pay in one click, and track delivery with release or dispute options."}
            </p>
            {/* Demo / Live toggle */}
            <div className="mt-4 flex gap-1 rounded-lg border border-border-default bg-bg-primary/50 p-1 w-fit">
              <button
                onClick={() => setMode("demo")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === "demo"
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-text-tertiary hover:text-text-secondary border border-transparent"
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => setMode("live")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === "live"
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-text-tertiary hover:text-text-secondary border border-transparent"
                }`}
              >
                Live
              </button>
            </div>
          </div>
          {mode === "demo" ? (
            <PreviewFlow onExit={() => setMode("live")} />
          ) : (
            <PaymentFlow />
          )}
        </div>
      </div>

      {/* Protocol Inspector panel */}
      <InspectorPanel />
    </div>
  );
}
