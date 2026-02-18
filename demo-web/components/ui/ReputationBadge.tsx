"use client";

import { useEffect, useState } from "react";
import { Badge } from "./Badge";
import { cn } from "@/lib/utils";
import type { ReputationScore } from "@shared/types";

interface ReputationBadgeProps {
  address: string;
  size?: "sm" | "md";
  className?: string;
}

export function ReputationBadge({
  address,
  size = "sm",
  className,
}: ReputationBadgeProps) {
  const [rep, setRep] = useState<ReputationScore | null>(null);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/reputation/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRep)
      .catch(() => {});
  }, [address]);

  if (!rep) return null;

  if (rep.confidence === "low") {
    return (
      <Badge
        variant="default"
        className={cn(size === "md" && "px-2.5 py-1 text-sm", className)}
      >
        New
      </Badge>
    );
  }

  const variant =
    rep.overall >= 70 ? "success" : rep.overall >= 40 ? "warning" : "error";

  return (
    <Badge
      variant={variant}
      className={cn(size === "md" && "px-2.5 py-1 text-sm", className)}
    >
      {rep.overall}/100
    </Badge>
  );
}
