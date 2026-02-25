"use client";

import { createContext, useContext } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSession } from "@/lib/auth/useSession";

// Context to share the session token with all dashboard children
const SessionContext = createContext<string | null>(null);

export function useSessionToken(): string {
  const token = useContext(SessionContext);
  if (!token) throw new Error("useSessionToken must be used within WalletGate");
  return token;
}

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, type, walletClient, connectBrowser } = useWallet();
  const { token, signing, error, signIn } = useSession(walletClient, address);

  // Not connected or demo wallet
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

  // Connected but no session — prompt SIWE sign-in
  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Sign In</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Sign a message to verify your identity. This does not cost gas.
          </p>
          {error && (
            <p className="mt-3 text-xs text-error">{error}</p>
          )}
          <div className="mt-6 flex justify-center">
            <button
              onClick={signIn}
              disabled={signing}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {signing ? "Waiting for signature..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — render dashboard with session context
  return (
    <SessionContext.Provider value={token}>
      {children}
    </SessionContext.Provider>
  );
}
