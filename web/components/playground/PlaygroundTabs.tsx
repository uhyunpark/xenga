"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pages: Record<string, string> = {
  "/playground/agent": "Agent Service",
  "/playground/marketplace": "Human Escrow",
};

export function PlaygroundTabs() {
  const pathname = usePathname();
  const current = pages[pathname] ?? "";

  return (
    <nav className="mb-4 flex items-center gap-1.5 text-sm text-text-tertiary">
      <Link href="/playground" className="hover:text-text-secondary transition-colors">
        Playground
      </Link>
      <span>/</span>
      <span className="text-text-primary">{current}</span>
    </nav>
  );
}
