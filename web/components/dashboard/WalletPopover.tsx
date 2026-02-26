"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { shortenAddress } from "@/lib/utils";
import { isMockChainClient } from "@/lib/env/isMockChainClient";

interface WalletPopoverProps {
  address: string;
  onDisconnect: () => void;
  onSwitchWallet: () => void;
}

export function WalletPopover({
  address,
  onDisconnect,
  onSwitchWallet,
}: WalletPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-tertiary"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-sm font-bold">
          {address.slice(2, 4).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {shortenAddress(address)}
          </p>
          <p className="text-[11px] text-text-tertiary">Seller Dashboard</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="M4 6l4 4 4-4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg"
          role="menu"
        >
          <button
            onClick={handleCopy}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            role="menuitem"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect
                x="5"
                y="5"
                width="9"
                height="9"
                rx="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {copied ? "Copied!" : "Copy address"}
          </button>

          {!isMockChainClient && (
            <a
              href={`https://sepolia.basescan.org/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              role="menuitem"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M12 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4m0-2h6v6m-6 0L14 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              View on BaseScan
            </a>
          )}

          <div className="my-1 border-t border-border-default" />

          <button
            onClick={() => {
              setOpen(false);
              onSwitchWallet();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            role="menuitem"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M2 8h12m-4-4l4 4-4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Switch wallet
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-error"
            role="menuitem"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3m4-9l4 4-4 4m4-4H6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Disconnect
          </button>

          <div className="my-1 border-t border-border-default" />

          <Link
            href="/"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M10 3L5 8l5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to site
          </Link>
        </div>
      )}
    </div>
  );
}
