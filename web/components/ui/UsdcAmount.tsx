"use client";

import { cn, formatUsdc } from "@/lib/utils";

interface UsdcAmountProps {
  amount: string | bigint | number;
  className?: string;
}

export function UsdcAmount({ amount, className }: UsdcAmountProps) {
  return (
    <span className={cn("text-accent font-medium", className)}>
      {formatUsdc(amount)} USDC
    </span>
  );
}
