import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xenga — On-Chain Escrow for Agents",
    short_name: "Xenga",
    description:
      "On-chain escrow and credit scoring for agents and marketplaces — settlement, dispute resolution, and programmable release logic on Base.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0a0a0f",
    background_color: "#12121a",
  };
}
