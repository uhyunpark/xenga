"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { facilitatorFetch } from "@/lib/api/client";
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

const CHECKOUT_STEPS = [
  { key: "wallet", label: "Creating wallet" },
  { key: "funding", label: "Funding wallet" },
  { key: "order", label: "Creating order" },
  { key: "chain", label: "Submitting to chain" },
] as const;

type CheckoutStepKey = (typeof CHECKOUT_STEPS)[number]["key"];

function mapStepToCheckoutStep(step: Step): CheckoutStepKey | null {
  switch (step) {
    case "creating_wallet":
      return "wallet";
    case "funding":
      return "funding";
    case "creating_order":
    case "requesting":
    case "signing":
      return "order";
    case "submitting":
      return "chain";
    default:
      return null;
  }
}

export function PaymentLinkCheckout({ linkId }: { linkId: string }) {
  const {
    address,
    walletClient,
    publicClient,
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
        // Poll on-chain balance until funds arrive (up to 15s)
        const usdcAddr = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
        const erc20BalanceOf = [{
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        }] as const;
        for (let i = 0; i < 15; i++) {
          const bal = await publicClient.readContract({
            address: usdcAddr,
            abi: erc20BalanceOf,
            functionName: "balanceOf",
            args: [address],
          }) as bigint;
          if (Number(bal) / 1e6 >= parseFloat(link.price)) break;
          await new Promise(r => setTimeout(r, 1000));
        }
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
  }, [link, walletClient, address, publicClient, usdcBalance, fundDemoWallet, linkId]);

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

  const currentCheckoutStep = mapStepToCheckoutStep(step);
  const isInProgress =
    step !== "loading" &&
    step !== "details" &&
    step !== "complete" &&
    step !== "error";

  // Loading skeleton
  if (step === "loading") {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-8 shadow-lg">
        {/* Header skeleton */}
        <div className="flex items-center justify-center gap-2">
          <div className="skeleton h-4 w-4 rounded" />
          <div className="skeleton h-3 w-28" />
        </div>
        {/* Product card skeleton */}
        <div className="mt-6 rounded-xl border border-border-default bg-bg-primary p-5">
          <div className="skeleton h-5 w-3/4" />
          <div className="skeleton mt-2 h-4 w-full" />
          <div className="mt-4 border-t border-border-default pt-3">
            <div className="flex items-baseline justify-between">
              <div className="skeleton h-3 w-10" />
              <div className="skeleton h-6 w-24" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div className="skeleton h-3 w-10" />
              <div className="skeleton h-3 w-28" />
            </div>
          </div>
        </div>
        {/* Button skeleton */}
        <div className="mt-6">
          <div className="skeleton h-11 w-full rounded-xl" />
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
        <div className="mt-6 rounded-xl border border-border-default bg-bg-primary p-5 shadow-md">
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
        <AnimatePresence mode="wait">
          {step === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <button
                onClick={handlePay}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Create Wallet &amp; Pay
              </button>
            </motion.div>
          )}

          {isInProgress && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-2.5 rounded-xl border border-accent-muted bg-accent-light px-4 py-4"
            >
              {CHECKOUT_STEPS.map((cs) => {
                const isPast =
                  currentCheckoutStep !== null &&
                  CHECKOUT_STEPS.findIndex((s) => s.key === currentCheckoutStep) >
                    CHECKOUT_STEPS.findIndex((s) => s.key === cs.key);
                const isCurrent = cs.key === currentCheckoutStep;

                return (
                  <div key={cs.key} className="flex items-center gap-3">
                    {/* Step indicator */}
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {isPast ? (
                        <svg className="h-5 w-5 text-success" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                          <path className="animate-draw-check" d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : isCurrent ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-full bg-text-tertiary/40" />
                      )}
                    </div>
                    {/* Label */}
                    <span
                      className={`text-sm ${
                        isPast
                          ? "text-success"
                          : isCurrent
                            ? "font-medium text-accent"
                            : "text-text-tertiary"
                      }`}
                    >
                      {cs.label}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          )}

          {step === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-success/20 bg-success/5 px-4 py-3">
                {/* Confetti burst */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  style={{
                    background: "radial-gradient(circle at center, rgba(34,197,94,0.15) 0%, transparent 70%)",
                    animation: "confetti-burst 0.8s ease-out forwards",
                  }}
                />
                <svg className="relative h-5 w-5 text-success" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path className="animate-draw-check" d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="relative text-sm font-medium text-success">Payment complete!</span>
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
            </motion.div>
          )}

          {step === "error" && error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-3"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-center gap-1.5 text-text-tertiary">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2.5" y="5" width="7" height="5.5" rx="1" />
          <path d="M4 5V3.5a2 2 0 014 0V5" />
        </svg>
        <p className="text-[10px]">
          Powered by Xenga &middot; Base Sepolia
        </p>
      </div>
    </div>
  );
}
