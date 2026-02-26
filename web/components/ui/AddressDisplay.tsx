"use client";

import { useState, useCallback } from "react";
import { cn, shortenAddress } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  className?: string;
  full?: boolean;
}

export function AddressDisplay({ address, className, full }: AddressDisplayProps) {
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
        className="cursor-pointer font-mono text-sm text-text-secondary transition-colors hover:text-text-primary"
        title="Click to copy"
      >
        {full ? address : shortenAddress(address)}
      </button>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-default bg-bg-secondary px-2 py-0.5 text-xs text-success shadow-sm">
          Copied!
        </span>
      )}
    </span>
  );
}
