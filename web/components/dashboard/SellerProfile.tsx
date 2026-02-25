"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { facilitatorFetch } from "@/lib/api/client";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

export function SellerProfile() {
  const { address, walletClient } = useWallet();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch existing profile
  useEffect(() => {
    if (!address) return;
    facilitatorFetch(`/api/sellers/${address}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setName(data.name || "");
          setSavedName(data.name || null);
          setIsRegistered(true);
        }
      })
      .catch(() => {});
  }, [address]);

  const handleSave = async () => {
    if (!address || !walletClient) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await authenticatedFetch("/api/sellers", walletClient, address, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedName(data.name || null);
        setIsRegistered(true);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save profile");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-surface rounded-xl p-6">
      <h3 className="text-sm font-semibold">Seller Profile</h3>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Your business name"
            className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary">
            Payout Address
          </label>
          <p className="mt-1 rounded-lg border border-border-default bg-bg-tertiary/50 px-3 py-2 font-mono text-sm text-text-secondary">
            {address || "\u2014"}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            This is your connected wallet. USDC payouts are sent here.
          </p>
        </div>

        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        {success && (
          <p className="text-xs text-success">Profile saved successfully.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || (isRegistered && name.trim() === (savedName || ""))}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : isRegistered ? "Update Profile" : "Register as Seller"}
        </button>
      </div>
    </div>
  );
}
