import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://xenga.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Xenga — On-Chain Escrow for Agents",
    template: "%s — Xenga",
  },
  description:
    "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
  authors: [{ name: "Xenga" }],
  creator: "Xenga",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Xenga",
    title: "Xenga — On-Chain Escrow for Agents",
    description:
      "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
  },
  twitter: {
    card: "summary",
    title: "Xenga — On-Chain Escrow for Agents",
    description:
      "On-chain escrow settlement for autonomous agents and marketplaces with reputation scoring and dispute resolution.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen bg-bg-primary text-text-primary">
        <Navbar />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
