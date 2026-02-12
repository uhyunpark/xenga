"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WalletSelector } from "@/components/ui/WalletSelector";

export function Navbar() {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        setHealthOk(r.ok);
      })
      .catch(() => setHealthOk(false));
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-border-default bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-accent">x402</span>
            <span className="text-text-secondary">Escrow</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            <NavLink href="/marketplace">Marketplace</NavLink>
            <NavLink href="/agent">Agent</NavLink>
            <NavLink href="/explorer">Explorer</NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            Testnet
          </span>
          <HealthDot status={healthOk} />
          <WalletSelector />
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
    >
      {children}
    </Link>
  );
}

function HealthDot({ status }: { status: boolean | null }) {
  const color =
    status === null
      ? "bg-text-tertiary"
      : status
        ? "bg-success"
        : "bg-error";
  const label =
    status === null ? "Checking..." : status ? "Connected" : "Disconnected";

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden text-xs text-text-tertiary sm:inline">
        {label}
      </span>
    </div>
  );
}
