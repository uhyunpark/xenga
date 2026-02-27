import type { Metadata } from "next";
import AgentPage from "./AgentPage";

export const metadata: Metadata = {
  title: "Agent Demo",
  description:
    "Watch an autonomous agent discover, pay for, and settle a service — with on-chain escrow and reputation scoring on Base Sepolia.",
  openGraph: {
    title: "Agent Demo — Xenga",
    description:
      "Autonomous agent demo with on-chain escrow, reputation scoring, and dispute resolution. x402 compatible.",
  },
  twitter: {
    title: "Agent Demo — Xenga",
    description:
      "Autonomous agent demo with on-chain escrow, reputation scoring, and dispute resolution.",
  },
};

export default function Page() {
  return <AgentPage />;
}
