"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

interface PaymentLink {
  id: string;
  title: string;
  description: string;
  price: string;
  serviceType: string;
  active: boolean;
  createdAt: number;
}

export function PaymentLinkManager() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [serviceType, setServiceType] = useState("marketplace");
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  // Cleanup timeouts on unmount
  useEffect(() => {
    if (!justCreated) return;
    const timer = setTimeout(() => setJustCreated(false), 3000);
    return () => clearTimeout(timer);
  }, [justCreated]);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const fetchLinks = useCallback(async () => {
    if (!address) return;
    try {
      const res = await authenticatedFetch("/api/payment-links", token);
      if (res.ok) {
        const data = await res.json();
        setLinks(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleCreate = async () => {
    if (!address) return;
    setCreating(true);
    setError(null);

    try {
      const res = await authenticatedFetch("/api/payment-links", token, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: parseFloat(price),
          serviceType,
        }),
      });

      if (res.ok) {
        setTitle("");
        setDescription("");
        setPrice("");
        setServiceType("marketplace");
        setJustCreated(true);
        fetchLinks();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create payment link");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!address) return;
    setDeactivating(id);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/payment-links/${id}/deactivate`, token, {
        method: "POST",
      });

      if (res.ok) {
        fetchLinks();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to deactivate link");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeactivating(null);
    }
  };

  const copyUrl = (id: string) => {
    const url = `${window.location.origin}/pay/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
  };

  const priceNum = parseFloat(price);
  const canCreate = title.trim() && price && !isNaN(priceNum) && priceNum > 0;

  const formatPrice = (p: string) =>
    parseFloat(p).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Create Payment Link</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Generate a shareable URL that lets anyone pay you via Xenga escrow.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Product or service name"
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description (optional)"
              maxLength={2000}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary">Price (USDC)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary">Service Type</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
              >
                <option value="marketplace">Marketplace</option>
                <option value="agent-service">Agent Service</option>
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !canCreate}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Link"}
          </button>
        </div>
      </div>

      {/* Success feedback */}
      {justCreated && (
        <div className="rounded-lg border border-accent-muted bg-accent-light px-4 py-2.5">
          <p className="text-xs font-medium text-accent">
            Payment link created successfully.
          </p>
        </div>
      )}

      {/* Existing links */}
      <div className="rounded-xl border border-border-default bg-bg-secondary shadow-sm">
        <div className="border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold">Your Payment Links</h3>
        </div>

        {loading ? (
          <div className="divide-y divide-border-default">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-4 w-16 rounded-full" />
                </div>
                <div className="skeleton mt-2 h-3 w-2/3" />
                <div className="skeleton mt-2 h-4 w-20" />
              </div>
            ))}
          </div>
        ) : links.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-secondary">
            No payment links yet.
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {links.map((link) => (
              <div
                key={link.id}
                className={`px-4 py-3 transition-colors hover:bg-bg-tertiary/50 ${!link.active ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {link.active && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                      )}
                      <p className="text-sm font-medium">{link.title}</p>
                      <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
                        {link.serviceType}
                      </span>
                      {!link.active && (
                        <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-medium text-error">
                          Deactivated
                        </span>
                      )}
                    </div>
                    {link.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">
                        {link.description}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-sm font-medium">{formatPrice(link.price)} USDC</span>
                      <span className="text-xs text-text-tertiary">
                        Created {new Date(link.createdAt * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {link.active && (
                      <>
                        <button
                          onClick={() => copyUrl(link.id)}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            copiedId === link.id
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-border-default text-text-secondary hover:bg-bg-tertiary"
                          }`}
                        >
                          {copiedId === link.id ? "Copied!" : "Copy URL"}
                        </button>
                        <button
                          onClick={() => handleDeactivate(link.id)}
                          disabled={deactivating === link.id}
                          className="rounded-md border border-error/30 px-2.5 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
                        >
                          {deactivating === link.id ? "..." : "Deactivate"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
