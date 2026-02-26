"use client";

import { useMemo } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { useAutoScroll } from "@/lib/protocol-inspector/useAutoScroll";
import { TxLink } from "@/components/ui/TxLink";
import { Badge } from "@/components/ui/Badge";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

export function OnChainTab() {
  const { events } = useInspector();

  const onchainEvents = useMemo(
    () =>
      events.filter(
        (e) => e.type === "tx_submitted" || e.type === "tx_confirmed" || e.type === "state_change"
      ),
    [events]
  );

  const scrollRef = useAutoScroll(onchainEvents.length);

  if (onchainEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        {isMockChainClient
          ? "No simulated transactions yet. Events appear after payment verification."
          : "No on-chain transactions yet. Transactions appear after payment verification."}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-3 overflow-y-auto max-h-full p-1">
      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
        <svg className="h-4 w-4 text-accent shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
        </svg>
        <span className="text-xs text-accent">
          {isMockChainClient
            ? "Simulation mode: transaction events and hashes are generated locally for demo playback."
            : "Gas paid by operator, NOT the buyer. The buyer only signs a gasless USDC authorization."}
        </span>
      </div>

      {onchainEvents.map((event) =>
        event.type === "state_change" ? (
          <StateChangeCard key={event.id} event={event} />
        ) : (
          <TxEventCard key={event.id} event={event} />
        )
      )}
    </div>
  );
}

function TxEventCard({ event }: { event: any }) {
  const { data, type } = event;
  const isConfirmed = type === "tx_confirmed";

  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary animate-inspector-flash">
      <div className="flex items-center gap-2 border-b border-border-default bg-bg-tertiary/55 px-3 py-2">
        <Badge variant={isConfirmed ? "success" : "info"}>
          {isConfirmed ? "Confirmed" : "Submitted"}
        </Badge>
        {data.functionName && (
          <span className="font-mono text-xs text-text-secondary">{data.functionName}</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        {data.hash && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-20">Tx Hash</span>
            <TxLink hash={data.hash} />
          </div>
        )}
        {data.escrowId != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-20">Escrow ID</span>
            <span className="font-mono text-sm text-accent-purple">#{String(data.escrowId)}</span>
          </div>
        )}
        {data.args && (
          <div>
            <span className="text-xs text-text-tertiary">Function Arguments</span>
            <div className="mt-1 space-y-1">
              {Object.entries(data.args).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-accent-purple shrink-0">{key}:</span>
                  <span className="font-mono text-text-secondary break-all">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StateChangeCard({ event }: { event: any }) {
  const { data } = event;
  const from = data.previousState || "Unknown";
  const to = data.newState || "Unknown";

  return (
    <div className="overflow-hidden rounded-xl border border-border-default/60 bg-bg-secondary/50 animate-inspector-flash">
      <div className="flex items-center gap-2 px-3 py-2">
        <Badge variant="default">State</Badge>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono text-text-tertiary">{from}</span>
          <svg className="h-3 w-3 text-text-tertiary shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8h10m-4-4 4 4-4 4" />
          </svg>
          <span className="font-mono text-text-primary font-medium">{to}</span>
        </div>
      </div>
    </div>
  );
}
