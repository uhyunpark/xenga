import type { Metadata } from "next";
import AgentPage from "./AgentPage";

export const metadata: Metadata = {
  title: "Agent Service Demo",
  description:
    "Watch an autonomous agent execute discovery, payment, and on-chain escrow settlement — including dispute resolution on Base Sepolia.",
  openGraph: {
    title: "Agent Service Demo — Xenga",
    description:
      "Autonomous agent demo with machine-to-machine escrow payments, on-chain settlement, and dispute resolution.",
  },
  twitter: {
    title: "Agent Service Demo — Xenga",
    description:
      "Autonomous agent demo with machine-to-machine escrow payments and on-chain settlement.",
  },
};

export default function Page() {
  return <AgentPage />;
}
