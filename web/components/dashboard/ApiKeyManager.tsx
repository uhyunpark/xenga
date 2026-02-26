"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export function ApiKeyManager() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!address) return;
    try {
      const res = await authenticatedFetch(
        "/api/seller-api-keys",
        token
      );
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // Silently handle
    }
  }, [address, token]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!address) return;
    setCreating(true);
    setError(null);
    setNewKeyValue(null);

    try {
      const res = await authenticatedFetch(
        "/api/seller-api-keys",
        token,
        {
          method: "POST",
          body: JSON.stringify({ name: newKeyName.trim() || undefined }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setNewKeyValue(data.key);
        setNewKeyName("");
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create API key");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!address) return;
    setRevoking(keyId);
    setError(null);

    try {
      const res = await authenticatedFetch(
        `/api/seller-api-keys/${keyId}`,
        token,
        { method: "DELETE" }
      );

      if (res.ok) {
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to revoke key");
      }
    } catch {
      setError("Network error");
    } finally {
      setRevoking(null);
    }
  };

  const [copied, setCopied] = useState(false);
  const copyKey = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create new key */}
      <div className="rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Create API Key</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Use API keys to authenticate programmatic requests to the Xenga API.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (optional)"
            maxLength={100}
            className="flex-1 rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Key"}
          </button>
        </div>

        {/* Show new key (only visible once, right after creation) */}
        {newKeyValue && (
          <div className="mt-3 rounded-lg border border-accent-muted bg-accent-light p-3">
            <p className="text-xs font-medium text-accent">
              Key created! Copy it now &mdash; it won&apos;t be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded border border-border-default bg-bg-primary px-2 py-1 font-mono text-xs">
                {newKeyValue}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 rounded-md border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/10"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-error">{error}</p>}
      </div>

      {/* Existing keys */}
      <div className="rounded-xl border border-border-default bg-bg-secondary shadow-sm">
        <div className="border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold">Active Keys</h3>
        </div>

        {keys.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-secondary">
            No API keys yet.
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">
                      {key.keyPrefix}...
                    </code>
                    {key.name && (
                      <span className="text-xs text-text-tertiary">
                        {key.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Created{" "}
                    {new Date(key.createdAt * 1000).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={revoking === key.id}
                  className="rounded-md border border-error/30 px-2.5 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
                >
                  {revoking === key.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
