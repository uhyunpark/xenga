"use client";

import { PaymentFlow } from "@/components/marketplace/PaymentFlow";
import { InspectorPanel } from "@/components/protocol-inspector/InspectorPanel";

export default function MarketplacePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Marketplace Demo</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Experience the full escrow lifecycle — payment, delivery, and
              release
            </p>
          </div>
          <PaymentFlow />
        </div>
      </div>

      {/* Protocol Inspector panel */}
      <InspectorPanel />
    </div>
  );
}
