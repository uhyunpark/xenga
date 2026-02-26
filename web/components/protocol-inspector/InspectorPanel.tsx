"use client";

import { useMemo } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { cn } from "@/lib/utils";
import { HttpTrafficTab } from "./HttpTrafficTab";
import { SignatureTab } from "./SignatureTab";
import { OnChainTab } from "./OnChainTab";
import { ReputationTab } from "./ReputationTab";

const TABS = [
  { key: "http" as const, label: "HTTP Traffic", eventTypes: ["http_request", "http_response"] },
  { key: "signatures" as const, label: "Signatures", eventTypes: ["eip712_sign", "signature_result"] },
  { key: "onchain" as const, label: "On-Chain", eventTypes: ["tx_submitted", "tx_confirmed", "state_change"] },
  { key: "reputation" as const, label: "Reputation", eventTypes: ["reputation_check"] },
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

  if (!isOpen) {
    return (
      <>
        <CollapsedToggle onClick={toggle} count={events.length} mobile />
        <CollapsedToggle onClick={toggle} count={events.length} />
      </>
    );
  }

  return (
    <>
      {/* Mobile bottom sheet */}
      <div className="fixed inset-0 z-40 md:hidden">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-slate-900/20" onClick={toggle} />
        {/* Sheet */}
        <div className="absolute bottom-0 left-0 right-0 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-border-default bg-bg-secondary">
          <PanelContent
            activeTab={activeTab}
            setTab={setTab}
            eventCounts={eventCounts}
            onClose={toggle}
            totalEvents={events.length}
          />
        </div>
      </div>

      {/* Desktop side panel */}
      <div className="hidden h-[calc(100vh-4rem)] w-[430px] shrink-0 flex-col overflow-hidden border-l border-border-default bg-bg-secondary shadow-md md:flex">
        <PanelContent
          activeTab={activeTab}
          setTab={setTab}
          eventCounts={eventCounts}
          onClose={toggle}
          totalEvents={events.length}
        />
      </div>
    </>
  );
}

function CollapsedToggle({
  onClick,
  count,
  mobile = false,
}: {
  onClick: () => void;
  count: number;
  mobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed right-4 z-40 flex items-center gap-2 rounded-full border border-border-active bg-bg-secondary px-4 py-2.5 shadow-sm transition-colors hover:border-accent/40",
        mobile ? "bottom-4 md:hidden" : "bottom-4 hidden md:flex"
      )}
    >
      <svg className="h-4 w-4 text-accent" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zm0 5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H1.75a.75.75 0 01-.75-.75z" />
      </svg>
      <span className="text-sm font-medium text-text-primary">Protocol</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/20 px-1.5 text-xs font-semibold text-accent">
          {count}
        </span>
      )}
    </button>
  );
}

function PanelContent({
  activeTab,
  setTab,
  eventCounts,
  onClose,
  totalEvents,
}: {
  activeTab: string;
  setTab: (tab: any) => void;
  eventCounts: Record<string, number>;
  onClose: () => void;
  totalEvents: number;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3 shrink-0">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-text-primary">Protocol Inspector</h2>
          <p className="text-[11px] text-text-tertiary">
            {totalEvents} event{totalEvents === 1 ? "" : "s"} captured
          </p>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          aria-label="Close inspector"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border-default bg-bg-tertiary/55">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={cn(
              "relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors",
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
                    : "bg-bg-tertiary text-text-tertiary"
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
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {activeTab === "http" && <HttpTrafficTab />}
        {activeTab === "signatures" && <SignatureTab />}
        {activeTab === "onchain" && <OnChainTab />}
        {activeTab === "reputation" && <ReputationTab />}
      </div>
    </>
  );
}
