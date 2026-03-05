"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSessionToken } from "@/components/dashboard/WalletGate";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

interface OrderData {
  id: string;
  status: string;
  escrowId?: number;
}

interface OrderActionsProps {
  order: OrderData;
  onComplete: () => void;
}

export function OrderActions({ order, onComplete }: OrderActionsProps) {
  const { address } = useWallet();
  const token = useSessionToken();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);

  const canConfirmDelivery = order.status === "escrowed" && order.escrowId != null;
  const canRefund =
    (order.status === "escrowed" || order.status === "delivery_confirmed") &&
    order.escrowId != null;

  if (!canConfirmDelivery && !canRefund) return null;
  if (!address) return null;

  const executeAction = async (action: "confirmDelivery" | "refund") => {
    if (!order.escrowId) return;
    setPending(action);
    setError(null);
    setConfirmDialog(null);

    try {
      const endpoint = action === "confirmDelivery"
        ? `/api/orders/${order.id}/confirm-delivery`
        : `/api/orders/${order.id}/refund`;

      const res = await authenticatedFetch(endpoint, token, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message.length > 100 ? message.slice(0, 100) + "..." : message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      )}

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="text-xs font-medium text-warning">
            {confirmDialog === "confirmDelivery"
              ? "Confirm that you have delivered this order? The buyer will have a window to dispute."
              : "Refund the full amount to the buyer? This cannot be undone."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => executeAction(confirmDialog as "confirmDelivery" | "refund")}
              disabled={!!pending}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "Processing..." : "Confirm"}
            </button>
            <button
              onClick={() => setConfirmDialog(null)}
              className="rounded-md border border-border-default px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirmDialog && (
        <div className="flex gap-2">
          {canConfirmDelivery && (
            <button
              onClick={() => setConfirmDialog("confirmDelivery")}
              disabled={!!pending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {pending === "confirmDelivery" ? "Processing..." : "Confirm Delivery"}
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => setConfirmDialog("refund")}
              disabled={!!pending}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              {pending === "refund" ? "Processing..." : "Refund"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
