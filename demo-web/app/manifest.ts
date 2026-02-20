import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EscrowVault — On-Chain Escrow Demo",
    short_name: "EscrowVault",
    description:
      "Interactive demo of on-chain escrow settlement with reputation scoring, dispute resolution, and programmable release logic on Base Sepolia.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0a0a0f",
    background_color: "#12121a",
  };
}
