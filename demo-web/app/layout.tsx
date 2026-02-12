import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { InspectorProvider } from "@/lib/protocol-inspector/context";

export const metadata: Metadata = {
  title: "x402 Escrow — HTTP 402 Payment Demo",
  description:
    "Interactive demo of the x402 escrow payment protocol. HTTP-native payments with on-chain escrow protection on Base Sepolia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
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
      </body>
    </html>
  );
}
