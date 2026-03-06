"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isAddress } from "viem";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { facilitatorFetch } from "@/lib/api/client";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

export function SellerProfile() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [payoutAddress, setPayoutAddress] = useState("");
  const [savedPayoutAddress, setSavedPayoutAddress] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Cleanup success timeout on unmount
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  // Fetch existing profile
  useEffect(() => {
    if (!address) return;
    facilitatorFetch(`/api/sellers/${address}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const seller = data.seller || data;
          setName(seller.name || "");
          setSavedName(seller.name || null);
          setPayoutAddress(seller.payoutAddress || "");
          setSavedPayoutAddress(seller.payoutAddress || null);
          setIsRegistered(true);
        }
      })
      .catch(() => {});
  }, [address]);

  const isValidPayout = !payoutAddress.trim() || isAddress(payoutAddress.trim());
  const hasUnsavedChanges =
    name.trim() !== (savedName || "") ||
    payoutAddress.trim() !== (savedPayoutAddress || "");
  const noChanges = isRegistered && !hasUnsavedChanges;

  const handleSave = async () => {
    if (!address) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await authenticatedFetch("/api/sellers", token, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || undefined,
          payoutAddress: payoutAddress.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const seller = data.seller || data;
        setSavedName(seller.name || null);
        setSavedPayoutAddress(seller.payoutAddress || null);
        setIsRegistered(true);
        setSuccess(true);
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
    <div className="rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Seller Profile</h3>
        {hasUnsavedChanges && (
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        )}
      </div>

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
            className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary">
            Payout Address
          </label>
          <input
            type="text"
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
            placeholder={address || "0x..."}
            className={`mt-1 w-full rounded-lg border bg-bg-primary px-3 py-2 font-mono text-sm outline-none transition-colors focus:ring-1 ${
              !isValidPayout
                ? "border-error focus:border-error focus:ring-error/20"
                : "border-border-default focus:border-accent focus:ring-accent/20"
            }`}
          />
          {!isValidPayout ? (
            <p className="mt-1 text-xs text-error">Invalid Ethereum address.</p>
          ) : (
            <p className="mt-1 text-xs text-text-tertiary">
              Leave empty to use your connected wallet ({address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "\u2014"}).
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs text-error">{error}</p>
        )}

        <AnimatePresence>
          {success && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg border border-accent-muted bg-accent-light px-3 py-2 text-xs text-accent"
            >
              Profile saved successfully.
            </motion.p>
          )}
        </AnimatePresence>

        {hasUnsavedChanges && (
          <p className="text-xs text-warning">You have unsaved changes.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || noChanges || !isValidPayout}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : isRegistered ? "Update Profile" : "Register as Seller"}
        </button>
      </div>
    </div>
  );
}
