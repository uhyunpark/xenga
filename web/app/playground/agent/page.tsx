import type { Metadata } from "next";
import AgentPage from "./AgentPage";

export const metadata: Metadata = {
  title: "Agent Demo",
  description:
    "Watch an agent discover, pay for, and settle a service — with on-chain escrow and credit scoring on Base Sepolia.",
  openGraph: {
    title: "Agent Demo — Xenga",
    description:
      "Agent demo with on-chain escrow, credit scoring, and dispute resolution. x402 compatible.",
  },
  twitter: {
    title: "Agent Demo — Xenga",
    description:
      "Agent demo with on-chain escrow, credit scoring, and dispute resolution.",
  },
};

export default function Page() {
  return <AgentPage />;
}
