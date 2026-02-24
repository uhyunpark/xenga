"use client";

import { SellerDashboard } from "@/components/seller/SellerDashboard";

export default function SellerPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="panel-surface mb-6 rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
              Seller View
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">Seller Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage orders, confirm deliveries, view earnings, and monitor your reputation.
          </p>
        </div>
        <SellerDashboard />
      </div>
    </div>
  );
}
