"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const variantStyles = {
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  error: "bg-error/10 text-error border-error/25",
  info: "bg-accent/10 text-accent border-accent/25",
  default: "bg-bg-tertiary text-text-secondary border-border-default",
} as const;

interface BadgeProps {
  variant: keyof typeof variantStyles;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
