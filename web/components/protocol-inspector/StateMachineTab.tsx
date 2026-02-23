"use client";

import { useInspector } from "@/lib/protocol-inspector/context";
import { cn } from "@/lib/utils";

const STATES = [
  { id: "None", label: "None", color: "text-text-tertiary" },
  { id: "Active", label: "Active", color: "text-warning" },
  { id: "DeliveryConfirmed", label: "Delivery\nConfirmed", color: "text-accent" },
  { id: "Completed", label: "Completed", color: "text-success" },
] as const;

const BRANCH_STATES = [
  { id: "Disputed", label: "Disputed", color: "text-error", fromState: "DeliveryConfirmed" },
  { id: "AutoReleased", label: "Auto\nReleased", color: "text-warning", fromState: "Active" },
  { id: "Refunded", label: "Refunded", color: "text-text-secondary", fromState: "Active" },
  { id: "Resolved", label: "Resolved", color: "text-accent-purple", fromState: "Disputed" },
] as const;

function getStateIndex(stateId: string): number {
  const mainIdx = STATES.findIndex((s) => s.id === stateId);
  if (mainIdx >= 0) return mainIdx;
  return -1;
}

function isStatePast(stateId: string, currentState: string | undefined): boolean {
  if (!currentState) return false;
  const currentIdx = getStateIndex(currentState);
  const stateIdx = getStateIndex(stateId);
  if (currentIdx < 0 || stateIdx < 0) return false;
  return stateIdx < currentIdx;
}

function isStateCurrent(stateId: string, currentState: string | undefined): boolean {
  return currentState === stateId;
}

export function StateMachineTab() {
  const { currentState } = useInspector();

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto">
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-6">
        Escrow Lifecycle
      </h3>

      {/* Main flow */}
      <div className="mb-8 flex items-center gap-1">
        {STATES.map((state, idx) => (
          <div key={state.id} className="flex items-center">
            <StateNode
              id={state.id}
              label={state.label}
              color={state.color}
              isCurrent={isStateCurrent(state.id, currentState)}
              isPast={isStatePast(state.id, currentState)}
            />
            {idx < STATES.length - 1 && (
              <Connector
                active={isStatePast(STATES[idx + 1].id, currentState) || isStateCurrent(STATES[idx + 1].id, currentState)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Branch states */}
      <div className="flex flex-wrap justify-center gap-4">
        {BRANCH_STATES.map((state) => (
          <div key={state.id} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-tertiary">
              from {state.fromState}
            </span>
            <StateNode
              id={state.id}
              label={state.label}
              color={state.color}
              isCurrent={isStateCurrent(state.id, currentState)}
              isPast={false}
              small
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      {currentState && (
        <div className="mt-8 text-xs text-text-tertiary">
          Current state: <span className="font-semibold text-text-primary">{currentState}</span>
        </div>
      )}
      {!currentState && (
        <div className="mt-8 text-xs text-text-tertiary">
          No escrow created yet. State will update as the payment progresses.
        </div>
      )}
    </div>
  );
}

function StateNode({
  id,
  label,
  color,
  isCurrent,
  isPast,
  small,
}: {
  id: string;
  label: string;
  color: string;
  isCurrent: boolean;
  isPast: boolean;
  small?: boolean;
}) {
  const size = small ? "h-14 w-14" : "h-16 w-16";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full border-2 transition-all",
        size,
        isCurrent && "animate-pulse-glow border-accent bg-accent/10",
        isPast && "border-success/50 bg-success/10",
        !isCurrent && !isPast && "border-border-default border-dashed bg-bg-tertiary/60"
      )}
    >
      {isPast && (
        <svg
          className="absolute -top-1 -right-1 h-4 w-4 text-success"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <circle cx="8" cy="8" r="8" className="fill-bg-primary" />
          <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
        </svg>
      )}
      <span
        className={cn(
          "text-[10px] font-medium text-center leading-tight whitespace-pre-line",
          isCurrent ? "text-accent" : isPast ? "text-success" : color
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "h-0.5 w-6",
        active ? "bg-success/50" : "bg-border-default border-t border-dashed border-border-default bg-transparent"
      )}
    />
  );
}
