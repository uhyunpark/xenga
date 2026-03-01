"use client";

export type BuyerStep = "browse" | "review_terms" | "paying" | "tracking" | "complete";
export type PaySubStep = "creating_order" | "requesting_payment" | "signing" | "submitting" | "locked";

export const BUYER_STEPS: { key: BuyerStep; label: string }[] = [
  { key: "browse", label: "Browse" },
  { key: "review_terms", label: "Review Terms" },
  { key: "paying", label: "Pay" },
  { key: "tracking", label: "Tracking" },
  { key: "complete", label: "Complete" },
];

const PAY_SUB_STEPS: { key: PaySubStep; label: string }[] = [
  { key: "creating_order", label: "Creating order" },
  { key: "requesting_payment", label: "Requesting terms" },
  { key: "signing", label: "Signing" },
  { key: "submitting", label: "Submitting" },
];

interface StepTrackerProps {
  currentStep: BuyerStep;
  paySubStep?: PaySubStep;
  onStepClick?: (step: BuyerStep) => void;
  className?: string;
}

export function StepTracker({ currentStep, paySubStep, onStepClick, className = "" }: StepTrackerProps) {
  const currentIndex = BUYER_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className={`space-y-1 ${className}`}>
      {BUYER_STEPS.map((step, i) => {
        const isPast = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isClickable = isPast && !!onStepClick && step.key === "browse";

        return (
          <div key={step.key}>
            <div
              onClick={isClickable ? () => onStepClick(step.key) : undefined}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                isCurrent
                  ? "border-accent/30 bg-accent/10 text-accent font-medium"
                  : isPast
                    ? "border-accent/25 bg-accent/5 text-accent"
                    : "border-transparent text-text-tertiary"
              } ${isClickable ? "cursor-pointer hover:border-accent/35 hover:bg-accent/10" : ""}`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                  isCurrent
                    ? "border-accent bg-accent text-white"
                    : isPast
                      ? "border-accent bg-accent-light text-accent"
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
              <span className="flex-1">{step.label}</span>
              {isCurrent && step.key === "paying" && paySubStep && (
                <span className="font-mono text-[10px] text-accent/70">
                  {PAY_SUB_STEPS.findIndex((s) => s.key === paySubStep) + 1}/{PAY_SUB_STEPS.length}
                </span>
              )}
            </div>
            {isCurrent && step.key === "paying" && paySubStep && (
              <div className="ml-6 mt-0.5 space-y-0.5">
                {PAY_SUB_STEPS.map((sub) => {
                  const subIndex = PAY_SUB_STEPS.findIndex((s) => s.key === sub.key);
                  const currentSubIndex = PAY_SUB_STEPS.findIndex((s) => s.key === paySubStep);
                  const isSubPast = subIndex < currentSubIndex;
                  const isSubCurrent = subIndex === currentSubIndex;
                  return (
                    <div
                      key={sub.key}
                      className={`flex items-center gap-1.5 text-[10px] ${
                        isSubCurrent
                          ? "text-accent"
                          : isSubPast
                            ? "text-accent/60"
                            : "text-text-tertiary/50"
                      }`}
                    >
                      {isSubPast ? (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 5l2 2 4-4" />
                        </svg>
                      ) : isSubCurrent ? (
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      ) : (
                        <div className="h-1 w-1 rounded-full bg-current" />
                      )}
                      {sub.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
