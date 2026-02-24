"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortenAddress } from "@/lib/utils";

export function WalletSelector() {
  const {
    type,
    address,
    usdcBalance,
    isFunding,
    connectDemo,
    disconnect,
    fundDemoWallet,
  } = useWallet();

  if (!address) {
    return (
      <button
        onClick={connectDemo}
        className="rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      >
        Create Demo Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {type === "demo" && (usdcBalance === null || (usdcBalance !== null && parseFloat(usdcBalance) < 1)) && (
        <button
          onClick={fundDemoWallet}
          disabled={isFunding}
          className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
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
        <div className="h-2 w-2 rounded-full bg-success" />
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
