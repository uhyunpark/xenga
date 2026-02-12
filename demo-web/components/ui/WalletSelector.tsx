"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortenAddress } from "@/lib/utils";

export function WalletSelector() {
  const {
    type,
    address,
    usdcBalance,
    isConnecting,
    isFunding,
    connectDemo,
    connectBrowser,
    disconnect,
    fundDemoWallet,
  } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  if (!address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary"
        >
          Connect Wallet
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border-default bg-bg-secondary p-1 shadow-xl">
            <button
              onClick={() => {
                connectDemo();
                setShowMenu(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              <div className="font-medium">Demo Wallet</div>
              <div className="text-xs text-text-tertiary">
                Instant, no extension needed
              </div>
            </button>
            <button
              onClick={async () => {
                await connectBrowser();
                setShowMenu(false);
              }}
              disabled={isConnecting}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              <div className="font-medium">Browser Wallet</div>
              <div className="text-xs text-text-tertiary">
                MetaMask or injected
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {type === "demo" && (
        <button
          onClick={fundDemoWallet}
          disabled={isFunding}
          className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          {isFunding ? "Funding..." : "Fund"}
        </button>
      )}
      {usdcBalance !== null && (
        <span className="text-xs text-text-secondary">
          {usdcBalance} USDC
        </span>
      )}
      <div className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-2.5 py-1.5">
        <div
          className={`h-2 w-2 rounded-full ${type === "demo" ? "bg-warning" : "bg-success"}`}
        />
        <span className="font-mono text-xs text-text-primary">
          {shortenAddress(address)}
        </span>
        <button
          onClick={disconnect}
          className="ml-1 text-text-tertiary transition-colors hover:text-text-primary"
          title="Disconnect"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
