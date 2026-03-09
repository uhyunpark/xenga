import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xenga — On-Chain Escrow and Open Credit Data for Humans & Agents",
    short_name: "Xenga",
    description:
      "On-chain escrow and open credit data for humans and agents — USDC settlement, dispute resolution, and portable reputation on Base.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0a0a0f",
    background_color: "#12121a",
  };
}
