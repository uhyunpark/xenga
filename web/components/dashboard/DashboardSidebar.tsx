"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "home" },
  { href: "/dashboard/orders", label: "Orders", icon: "orders" },
];

const SETTINGS_ITEMS = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/api-keys", label: "API Keys", icon: "key" },
];

const COMING_SOON = [
  { label: "Payment Links", icon: "link" },
  { label: "Webhooks", icon: "webhook" },
];

const ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6.5L8 2l6 4.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  orders: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3h10v10H3V3zm0 3.5h10M6 3v10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" /><path d="M8 1v2m0 10v2m-5-7H1m14 0h-2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41" strokeLinecap="round" />
    </svg>
  ),
  key: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5.5" cy="10.5" r="3" /><path d="M8 8l5-5m0 0v3m0-3h-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  link: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 9.5l3-3M5 11a2.5 2.5 0 010-3.54l1-1M11 5a2.5 2.5 0 010 3.54l-1 1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  webhook: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address, disconnect } = useWallet();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4 border-b border-border-default">
        {address ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-sm font-bold">
              {address.slice(2, 4).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
              <p className="text-[11px] text-text-tertiary">Seller Dashboard</p>
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-text-primary">Dashboard</p>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Navigation
        </p>

        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.href} href={item.href} active={isActive(item.href)} icon={item.icon} onClick={() => setMobileOpen(false)}>
            {item.label}
          </SidebarLink>
        ))}

        <p className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Settings
        </p>

        {SETTINGS_ITEMS.map((item) => (
          <SidebarLink key={item.href} href={item.href} active={isActive(item.href)} icon={item.icon} onClick={() => setMobileOpen(false)}>
            {item.label}
          </SidebarLink>
        ))}

        <p className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Coming Soon
        </p>

        {COMING_SOON.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-tertiary"
          >
            {ICONS[item.icon]}
            <span>{item.label}</span>
            <span className="ml-auto rounded-full bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary">
              Soon
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-default px-2 py-3 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to site
        </Link>
        {address && (
          <button
            onClick={disconnect}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-error"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3m4-9l4 4-4 4m4-4H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <div className="sticky top-0 z-50 flex h-14 items-center bg-white/80 backdrop-blur-xl shadow-sm px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default text-text-secondary"
          aria-label="Toggle sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {mobileOpen ? (
              <path d="M3.5 3.5l9 9m0-9l-9 9" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M2.5 4h11m-11 4h11m-11 4h11" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
        <span className="ml-3 text-sm font-semibold text-text-primary">
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Dashboard"}
        </span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute left-0 top-0 h-full w-60 bg-bg-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden w-60 shrink-0 bg-bg-secondary shadow-[1px_0_0_0_#e2e8f0] lg:block">
        {sidebar}
      </div>
    </>
  );
}

function SidebarLink({
  href,
  children,
  active,
  icon,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-light text-accent font-medium"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
      )}
      {ICONS[icon]}
      {children}
    </Link>
  );
}
