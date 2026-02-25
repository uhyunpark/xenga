"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, type, connectBrowser } = useWallet();

  if (!address || type === "demo") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Connect Your Wallet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {type === "demo"
              ? "The dashboard requires a browser wallet (e.g. MetaMask). Demo wallets are not supported here."
              : "Connect a browser wallet to access the seller dashboard."}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={connectBrowser}
              className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
