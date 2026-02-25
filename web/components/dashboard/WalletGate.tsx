"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";
import { WalletSelector } from "@/components/ui/WalletSelector";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();

  if (!address) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Connect Your Wallet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Connect a wallet to access the seller dashboard.
          </p>
          <div className="mt-6 flex justify-center">
            <WalletSelector />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
