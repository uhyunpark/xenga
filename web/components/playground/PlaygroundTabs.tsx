"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Agent Service", href: "/playground/agent" },
  { label: "Human Escrow", href: "/playground/marketplace" },
] as const;

export function PlaygroundTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex gap-1 rounded-lg border border-border-default bg-bg-primary/50 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
              active
                ? "bg-bg-tertiary text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
