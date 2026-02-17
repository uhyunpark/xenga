"use client";

import { cn, shortenAddress } from "@/lib/utils";

interface TxLinkProps {
  hash: string;
  label?: string;
  className?: string;
}

export function TxLink({ hash, label, className }: TxLinkProps) {
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
      <span>{label ?? shortenAddress(hash, 6)}</span>
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
