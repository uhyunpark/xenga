"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { WalletSelector } from "@/components/ui/WalletSelector";
import { requestPayment, signPayment, submitPayment } from "@/lib/api/payment-flow";

type CheckoutStep = "connect" | "review" | "signing" | "submitting" | "done";

export function CheckoutFlow({
  intentId,
  orderId,
  title,
  price,
  returnUrl,
}: {
  intentId: string;
  orderId: string;
  title: string;
  price: string;
  returnUrl: string | undefined;
}) {
  const { walletClient, address } = useWallet();
  const [step, setStep] = useState<CheckoutStep>("connect");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const priceUsdc = (Number(price) / 1e6).toFixed(2);

  async function handlePay() {
    if (!walletClient) return;
    setError(null);

    try {
      // Step 1: Request payment terms
      setStep("review");
      const { paymentRequired } = await requestPayment(orderId);

      // Step 2: Sign authorization
      setStep("signing");
      const payload = await signPayment(walletClient, paymentRequired);

      // Step 3: Submit payment
      setStep("submitting");
      const result = await submitPayment(orderId, payload);
      setTxHash(result.payment?.txHash ?? null);
      setStep("done");

      // Redirect if returnUrl is set
      if (returnUrl) {
        const url = new URL(returnUrl);
        url.searchParams.set("payment_intent", intentId);
        url.searchParams.set("status", "completed");
        if (result.payment?.txHash) {
          url.searchParams.set("tx_hash", result.payment.txHash);
        }
        setTimeout(() => {
          window.location.href = url.toString();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("connect");
    }
  }

  return (
    <div className="panel-surface rounded-2xl p-6">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">Checkout</h1>
        <p className="mt-1 text-sm text-text-secondary">Secure escrow payment via Xenga</p>
      </div>

      {/* Order summary */}
      <div className="mb-6 rounded-xl border border-border-default bg-bg-primary/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Item</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border-default pt-2">
          <span className="text-sm font-medium text-text-secondary">Total</span>
          <span className="text-lg font-bold text-accent">{priceUsdc} USDC</span>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {["Connect", "Review", "Sign", "Submit"].map((label, i) => {
          const stepIndex = ["connect", "review", "signing", "submitting"].indexOf(step);
          const active = i <= stepIndex || step === "done";
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  active
                    ? "bg-accent text-bg-primary"
                    : "border border-border-default text-text-tertiary"
                }`}
              >
                {step === "done" && i <= 3 ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div
                  className={`h-px w-6 ${active ? "bg-accent" : "bg-border-default"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Content per step */}
      {step === "connect" && !address && (
        <div className="space-y-4">
          <p className="text-center text-sm text-text-secondary">
            Connect your wallet to pay with USDC
          </p>
          <WalletSelector />
        </div>
      )}

      {step === "connect" && address && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border-default bg-bg-primary/50 p-3 text-center">
            <span className="text-xs text-text-tertiary">Paying from</span>
            <p className="mt-1 font-mono text-sm">{address}</p>
          </div>
          <button
            onClick={handlePay}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent/90"
          >
            Pay {priceUsdc} USDC
          </button>
        </div>
      )}

      {(step === "review" || step === "signing" || step === "submitting") && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-text-secondary">
            {step === "review" && "Requesting payment terms..."}
            {step === "signing" && "Waiting for signature..."}
            {step === "submitting" && "Settling on-chain..."}
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <svg className="h-6 w-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="font-semibold">Payment Successful</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Funds are secured in escrow.
          </p>
          {txHash && (
            <p className="mt-2 font-mono text-xs text-text-tertiary">
              tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </p>
          )}
          {returnUrl && (
            <p className="mt-3 text-xs text-text-tertiary">
              Redirecting back to merchant...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
