"use client";

import { SellerProfile } from "@/components/dashboard/SellerProfile";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your seller profile and preferences.
        </p>
      </div>

      <SellerProfile />
    </div>
  );
}
