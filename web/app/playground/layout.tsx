"use client";

import { WalletProvider } from "@/lib/wallet/WalletProvider";

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider mode="demo">
      {children}
    </WalletProvider>
  );
}
