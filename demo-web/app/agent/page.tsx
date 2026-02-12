"use client";

import { useState } from "react";
import { AgentTerminal } from "@/components/agent/AgentTerminal";
import { InspectorPanel } from "@/components/protocol-inspector/InspectorPanel";

export default function AgentPage() {
  const [speed, setSpeed] = useState(1);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Agent Service Demo</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Watch an AI agent autonomously handle the x402 payment flow with
              1-hour auto-release and auto-verified delivery.
            </p>
          </div>

          {/* Speed control */}
          <div className="mb-6 flex items-center gap-4">
            <span className="text-xs text-text-tertiary">Speed:</span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  speed === s
                    ? "bg-accent-purple/20 text-accent-purple"
                    : "text-text-tertiary hover:text-text-primary"
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
