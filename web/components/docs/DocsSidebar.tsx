"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/sdk-reference", label: "SDK Reference" },
    ],
  },
  {
    title: "Guides",
    items: [
      { href: "/docs/agent-guide", label: "Agent Guide" },
      { href: "/docs/seller-guide", label: "Seller Guide" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/api-reference", label: "API Reference" },
      { href: "/docs/agent-skills", label: "Agent Skills" },
      { href: "/docs/erc-8004-comparison", label: "ERC-8004 Comparison" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-default px-4 pt-4 pb-3">
        <Link
          href="/"
          className="font-semibold text-accent hover:text-accent/80"
        >
          Xenga <span className="text-text-primary">Docs</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              {section.title}
            </p>
            {section.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                active={pathname === item.href}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </SidebarLink>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger bar */}
      <div className="sticky top-0 z-50 flex h-14 items-center bg-white/80 px-4 shadow-sm backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default text-text-secondary"
          aria-label="Toggle sidebar"
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
        <Link
          href="/"
          className="ml-3 font-semibold text-accent hover:text-accent/80"
        >
          Xenga <span className="text-text-primary">Docs</span>
        </Link>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
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
      <div className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto bg-bg-secondary shadow-[1px_0_0_0_#e2e8f0]">
          {sidebar}
        </div>
      </div>
    </>
  );
}

function SidebarLink({
  href,
  children,
  active,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-light font-medium text-accent"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
      )}
      {children}
    </Link>
  );
}
