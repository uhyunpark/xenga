import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { InspectorProvider } from "@/lib/protocol-inspector/context";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://zenga.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Zenga — On-Chain Escrow for Agents",
    template: "%s — Zenga",
  },
  description:
    "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
  authors: [{ name: "Zenga" }],
  creator: "Zenga",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Zenga",
    title: "Zenga — On-Chain Escrow for Agents",
    description:
      "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
  },
  twitter: {
    card: "summary",
    title: "Zenga — On-Chain Escrow for Agents",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg-primary text-text-primary">
        <WalletProvider>
          <InspectorProvider>
            <Navbar />
            <main>{children}</main>
          </InspectorProvider>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
