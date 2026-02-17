"use client";

import { cn, shortenAddress } from "@/lib/utils";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

interface TxLinkProps {
  hash: string;
  label?: string;
  className?: string;
}

export function TxLink({ hash, label, className }: TxLinkProps) {
  const displayLabel = label ?? shortenAddress(hash, 6);

  if (isMockChainClient) {
    return (
      <span
        className={cn("inline-flex items-center gap-1 font-mono text-sm text-text-secondary", className)}
      >
        {displayLabel}
      </span>
    );
  }

  return (
    <a
      href={`https://sepolia.basescan.org/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm text-accent transition-colors hover:text-accent/80",
        className
      )}
    >
      <span>{displayLabel}</span>
      <svg
        className="h-3 w-3 shrink-0"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3.5 1.5h7v7M10.5 1.5l-9 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
