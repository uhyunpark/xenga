"use client";

import { ApiKeyManager } from "@/components/dashboard/ApiKeyManager";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage API keys for programmatic access to the Xenga API.
        </p>
      </div>

      <ApiKeyManager />
    </div>
  );
}
