"use client";

import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { InspectorProvider } from "@/lib/protocol-inspector/context";

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider mode="demo">
      <InspectorProvider>{children}</InspectorProvider>
    </WalletProvider>
  );
}
