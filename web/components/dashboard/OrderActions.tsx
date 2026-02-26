"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { escrowVaultAbi } from "@shared/abi.js";
import { facilitatorFetch } from "@/lib/api/client";

interface OrderData {
  id: string;
  status: string;
  escrowId?: number;
}

interface OrderActionsProps {
  order: OrderData;
  onComplete: () => void;
}

// Module-level cache for escrow contract address (fetched once from /api/health)
let cachedEscrowAddress: `0x${string}` | null = null;

export function OrderActions({ order, onComplete }: OrderActionsProps) {
  const { walletClient, address, publicClient } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);
  const [escrowVaultAddress, setEscrowVaultAddress] = useState<`0x${string}` | null>(cachedEscrowAddress);

  useEffect(() => {
    if (cachedEscrowAddress) return;
    facilitatorFetch("/api/health")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.escrowContract) {
            cachedEscrowAddress = data.escrowContract as `0x${string}`;
            setEscrowVaultAddress(cachedEscrowAddress);
          }
        }
      })
      .catch(() => {});
  }, []);

  const canConfirmDelivery = order.status === "escrowed" && order.escrowId != null;
  const canRefund =
    (order.status === "escrowed" || order.status === "delivery_confirmed") &&
    order.escrowId != null;

  if (!canConfirmDelivery && !canRefund) return null;
  if (!walletClient || !address || !escrowVaultAddress) return null;

  const executeAction = async (action: "confirmDelivery" | "refund") => {
    if (!order.escrowId) return;
    setPending(action);
    setError(null);
    setConfirmDialog(null);

    try {
      const hash = await walletClient.writeContract({
        address: escrowVaultAddress,
        abi: escrowVaultAbi,
        functionName: action,
        args: [BigInt(order.escrowId)],
        account: address,
        chain: publicClient.chain,
      });

      // Wait for tx confirmation
      await publicClient.waitForTransactionReceipt({ hash });
      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
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
              {pending ? "Signing..." : "Confirm"}
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
              {pending === "confirmDelivery" ? "Signing..." : "Confirm Delivery"}
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => setConfirmDialog("refund")}
              disabled={!!pending}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              {pending === "refund" ? "Signing..." : "Refund"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
