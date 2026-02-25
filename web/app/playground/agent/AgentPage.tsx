"use client";

import { useState } from "react";
import { AgentTerminal } from "@/components/agent/AgentTerminal";
import { InspectorPanel } from "@/components/protocol-inspector/InspectorPanel";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

export default function AgentPage() {
  const [speed, setSpeed] = useState(1);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="panel-surface mb-6 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent-purple/35 bg-accent-purple/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-purple">
                Autonomous Run
              </span>
              <span className="rounded-full border border-border-default bg-bg-primary/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-tertiary">
                Machine-to-machine
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold md:text-3xl">Agent Service Demo</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {isMockChainClient
                ? "Watch an autonomous agent execute discovery, payment, and simulated settlement — including dispute resolution."
                : "Watch an autonomous agent execute discovery, payment, and on-chain settlement — including dispute resolution."}
            </p>
          </div>

          {/* Speed control */}
          <div className="panel-surface mb-6 flex items-center gap-4 rounded-xl p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Playback Speed
            </span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  speed === s
                    ? "border-accent-purple/30 bg-accent-purple/20 text-accent-purple"
                    : "border-transparent text-text-tertiary hover:border-border-default hover:text-text-primary"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <AgentTerminal speed={speed} />
        </div>
      </div>

      <InspectorPanel />
    </div>
  );
}
