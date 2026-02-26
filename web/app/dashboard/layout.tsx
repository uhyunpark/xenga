import type { Metadata } from "next";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { WalletGate } from "@/components/dashboard/WalletGate";
import { WalletProvider } from "@/lib/wallet/WalletProvider";

export const metadata: Metadata = {
  title: "Dashboard — Xenga",
  description: "Manage your escrow orders, earnings, and API integrations.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider mode="browser">
      <WalletGate>
        <div className="flex min-h-screen">
          <DashboardSidebar />
          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
          </main>
        </div>
      </WalletGate>
    </WalletProvider>
  );
}
