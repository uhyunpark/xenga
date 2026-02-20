import type { Metadata } from "next";
import MarketplacePage from "./MarketplacePage";

export const metadata: Metadata = {
  title: "Marketplace Demo",
  description:
    "Interactive escrow marketplace demo — simulate buyer checkout, EIP-712 signing, on-chain settlement, and release or dispute decisions on Base Sepolia.",
  openGraph: {
    title: "Marketplace Demo — EscrowVault",
    description:
      "Interactive escrow marketplace demo with on-chain settlement, reputation scoring, and dispute resolution.",
  },
  twitter: {
    title: "Marketplace Demo — EscrowVault",
    description:
      "Interactive escrow marketplace demo with on-chain settlement and dispute resolution.",
  },
};

export default function Page() {
  return <MarketplacePage />;
}
