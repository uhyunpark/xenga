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
  const {
    address,
    type,
    walletClient,
    connectBrowser,
    disconnect,
    isConnecting,
    error: walletError,
  } = useWallet();
  const {
    token,
    signing,
    error: sessionError,
    signIn,
  } = useSession(walletClient, address);

  // Authenticated — render dashboard
  if (address && type === "browser" && token) {
    return (
      <SessionContext.Provider value={token}>
        {children}
      </SessionContext.Provider>
    );
  }

  // Determine display state
  const isConnected = !!address && type === "browser";
  const isSigningIn =
    isConnected && !token && (signing || (!sessionError && !walletError));
  const error = walletError || sessionError;

  let title: string;
  let description: string;

  if (isConnecting) {
    title = "Connecting...";
    description = "Waiting for wallet approval...";
  } else if (isSigningIn) {
    title = "Signing In...";
    description =
      "Please sign the message in your wallet to verify your identity.";
  } else if (isConnected && sessionError) {
    title = "Sign-In Failed";
    description = "Could not complete authentication. Please try again.";
  } else if (isConnected && walletError) {
    title = "Wallet Error";
    description = walletError;
  } else if (type === "demo") {
    title = "Connect Your Wallet";
    description =
      "The dashboard requires a browser wallet (e.g. MetaMask). Demo wallets are not supported here.";
  } else {
    title = "Connect Your Wallet";
    description = "Connect a browser wallet to access the seller dashboard.";
  }

  let actionButton: React.ReactNode;

  if (isConnecting || isSigningIn) {
    actionButton = (
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-accent" />
    );
  } else if (isConnected && sessionError) {
    actionButton = (
      <button
        onClick={signIn}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Retry Sign In
      </button>
    );
  } else if (isConnected && walletError) {
    actionButton = (
      <button
        onClick={disconnect}
        className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary"
      >
        Disconnect
      </button>
    );
  } else {
    actionButton = (
      <button
        onClick={connectBrowser}
        disabled={isConnecting}
        className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary disabled:opacity-50"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md rounded-2xl border border-border-default bg-bg-secondary p-8 text-center shadow-md">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>
        {error && !walletError && (
          <p className="mt-3 text-xs text-error">{error}</p>
        )}
        <div className="mt-6 flex justify-center">{actionButton}</div>
      </div>
    </div>
  );
}
