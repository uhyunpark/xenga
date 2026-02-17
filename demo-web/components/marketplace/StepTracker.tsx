"use client";

export type DemoStep =
  | "select"
  | "create_order"
  | "request_payment"
  | "sign"
  | "submit"
  | "escrowed"
  | "delivery"
  | "complete";

export const DEMO_STEPS: { key: DemoStep; label: string }[] = [
  { key: "select", label: "Select Product" },
  { key: "create_order", label: "Create Order" },
  { key: "request_payment", label: "Request Payment" },
  { key: "sign", label: "Sign Authorization" },
  { key: "submit", label: "Submit Payment" },
  { key: "escrowed", label: "Funds Escrowed" },
  { key: "delivery", label: "Delivery" },
  { key: "complete", label: "Complete" },
];

interface StepTrackerProps {
  currentStep: DemoStep;
  onStepClick?: (step: DemoStep) => void;
  className?: string;
}

export function StepTracker({ currentStep, onStepClick, className = "" }: StepTrackerProps) {
  const currentIndex = DEMO_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className={`space-y-1 ${className}`}>
      {DEMO_STEPS.map((step, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isClickable = isPast && !!onStepClick;

        return (
          <div
            key={step.key}
            onClick={isClickable ? () => onStepClick(step.key) : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              isCurrent
                ? "border-accent/30 bg-accent/10 text-accent font-medium"
                : isPast
                  ? "border-success/25 bg-success/5 text-success"
                  : "border-transparent text-text-tertiary"
            } ${isClickable ? "cursor-pointer hover:border-success/35 hover:bg-success/10" : ""}`}
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                isCurrent
                  ? "border-accent bg-accent text-white"
                  : isPast
                    ? "border-success bg-success/20 text-success"
                    : "border-border-default"
              }`}
            >
              {isPast ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 5l2 2 4-4" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
