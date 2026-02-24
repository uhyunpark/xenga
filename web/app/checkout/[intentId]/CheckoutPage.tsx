"use client";

import { useEffect, useState, use } from "react";
import { facilitatorFetch } from "@/lib/api/client";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

interface PaymentIntentData {
  id: string;
  orderId: string;
  status: "pending" | "completed" | "expired" | "failed";
  expiresAt: number;
  order?: {
    id: string;
    title: string;
    status: string;
    price: string;
    escrowId?: number;
    txHash?: string;
  };
}

export function CheckoutPage({
  paramsPromise,
}: {
  paramsPromise: Promise<{ intentId: string }>;
}) {
  const { intentId } = use(paramsPromise);
  const [intent, setIntent] = useState<PaymentIntentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    facilitatorFetch(`/api/payment-intents/${intentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setIntent(data as PaymentIntentData))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [intentId]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {loading && (
          <div className="panel-surface rounded-2xl p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-4 text-sm text-text-secondary">Loading checkout...</p>
          </div>
        )}

        {error && (
          <div className="panel-surface rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
              <svg className="h-6 w-6 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Checkout Error</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
          </div>
        )}

        {intent && intent.status === "expired" && (
          <div className="panel-surface rounded-2xl p-8 text-center">
            <h2 className="text-lg font-semibold">Payment Expired</h2>
            <p className="mt-2 text-sm text-text-secondary">
              This payment link has expired. Please request a new one from the merchant.
            </p>
          </div>
        )}

        {intent && intent.status === "completed" && (
          <div className="panel-surface rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <svg className="h-6 w-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Payment Complete</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Funds are in escrow. Transaction: {intent.order?.txHash?.slice(0, 10)}...
            </p>
          </div>
        )}

        {intent && intent.status === "pending" && intent.order && (
          <CheckoutFlow
            intentId={intent.id}
            orderId={intent.order.id}
            title={intent.order.title}
            price={intent.order.price}
            returnUrl={undefined}
          />
        )}
      </div>
    </div>
  );
}
