import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zenga — On-Chain Escrow for Agents",
    short_name: "Zenga",
    description:
      "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0a0a0f",
    background_color: "#12121a",
  };
}
