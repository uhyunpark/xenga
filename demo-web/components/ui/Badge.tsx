"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const variantStyles = {
  success: "bg-success/15 text-success border-success/20",
  warning: "bg-warning/15 text-warning border-warning/20",
  error: "bg-error/15 text-error border-error/20",
  info: "bg-accent/15 text-accent border-accent/20",
  default: "bg-white/5 text-text-secondary border-white/10",
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
