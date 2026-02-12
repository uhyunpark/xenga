"use client";

import { useMemo } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { cn } from "@/lib/utils";
import { HttpTrafficTab } from "./HttpTrafficTab";
import { SignatureTab } from "./SignatureTab";
import { OnChainTab } from "./OnChainTab";
import { StateMachineTab } from "./StateMachineTab";

const TABS = [
  { key: "http" as const, label: "HTTP Traffic", eventTypes: ["http_request", "http_response"] },
  { key: "signatures" as const, label: "Signatures", eventTypes: ["eip712_sign", "signature_result"] },
  { key: "onchain" as const, label: "On-Chain", eventTypes: ["tx_submitted", "tx_confirmed"] },
  { key: "state" as const, label: "State Machine", eventTypes: ["state_change"] },
];

export function InspectorPanel() {
  const { events, activeTab, setTab, isOpen, toggle } = useInspector();

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) {
      counts[tab.key] = events.filter((e) => tab.eventTypes.includes(e.type)).length;
    }
    return counts;
  }, [events]);

  // Mobile: floating pill button when collapsed
  if (!isOpen) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-bg-secondary border border-border-active px-4 py-2.5 shadow-lg shadow-black/40 hover:border-accent/40 transition-all cursor-pointer md:hidden"
      >
        <svg className="h-4 w-4 text-accent" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zm0 5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H1.75a.75.75 0 01-.75-.75z" />
        </svg>
        <span className="text-sm font-medium text-text-primary">Protocol</span>
        {events.length > 0 && (
          <span className="flex items-center justify-center h-5 min-w-5 rounded-full bg-accent/20 text-accent text-xs font-semibold px-1.5">
            {events.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Mobile bottom sheet */}
      <div className="fixed inset-0 z-40 md:hidden">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" onClick={toggle} />
        {/* Sheet */}
        <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] flex flex-col rounded-t-2xl bg-bg-secondary border-t border-border-default">
          <PanelContent
            activeTab={activeTab}
            setTab={setTab}
            eventCounts={eventCounts}
            onClose={toggle}
          />
        </div>
      </div>

      {/* Desktop side panel */}
      <div className="hidden md:flex flex-col w-[420px] shrink-0 rounded-2xl bg-bg-secondary border border-border-default overflow-hidden">
        <PanelContent
          activeTab={activeTab}
          setTab={setTab}
          eventCounts={eventCounts}
          onClose={toggle}
        />
      </div>
    </>
  );
}

function PanelContent({
  activeTab,
  setTab,
  eventCounts,
  onClose,
}: {
  activeTab: string;
  setTab: (tab: any) => void;
  eventCounts: Record<string, number>;
  onClose: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Protocol Inspector</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1 hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-default shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer",
              activeTab === tab.key
                ? "text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
            {eventCounts[tab.key] > 0 && (
              <span
                className={cn(
                  "flex items-center justify-center h-4 min-w-4 rounded-full text-[10px] font-semibold px-1",
                  activeTab === tab.key
                    ? "bg-accent/20 text-accent"
                    : "bg-white/5 text-text-tertiary"
                )}
              >
                {eventCounts[tab.key]}
              </span>
            )}
            {/* Underline indicator */}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden p-3 min-h-0">
        {activeTab === "http" && <HttpTrafficTab />}
        {activeTab === "signatures" && <SignatureTab />}
        {activeTab === "onchain" && <OnChainTab />}
        {activeTab === "state" && <StateMachineTab />}
      </div>
    </>
  );
}
