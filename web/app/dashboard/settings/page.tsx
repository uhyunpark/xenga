"use client";

import { SellerProfile } from "@/components/dashboard/SellerProfile";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Settings"
        subtitle="Manage your seller profile and preferences."
      />

      <SellerProfile />
    </div>
  );
}
