"use client";

import { useState, useCallback } from "react";
import { cn, shortenAddress } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  className?: string;
}

export function AddressDisplay({ address, className }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  return (
    <span className={cn("relative inline-flex items-center gap-1", className)}>
      <button
        onClick={handleCopy}
        className="font-mono text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        title="Click to copy"
      >
        {shortenAddress(address)}
      </button>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-bg-tertiary px-2 py-0.5 text-xs text-success border border-border-default whitespace-nowrap">
          Copied!
        </span>
      )}
    </span>
  );
}
