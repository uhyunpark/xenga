"use client";

import { WebhookManager } from "@/components/dashboard/WebhookManager";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Webhooks"
        subtitle="Receive real-time notifications for escrow events."
      />

      <WebhookManager />
    </div>
  );
}
