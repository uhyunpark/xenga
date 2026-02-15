"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WalletSelector } from "@/components/ui/WalletSelector";
import { useInspector } from "@/lib/protocol-inspector/context";

const NAV_ITEMS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/agent", label: "Agent" },
  { href: "/session", label: "Session" },
  { href: "/explorer", label: "Explorer" },
  { href: "/metrics", label: "Metrics" },
  { href: "/reputation", label: "Reputation" },
];

export function Navbar() {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { isOpen, toggle, events } = useInspector();
  const isMockChain = process.env.NEXT_PUBLIC_MOCK_CHAIN === "true";

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        setHealthOk(r.ok);
      })
      .catch(() => setHealthOk(false));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const protocolCount = events.length;
  const chainLabel = isMockChain ? "Mock Chain Mode" : "Base Sepolia";
  const chainBadgeClass = isMockChain
    ? "border-accent-purple/35 bg-accent-purple/10 text-accent-purple"
    : "border-warning/30 bg-warning/10 text-warning";

  return (
    <nav className="sticky top-0 z-50 border-b border-border-default bg-bg-primary/85 backdrop-blur-xl">
      <div className="mx-auto max-w-[90rem] px-4">
        <div className="flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary/75 px-2.5 py-1.5 font-semibold transition-colors hover:border-border-active"
            >
              <span className="text-accent">x402</span>
              <span className="text-text-secondary">Escrow</span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  active={pathname.startsWith(item.href)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`hidden rounded-full border px-2 py-0.5 text-xs font-medium lg:inline-flex ${chainBadgeClass}`}
              title={
                isMockChain
                  ? "Simulated chain mode. No live blockchain settlement."
                  : "Live testnet mode on Base Sepolia."
              }
            >
              {chainLabel}
            </span>
            <HealthDot status={healthOk} />
            <button
              onClick={toggle}
              className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border-active hover:bg-bg-tertiary md:inline-flex ${
                isOpen
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border-default bg-bg-secondary text-text-secondary"
              }`}
            >
              Protocol
              {protocolCount > 0 && (
                <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                  {protocolCount}
                </span>
              )}
            </button>
            <div className="hidden md:block">
              <WalletSelector />
            </div>
            <button
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-bg-secondary text-text-secondary transition-colors hover:border-border-active hover:text-text-primary md:hidden"
              aria-label="Toggle menu"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                {mobileOpen ? (
                  <path
                    d="M3.5 3.5l9 9m0-9l-9 9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M2.5 4h11m-11 4h11m-11 4h11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="space-y-3 border-t border-border-default py-3 md:hidden">
            <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-secondary/60 px-3 py-2">
              <span className="text-xs font-medium text-text-secondary">
                Chain Environment
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${chainBadgeClass}`}
              >
                {chainLabel}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-secondary/60 px-3 py-2">
              <span className="text-xs font-medium text-text-secondary">
                Protocol Inspector
              </span>
              <button
                onClick={toggle}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  isOpen
                    ? "bg-accent/15 text-accent"
                    : "bg-bg-tertiary text-text-secondary"
                }`}
              >
                {isOpen ? "Opened" : "Open"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  active={pathname.startsWith(item.href)}
                  mobile
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
            <div className="rounded-lg border border-border-default bg-bg-secondary/60 p-2">
              <WalletSelector />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
  active,
  mobile,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  mobile?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent/12 text-accent"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      } ${mobile ? "block w-full" : ""}`}
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
    <div className="flex items-center gap-1.5 rounded-full border border-border-default bg-bg-secondary/70 px-2 py-1" title={label}>
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden text-xs text-text-tertiary sm:inline">
        {label}
      </span>
    </div>
  );
}
