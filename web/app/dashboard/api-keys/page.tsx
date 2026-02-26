"use client";

import { ApiKeyManager } from "@/components/dashboard/ApiKeyManager";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="API Keys"
        subtitle="Manage API keys for programmatic access."
      />

      <ApiKeyManager />
    </div>
  );
}
