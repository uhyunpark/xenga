"use client";

import { useEffect, useState } from "react";
import { Badge } from "./Badge";
import { cn } from "@/lib/utils";
import { facilitatorFetch } from "@/lib/api/client";
import type { ReputationScore } from "@shared/types";

interface ReputationBadgeProps {
  address: string;
  size?: "sm" | "md";
  className?: string;
  showTooltip?: boolean;
}

export function ReputationBadge({
  address,
  size = "sm",
  className,
  showTooltip = true,
}: ReputationBadgeProps) {
  const [rep, setRep] = useState<ReputationScore | null>(null);

  useEffect(() => {
    if (!address) return;
    facilitatorFetch(`/api/reputation/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRep)
      .catch(() => {});
  }, [address]);

  if (!rep) return null;

  const isNew = rep.confidence === "low";
  const variant = isNew
    ? "default"
    : rep.overall >= 70
      ? "success"
      : rep.overall >= 40
        ? "warning"
        : "error";

  const badgeContent = isNew ? "New" : `${rep.overall}/100`;

  const tooltipText = isNew
    ? "New address — fewer than 3 escrows. On-chain credit data building."
    : `Score ${rep.overall}/100 · ${rep.confidence} confidence. ${
        rep.overall >= 70
          ? "High trust — faster settlement on this service."
          : rep.overall >= 40
            ? "Moderate trust — standard terms."
            : "Low trust — extended terms."
      }`;

  const badge = (
    <Badge
      variant={variant}
      className={cn(
        showTooltip && "cursor-help",
        size === "md" && "px-2.5 py-1 text-sm",
        className,
      )}
    >
      {badgeContent}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <span className="group relative inline-flex">
      {badge}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border-default bg-bg-secondary p-2.5 text-[11px] leading-relaxed text-text-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltipText}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-bg-secondary" />
      </span>
    </span>
  );
}
