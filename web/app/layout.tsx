import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://xenga.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Xenga — On-Chain Escrow & Credit Score Protocol",
    template: "%s — Xenga",
  },
  description:
    "On-chain credit scoring for autonomous agents and marketplaces — escrow settlement, dispute resolution, and portable reputation on Base.",
  authors: [{ name: "Xenga" }],
  creator: "Xenga",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Xenga",
    title: "Xenga — On-Chain Escrow & Credit Score Protocol",
    description:
      "On-chain credit scoring for autonomous agents and marketplaces — escrow settlement, dispute resolution, and portable reputation on Base.",
  },
  twitter: {
    card: "summary",
    title: "Xenga — On-Chain Escrow & Credit Score Protocol",
    description:
      "On-chain credit scoring for autonomous agents and marketplaces with escrow settlement and dispute resolution.",
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
