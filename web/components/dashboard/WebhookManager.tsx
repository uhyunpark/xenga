"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

const ALL_EVENT_TYPES = [
  "escrow.created",
  "escrow.released",
  "escrow.auto_released",
  "escrow.disputed",
  "escrow.resolved",
  "escrow.refunded",
  "delivery.confirmed",
] as const;

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  createdAt: number;
}

export function WebhookManager() {
  const { address } = useWallet();
  const token = useSessionToken();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(ALL_EVENT_TYPES));
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    if (!address) return;
    try {
      const res = await authenticatedFetch("/api/webhooks", token);
      if (res.ok) {
        const data = await res.json();
        setWebhooks(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently handle
    }
  }, [address, token]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const generateSecret = () => {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    setSecret(
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!address) return;
    setCreating(true);
    setError(null);

    try {
      const res = await authenticatedFetch("/api/webhooks", token, {
        method: "POST",
        body: JSON.stringify({
          url,
          secret,
          eventTypes: Array.from(selectedEvents),
        }),
      });

      if (res.ok) {
        setUrl("");
        setSecret("");
        setSelectedEvents(new Set(ALL_EVENT_TYPES));
        fetchWebhooks();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to register webhook");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!address) return;
    setDeleting(id);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/webhooks/${id}`, token, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchWebhooks();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete webhook");
      }
    } catch {
      setError("Network error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Register new webhook */}
      <div className="rounded-xl border border-border-default bg-bg-secondary p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Register Webhook</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Configure an endpoint to receive HTTP POST notifications when escrow events occur.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary">Secret</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="At least 16 characters"
                className="flex-1 rounded-lg border border-border-default bg-bg-primary px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={generateSecret}
                className="shrink-0 rounded-lg border border-border-default px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Used to sign webhook payloads (HMAC-SHA256). You&apos;ll need this to verify delivery.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary">Events</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ALL_EVENT_TYPES.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm transition-colors hover:bg-bg-tertiary cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.has(event)}
                    onChange={() => toggleEvent(event)}
                    className="h-3.5 w-3.5 rounded border-border-default text-accent focus:ring-accent/20"
                  />
                  <span className="font-mono text-xs">{event}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !url || secret.length < 16 || selectedEvents.size === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Registering..." : "Register Webhook"}
          </button>
        </div>
      </div>

      {/* Existing webhooks */}
      <div className="rounded-xl border border-border-default bg-bg-secondary shadow-sm">
        <div className="border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold">Your Webhooks</h3>
        </div>

        {webhooks.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-secondary">
            No webhooks registered yet.
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{webhook.url}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {webhook.eventTypes.map((et) => (
                        <span
                          key={et}
                          className="rounded-full bg-bg-tertiary px-2 py-0.5 font-mono text-[10px] text-text-tertiary"
                        >
                          {et}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      Created {new Date(webhook.createdAt * 1000).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    disabled={deleting === webhook.id}
                    className="shrink-0 rounded-md border border-error/30 px-2.5 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
                  >
                    {deleting === webhook.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
