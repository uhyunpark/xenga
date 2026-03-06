"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { facilitatorFetch, facilitatorUrl } from "@/lib/api/client";
import {
  requestPayment,
  signPayment,
  submitPayment,
  AlreadyPaidError,
} from "@/lib/api/payment-flow";

interface LinkDetails {
  id: string;
  title: string;
  description: string;
  price: string;
  serviceType: string;
  sellerAddress: string;
}

type Step =
  | "loading"
  | "details"
  | "creating_wallet"
  | "funding"
  | "creating_order"
  | "requesting"
  | "signing"
  | "submitting"
  | "complete"
  | "error";

export function PaymentLinkCheckout({ linkId }: { linkId: string }) {
  const {
    address,
    walletClient,
    connectDemo,
    fundDemoWallet,
    isFunding,
    usdcBalance,
  } = useWallet();

  const [link, setLink] = useState<LinkDetails | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [escrowId, setEscrowId] = useState<number | null>(null);

  // Fetch link details
  useEffect(() => {
    facilitatorFetch(`/api/payment-links/${linkId}/details`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setLink(data);
          setStep("details");
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Payment link not found");
          setStep("error");
        }
      })
      .catch(() => {
        setError("Failed to load payment link");
        setStep("error");
      });
  }, [linkId]);

  const runPaymentFlow = useCallback(async () => {
    if (!link) return;

    try {
      // Step 1: Create wallet
      setStep("creating_wallet");
      if (!address) {
        connectDemo();
        // Wait for wallet to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      setError("Failed to create wallet");
      setStep("error");
    }
  }, [link, address, connectDemo]);

  // Continue flow after wallet is connected
  const continueAfterWallet = useCallback(async () => {
    if (!link || !walletClient || !address) return;

    try {
      // Step 2: Fund wallet if needed
      const balance = parseFloat(usdcBalance || "0");
      if (balance < parseFloat(link.price)) {
        setStep("funding");
        await fundDemoWallet();
        // Wait for balance refresh
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Step 3: Create order from payment link
      setStep("creating_order");
      const checkoutRes = await facilitatorFetch(
        `/api/payment-links/${linkId}/checkout`,
        { method: "POST" }
      );

      if (!checkoutRes.ok) {
        const data = await checkoutRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create order");
      }

      const { orderId } = await checkoutRes.json();

      // Step 4: Request payment (get 402)
      setStep("requesting");
      const { paymentRequired } = await requestPayment(orderId);

      // Step 5: Sign payment
      setStep("signing");
      const payload = await signPayment(walletClient, paymentRequired);

      // Step 6: Submit payment
      setStep("submitting");
      const result = await submitPayment(orderId, payload);

      setTxHash(result.payment.txHash);
      setEscrowId(result.payment.escrowId);
      setStep("complete");
    } catch (err) {
      if (err instanceof AlreadyPaidError) {
        setStep("complete");
        return;
      }
      setError(err instanceof Error ? err.message : "Payment failed");
      setStep("error");
    }
  }, [link, walletClient, address, usdcBalance, fundDemoWallet, linkId]);

  // Chain: runPaymentFlow creates wallet → once address + walletClient ready, continue
  const [flowStarted, setFlowStarted] = useState(false);

  const handlePay = () => {
    setFlowStarted(true);
    runPaymentFlow();
  };

  useEffect(() => {
    if (flowStarted && address && walletClient && step === "creating_wallet") {
      continueAfterWallet();
    }
  }, [flowStarted, address, walletClient, step, continueAfterWallet]);

  const stepLabels: Record<Step, string> = {
    loading: "Loading...",
    details: "",
    creating_wallet: "Step 1/4: Creating wallet...",
    funding: "Step 2/4: Funding wallet...",
    creating_order: "Step 3/4: Creating order...",
    requesting: "Step 3/4: Requesting payment...",
    signing: "Step 3/4: Signing payment...",
    submitting: "Step 4/4: Submitting to chain...",
    complete: "",
    error: "",
  };

  if (step === "loading") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-8 shadow-lg">
        <div className="flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="ml-3 text-sm text-text-secondary">Loading...</span>
        </div>
      </div>
    );
  }

  if (step === "error" && !link) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
            <svg className="h-6 w-6 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-8 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 text-text-tertiary">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="10" height="8" rx="1.5" />
          <path d="M5 5V3.5A3 3 0 0111 3.5V5" />
        </svg>
        <span className="text-xs font-medium uppercase tracking-wider">Xenga Checkout</span>
      </div>

      {/* Product card */}
      {link && (
        <div className="mt-6 rounded-xl border border-border-default bg-bg-primary p-5">
          <h2 className="text-lg font-semibold">{link.title}</h2>
          {link.description && (
            <p className="mt-1 text-sm text-text-secondary">{link.description}</p>
          )}
          <div className="mt-4 flex items-baseline justify-between border-t border-border-default pt-3">
            <span className="text-sm text-text-tertiary">Price</span>
            <span className="text-xl font-semibold">{link.price} USDC</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-sm text-text-tertiary">Seller</span>
            <span className="font-mono text-xs text-text-secondary">
              {link.sellerAddress.slice(0, 6)}...{link.sellerAddress.slice(-4)}
            </span>
          </div>
        </div>
      )}

      {/* Action area */}
      <div className="mt-6">
        {step === "details" && (
          <button
            onClick={handlePay}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Create Wallet &amp; Pay
          </button>
        )}

        {step !== "details" && step !== "complete" && step !== "error" && (
          <div className="flex items-center gap-3 rounded-xl border border-accent-muted bg-accent-light px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-sm text-accent">{stepLabels[step]}</span>
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-green-700">Payment complete!</span>
            </div>
            {txHash && (
              <div className="text-center">
                <a
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  View on BaseScan
                </a>
              </div>
            )}
          </div>
        )}

        {step === "error" && error && (
          <div className="space-y-3">
            <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3">
              <p className="text-sm text-error">{error}</p>
            </div>
            <button
              onClick={() => {
                setError(null);
                setStep("details");
                setFlowStarted(false);
              }}
              className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[10px] text-text-tertiary">
        Powered by Xenga &middot; Base Sepolia
      </p>
    </div>
  );
}
