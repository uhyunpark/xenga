"use client";

import { PaymentLinkManager } from "@/components/dashboard/PaymentLinkManager";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function PaymentLinksPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Payment Links"
        subtitle="Create shareable checkout links for your products and services."
      />

      <PaymentLinkManager />
    </div>
  );
}
