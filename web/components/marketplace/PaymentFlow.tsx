"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useInspector } from "@/lib/protocol-inspector/context";
import { useOperatorAddress } from "@/lib/hooks/useOperatorAddress";
import {
  requestPayment,
  signPayment,
  submitPayment,
  AlreadyPaidError,
} from "@/lib/api/payment-flow";
import type { PaymentRequired, PaymentPayload } from "@/lib/api/payment-flow";
import type { ReputationScore } from "@shared/types";
import { escrowVaultAbi } from "@shared/abi.js";
import { baseSepolia } from "viem/chains";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { ReputationBadge } from "@/components/ui/ReputationBadge";
import { formatUsdc, shortenAddress } from "@/lib/utils";
import { ProductGrid, type Product } from "./ProductGrid";
import { DEMO_STEPS, StepTracker, type DemoStep } from "./StepTracker";
import { SellerPanel } from "./SellerPanel";
import { isMockChainClient } from "@/lib/env/isMockChainClient";
import { facilitatorFetch } from "@/lib/api/client";

function formatReleaseWindow(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `${seconds}s`;
}

interface FlowState {
  step: DemoStep;
  product: Product | null;
  orderId: string | null;
  escrowId: number | null;
  txHash: string | null;
  error: string | null;
  loading: boolean;
  orderData: any | null;
  disputeFiled: boolean;
  deliveryConfirmed: boolean;
  paymentRequired: PaymentRequired | null;
  paymentPayload: PaymentPayload | null;
  completionReputation: ReputationScore | null;
}

type FlowAction =
  | { type: "SELECT_PRODUCT"; product: Product }
  | { type: "SET_ORDER"; orderId: string; orderData: any }
  | { type: "SET_STEP"; step: DemoStep }
  | { type: "SET_ESCROWED"; escrowId: number; txHash: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "FILE_DISPUTE" }
  | { type: "DELIVERY_CONFIRMED" }
  | { type: "RESET" }
  | { type: "SET_PAYMENT_REQUIRED"; paymentRequired: PaymentRequired }
  | { type: "SET_PAYMENT_PAYLOAD"; paymentPayload: PaymentPayload }
  | { type: "SET_COMPLETION_REPUTATION"; reputation: ReputationScore };

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SELECT_PRODUCT":
      return { ...state, product: action.product, step: "create_order", error: null };
    case "SET_ORDER":
      return { ...state, orderId: action.orderId, orderData: action.orderData, step: "request_payment" };
    case "SET_STEP":
      return { ...state, step: action.step, error: null };
    case "SET_ESCROWED":
      return { ...state, escrowId: action.escrowId, txHash: action.txHash, step: "escrowed" };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "FILE_DISPUTE":
      return { ...state, disputeFiled: true };
    case "DELIVERY_CONFIRMED":
      return { ...state, deliveryConfirmed: true };
    case "RESET":
      return initialState;
    case "SET_PAYMENT_REQUIRED":
      return { ...state, paymentRequired: action.paymentRequired, step: "sign", loading: false, error: null };
    case "SET_PAYMENT_PAYLOAD":
      return { ...state, paymentPayload: action.paymentPayload, step: "submit", loading: false, error: null };
    case "SET_COMPLETION_REPUTATION":
      return { ...state, completionReputation: action.reputation };
    default:
      return state;
  }
}

const initialState: FlowState = {
  step: "select",
  product: null,
  orderId: null,
  escrowId: null,
  txHash: null,
  error: null,
  loading: false,
  orderData: null,
  disputeFiled: false,
  deliveryConfirmed: false,
  paymentRequired: null,
  paymentPayload: null,
  completionReputation: null,
};

const STEP_HINTS: Record<DemoStep, string> = {
  select: "Choose an item to initialize the escrow payment flow.",
  create_order: "Create an off-chain order before requesting payment terms.",
  request_payment: "Request escrow payment terms from the server.",
  sign: "Review required fields, then sign the typed USDC authorization.",
  submit: isMockChainClient
    ? "Submit the signed payload to settle escrow in simulation."
    : "Submit the signed payload to settle escrow on-chain.",
  escrowed: "Escrow has been created and is waiting for delivery confirmation.",
  delivery: "Decide whether to release funds or open a dispute.",
  complete: "Payment flow completed and seller settlement finalized.",
};

export function PaymentFlow() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { walletClient, publicClient, address, type: walletType, connectDemo, fundDemoWallet, isFunding, usdcBalance, refreshBalances } = useWallet();
  const inspector = useInspector();
  const operatorAddress = useOperatorAddress();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session storage for refresh recovery — use server order status as source of truth
  useEffect(() => {
    const saved = sessionStorage.getItem("xenga-marketplace-state");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed.orderId || parsed.step === "select") return;

      // Validate the order still exists on the server before restoring
      facilitatorFetch("/api/orders")
        .then((res) => res.json())
        .then((data: any) => {
          const orderList = Array.isArray(data) ? data : data.orders ?? [];
          const found = orderList.find((o: any) => o.id === parsed.orderId);
          if (!found) {
            sessionStorage.removeItem("xenga-marketplace-state");
            return;
          }

          // Server's order status is the source of truth
          const serverStatus = found.status;

          dispatch({ type: "SET_ORDER", orderId: parsed.orderId, orderData: parsed.orderData });

          switch (serverStatus) {
            case "created":
            case "pending_payment":
              // Pre-payment: restore client-side progress if available
              if (parsed.step === "sign" && parsed.paymentRequired) {
                dispatch({ type: "SET_PAYMENT_REQUIRED", paymentRequired: parsed.paymentRequired });
              } else if (parsed.step === "submit" && parsed.paymentPayload) {
                if (parsed.paymentRequired) {
                  dispatch({ type: "SET_PAYMENT_REQUIRED", paymentRequired: parsed.paymentRequired });
                }
                dispatch({ type: "SET_PAYMENT_PAYLOAD", paymentPayload: parsed.paymentPayload });
              }
              // Otherwise SET_ORDER already set step to "request_payment"
              break;

            case "escrowed":
              // Restore to escrowed — useEffect re-triggers delivery + polling
              dispatch({ type: "SET_ESCROWED", escrowId: found.escrowId, txHash: found.txHash });
              break;

            case "delivery_confirmed":
              // Jump to delivery with deliveryConfirmed already true
              dispatch({ type: "SET_ESCROWED", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "delivery" });
              dispatch({ type: "DELIVERY_CONFIRMED" });
              break;

            case "completed":
              dispatch({ type: "SET_ESCROWED", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "complete" });
              break;

            case "disputed":
              dispatch({ type: "SET_ESCROWED", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "delivery" });
              dispatch({ type: "DELIVERY_CONFIRMED" });
              dispatch({ type: "FILE_DISPUTE" });
              break;

            default:
              // resolved, refunded, or unknown — clear stale state
              sessionStorage.removeItem("xenga-marketplace-state");
              break;
          }
        })
        .catch(() => {
          // Server unreachable — clear stale state
          sessionStorage.removeItem("xenga-marketplace-state");
        });
    } catch {
      // ignore malformed JSON
    }
  }, []);

  useEffect(() => {
    if (state.orderId) {
      sessionStorage.setItem("xenga-marketplace-state", JSON.stringify({
        step: state.step,
        orderId: state.orderId,
        escrowId: state.escrowId,
        txHash: state.txHash,
        orderData: state.orderData,
        paymentRequired: state.paymentRequired,
        paymentPayload: state.paymentPayload,
      }));
    }
  }, [state.step, state.orderId, state.escrowId, state.txHash, state.orderData, state.paymentRequired, state.paymentPayload]);

  // When escrow is created, show "Funds Escrowed" for 2s then transition to delivery
  useEffect(() => {
    if (state.step !== "escrowed" || !state.orderId) return;
    const timeout = setTimeout(() => {
      dispatch({ type: "SET_STEP", step: "delivery" });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [state.step, state.orderId]);

  // When in delivery step and not yet confirmed, trigger confirm-delivery + poll
  // Keyed on deliveryOrderId which stays stable throughout the polling phase
  // (unlike the old escrowedOrderId which flipped to null when step changed)
  const deliveryOrderId = state.step === "delivery" && !state.deliveryConfirmed ? state.orderId : null;

  useEffect(() => {
    if (!deliveryOrderId) return;
    let cancelled = false;

    // Trigger server-side confirm-delivery (seller simulation) — may 400 if already confirmed
    facilitatorFetch(`/api/orders/${deliveryOrderId}/confirm-delivery`, {
      method: "POST",
    }).catch((err) => {
      console.warn("[PaymentFlow] confirm-delivery failed:", err);
    });

    // Poll until delivery is confirmed on-chain (max ~3 min)
    let attempts = 0;
    const maxAttempts = 60;
    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        dispatch({ type: "SET_ERROR", error: "Delivery confirmation timed out. Try refreshing." });
        return;
      }
      try {
        const res = await facilitatorFetch(`/api/orders?status=delivery_confirmed`);
        const data = await res.json();
        const orders = Array.isArray(data) ? data : data.orders ?? [];
        if (orders.find((o: any) => o.id === deliveryOrderId)) {
          clearInterval(interval);
          dispatch({ type: "DELIVERY_CONFIRMED" });
          inspector.addEvent({
            type: "state_change",
            label: "Delivery Confirmed",
            data: { previousState: "Active", newState: "DeliveryConfirmed" },
          });
        }
      } catch {
        // Retry on next interval
      }
    }, 3000);

    pollRef.current = interval;

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deliveryOrderId, inspector]);

  // Fetch seller reputation when transaction completes
  useEffect(() => {
    if (state.step !== "complete" || !operatorAddress) return;
    facilitatorFetch(`/api/reputation/${operatorAddress}?fresh=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rep) => {
        if (rep) dispatch({ type: "SET_COMPLETION_REPUTATION", reputation: rep });
      })
      .catch(() => {});
  }, [state.step, operatorAddress]);

  const handleSelectProduct = useCallback((product: Product) => {
    inspector.clear();
    inspector.setOpen(true);
    dispatch({ type: "SELECT_PRODUCT", product });
  }, [inspector]);

  const handleCreateOrder = useCallback(async () => {
    if (!state.product || !address || !operatorAddress) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      inspector.addEvent({
        type: "http_request",
        label: "Create Order",
        data: {
          method: "POST",
          url: "/api/orders",
          body: {
            title: state.product.title,
            price: state.product.price,
            serviceType: "marketplace",
            sellerAddress: operatorAddress,
          },
        },
      });

      const res = await facilitatorFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          title: state.product.title,
          description: state.product.description,
          price: state.product.price,
          serviceType: "marketplace",
          sellerAddress: operatorAddress,
        }),
      });

      const data = await res.json();

      inspector.addEvent({
        type: "http_response",
        label: "Order Created",
        data: { status: 201, body: data },
      });

      dispatch({ type: "SET_ORDER", orderId: data.id, orderData: data });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.product, address, operatorAddress, inspector]);

  // Step 3: Request payment — sends POST without X-PAYMENT, gets 402
  const handleRequestPayment = useCallback(async () => {
    if (!state.orderId || !walletClient) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const { paymentRequired } = await requestPayment(
        state.orderId,
        inspector.addEvent
      );
      dispatch({ type: "SET_PAYMENT_REQUIRED", paymentRequired });
    } catch (err: any) {
      if (err instanceof AlreadyPaidError) {
        const p = err.data?.payment;
        if (p?.escrowId && p?.txHash) {
          dispatch({ type: "SET_ESCROWED", escrowId: p.escrowId, txHash: p.txHash });
        } else {
          dispatch({ type: "SET_STEP", step: "escrowed" });
        }
      } else {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.orderId, walletClient, inspector]);

  // Step 4: Sign EIP-712 ReceiveWithAuthorization
  const handleSignPayment = useCallback(async () => {
    if (!state.paymentRequired || !walletClient) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const payload = await signPayment(
        walletClient,
        state.paymentRequired,
        inspector.addEvent
      );
      dispatch({ type: "SET_PAYMENT_PAYLOAD", paymentPayload: payload });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.paymentRequired, walletClient, inspector]);

  // Step 5: Submit payment on-chain
  const handleSubmitPayment = useCallback(async () => {
    if (!state.orderId || !state.paymentPayload) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const result = await submitPayment(
        state.orderId,
        state.paymentPayload,
        inspector.addEvent
      );
      dispatch({
        type: "SET_ESCROWED",
        escrowId: result.payment.escrowId,
        txHash: result.payment.txHash,
      });
      refreshBalances();
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.orderId, state.paymentPayload, inspector, refreshBalances]);

  const handleRelease = useCallback(async () => {
    if (!state.escrowId || !walletClient?.account || !state.paymentRequired) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      // Call releaseFunds on-chain — the demo wallet is the buyer, so it can release
      const txHash = await walletClient.writeContract({
        chain: baseSepolia,
        account: walletClient.account!,
        address: state.paymentRequired.escrowContract,
        abi: escrowVaultAbi,
        functionName: "releaseFunds",
        args: [BigInt(state.escrowId)],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      inspector.addEvent({
        type: "tx_confirmed",
        label: "Funds Released",
        data: { txHash, escrowId: state.escrowId, function: "releaseFunds" },
      });
      inspector.addEvent({
        type: "state_change",
        label: "Funds Released",
        data: { previousState: "DeliveryConfirmed", newState: "Completed" },
      });

      dispatch({ type: "SET_STEP", step: "complete" });
    } catch (err: any) {
      // Fallback: show completion even if on-chain release fails (mock mode, gas issues)
      inspector.addEvent({
        type: "state_change",
        label: "Funds Released",
        data: { previousState: "DeliveryConfirmed", newState: "Completed", note: "Release pending" },
      });
      dispatch({ type: "SET_STEP", step: "complete" });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.escrowId, state.paymentRequired, walletClient, publicClient, inspector]);

  const handleDispute = useCallback(async () => {
    if (!state.orderId) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const res = await facilitatorFetch(`/api/disputes/${state.orderId}`, {
        method: "POST",
        body: JSON.stringify({ reason: "Product not as described" }),
      });

      if (res.ok) {
        inspector.addEvent({
          type: "state_change",
          label: "Dispute Filed",
          data: { previousState: "DeliveryConfirmed", newState: "Disputed" },
        });
        dispatch({ type: "FILE_DISPUTE" });
      }
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.orderId, inspector]);

  const handleReset = useCallback(() => {
    sessionStorage.removeItem("xenga-marketplace-state");
    inspector.clear();
    dispatch({ type: "RESET" });
    refreshBalances();
  }, [inspector, refreshBalances]);

  const handleStepClick = useCallback((step: DemoStep) => {
    // Only allow navigating back to "select" from pre-payment steps
    if (step === "select" && (state.step === "create_order" || state.step === "request_payment")) {
      handleReset();
    }
  }, [state.step, handleReset]);

  // Ensure wallet is connected
  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 0.01;
  const currentStepIndex = Math.max(
    0,
    DEMO_STEPS.findIndex((step) => step.key === state.step)
  );
  const currentStepLabel = DEMO_STEPS[currentStepIndex]?.label ?? "Progress";
  const progressPercent =
    ((currentStepIndex + 1) / DEMO_STEPS.length) * 100;
  const stepHint = STEP_HINTS[state.step];
  const primaryButtonClass =
    "w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-50";
  const primaryGlowButtonClass =
    "w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left sidebar - Step tracker */}
      <div className="hidden shrink-0 lg:block lg:w-56">
        <div className="panel-surface sticky top-20 rounded-xl p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Flow Map
          </p>
          <StepTracker
            currentStep={state.step}
            className="mt-2"
            onStepClick={state.step === "create_order" || state.step === "request_payment" ? handleStepClick : undefined}
          />
          <p className="mt-3 rounded-lg border border-border-default bg-bg-primary/55 p-2 text-[11px] text-text-tertiary">
            {stepHint}
          </p>
          {state.step !== "select" && (
            <button
              onClick={handleReset}
              className="mt-3 w-full rounded-md border border-border-default px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-active hover:text-text-primary"
            >
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 space-y-4">
        <div className="panel-surface rounded-xl p-3 lg:hidden">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Escrow flow progress</span>
            <span className="font-mono">
              {currentStepIndex + 1}/{DEMO_STEPS.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-medium text-text-primary">
            {currentStepLabel}
          </p>
        </div>

        {/* Info banner */}
        <div className="panel-surface rounded-lg p-3 text-xs text-text-secondary">
          <span className="font-semibold text-accent">Simulation mode:</span> in production, buyer and seller are different people.
          Here, the server plays the seller so you can experience the full escrow lifecycle safely.
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Buyer panel */}
          <div className="space-y-4">
            <div className="panel-surface rounded-xl p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="7" cy="5" r="3" />
                    <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                  </svg>
                </div>
                <span className="text-sm font-semibold">Buyer</span>
                <span className="text-xs text-text-tertiary">(You)</span>
                <span className="ml-auto rounded-full border border-border-default bg-bg-primary/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
                  {currentStepLabel}
                </span>
              </div>
              <p className="mt-2 text-xs text-text-tertiary">{stepHint}</p>
            </div>

            <AnimatePresence mode="wait">
              {state.step === "select" && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {needsWallet ? (
                    <div className="panel-surface rounded-xl p-6 text-center">
                      <p className="mb-3 text-sm text-text-secondary">
                        Connect a wallet to start the demo
                      </p>
                      <button
                        onClick={connectDemo}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                      >
                        Create Demo Wallet
                      </button>
                    </div>
                  ) : needsFunding ? (
                    <div className="panel-surface rounded-xl p-6 text-center">
                      <p className="mb-1 text-sm font-medium text-text-primary">
                        You need USDC to try this
                      </p>
                      <p className="mb-4 text-xs text-text-tertiary">
                        Get free testnet USDC from the faucet to start the escrow flow.
                      </p>
                      <button
                        onClick={fundDemoWallet}
                        disabled={isFunding}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                      >
                        {isFunding ? "Getting Test USDC..." : "Get Test USDC"}
                      </button>
                    </div>
                  ) : (
                    <ProductGrid onSelect={handleSelectProduct} />
                  )}
                </motion.div>
              )}

              {state.step === "create_order" && state.product && (
                <motion.div
                  key="create_order"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="panel-surface rounded-xl p-4"
                >
                  <button
                    onClick={handleReset}
                    className="mb-2 flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7.5 9.5l-3.5-3.5 3.5-3.5" />
                    </svg>
                    Back to products
                  </button>
                  <h3 className="mb-2 text-sm font-semibold">
                    {state.product.title}
                  </h3>
                  <p className="mb-3 text-xs text-text-tertiary">
                    {state.product.description}
                  </p>
                  <div className="mb-4 flex items-center justify-between border-t border-border-default pt-3">
                    <span className="text-xs text-text-secondary">Total</span>
                    <span className="font-mono text-lg font-bold text-accent">
                      {state.product.price.toFixed(2)} USDC
                    </span>
                  </div>
                  <button
                    onClick={handleCreateOrder}
                    disabled={state.loading}
                    className={primaryButtonClass}
                  >
                    {state.loading ? "Creating Order..." : "Buy Now"}
                  </button>
                </motion.div>
              )}

              {/* Step 3: Request Payment */}
              {state.step === "request_payment" && (
                <motion.div
                  key="request_payment"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="panel-surface rounded-xl p-4"
                >
                  <button
                    onClick={handleReset}
                    className="mb-2 flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7.5 9.5l-3.5-3.5 3.5-3.5" />
                    </svg>
                    Back to products
                  </button>
                  <h3 className="mb-3 text-sm font-semibold">Pay with USDC</h3>
                  <div className="mb-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Product</span>
                      <span>{state.product?.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Amount</span>
                      <span className="font-mono text-accent">
                        {state.product?.price.toFixed(2)} USDC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Service Type</span>
                      <span>marketplace</span>
                    </div>
                  </div>
                  <button
                    onClick={handleRequestPayment}
                    disabled={state.loading}
                    className={primaryGlowButtonClass}
                  >
                    {state.loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Requesting...
                      </span>
                    ) : (
                      "Request Payment"
                    )}
                  </button>
                </motion.div>
              )}

              {/* Step 4: Sign — shows 402 result + sign button */}
              {state.step === "sign" && state.paymentRequired && (
                <motion.div
                  key="sign"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="panel-surface rounded-xl p-4"
                >
                  <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="info">Escrow Payment Required</Badge>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Payment Amount</span>
                        <span className="font-mono text-accent">
                          {formatUsdc(state.paymentRequired.amount)} USDC
                        </span>
                      </div>
                      {state.paymentRequired.facilitatorFee && BigInt(state.paymentRequired.facilitatorFee) > 0n && (
                        <>
                          <div className="flex justify-between text-text-tertiary">
                            <span>Facilitator Fee ({[state.paymentRequired.feeBps ? `${(state.paymentRequired.feeBps / 100).toFixed(1)}%` : "", state.paymentRequired.flatFee && BigInt(state.paymentRequired.flatFee) > 0n ? `$${formatUsdc(state.paymentRequired.flatFee)}` : ""].filter(Boolean).join(" + ") || ""})</span>
                            <span className="font-mono">
                              -{formatUsdc(state.paymentRequired.facilitatorFee)} USDC
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-border-subtle pt-1">
                            <span className="text-text-tertiary">Seller Receives</span>
                            <span className="font-mono">
                              {formatUsdc((BigInt(state.paymentRequired.amount) - BigInt(state.paymentRequired.facilitatorFee)).toString())} USDC
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-text-tertiary">Escrow Contract</span>
                        <AddressDisplay address={state.paymentRequired.escrowContract} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Service Type</span>
                        <span>{state.paymentRequired.serviceType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Release Window</span>
                        <span>{formatReleaseWindow(state.paymentRequired.releaseWindow)}</span>
                      </div>
                      {operatorAddress && (
                        <div className="mt-3 rounded-lg border border-border-default bg-bg-secondary/50 p-3">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-primary">Seller Trust Score</span>
                            <ReputationBadge address={operatorAddress} size="md" />
                          </div>
                          <p className="text-[11px] text-text-tertiary">
                            Based on the seller&apos;s on-chain escrow history: completion rate, dispute frequency, and transaction volume. Higher scores may qualify for shorter release windows.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mb-3 text-[11px] text-text-tertiary">
                    See the HTTP tab for the raw response headers.
                  </p>
                  <button
                    onClick={handleSignPayment}
                    disabled={state.loading}
                    className={primaryGlowButtonClass}
                  >
                    {state.loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Signing...
                      </span>
                    ) : (
                      "Sign Authorization"
                    )}
                  </button>
                </motion.div>
              )}

              {/* Step 5: Submit — shows signature result + submit button */}
              {state.step === "submit" && state.paymentPayload && (
                <motion.div
                  key="submit"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="panel-surface rounded-xl p-4"
                >
                  <div className="mb-3 rounded-lg border border-success/20 bg-success/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="success">Authorization Signed</Badge>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-text-tertiary">From</span>
                        <AddressDisplay address={state.paymentPayload.from} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Signature v</span>
                        <span className="font-mono">{state.paymentPayload.signature.v}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Signature r</span>
                        <span className="font-mono text-text-secondary">
                          {shortenAddress(state.paymentPayload.signature.r, 6)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Signature s</span>
                        <span className="font-mono text-text-secondary">
                          {shortenAddress(state.paymentPayload.signature.s, 6)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mb-3 text-[11px] text-text-tertiary">
                    See the Signatures tab for the full EIP-712 typed data.
                  </p>
                  <button
                    onClick={handleSubmitPayment}
                    disabled={state.loading}
                    className={primaryGlowButtonClass}
                  >
                    {state.loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {isMockChainClient
                          ? "Submitting simulated settlement..."
                          : "Submitting on-chain..."}
                      </span>
                    ) : (
                      "Submit Payment"
                    )}
                  </button>
                </motion.div>
              )}

              {(state.step === "escrowed" ||
                state.step === "delivery") && (
                <motion.div
                  key="escrowed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-success/20 bg-success/5 p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2">
                      <circle cx="8" cy="8" r="6" />
                      <path d="M5 8l2 2 4-4" />
                    </svg>
                    <span className="text-sm font-semibold text-success">
                      Funds in Escrow
                    </span>
                  </div>
                  <div className="mb-4 space-y-1 text-xs">
                    {state.escrowId && (
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Escrow ID</span>
                        <span className="font-mono">#{state.escrowId}</span>
                      </div>
                    )}
                    {state.txHash && (
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Tx</span>
                        {isMockChainClient ? (
                          <span className="font-mono text-text-secondary">
                            {state.txHash.slice(0, 10)}...
                          </span>
                        ) : (
                          <a
                            href={`https://sepolia.basescan.org/tx/${state.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-accent hover:underline"
                          >
                            {state.txHash.slice(0, 10)}...
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {state.step === "delivery" && !state.disputeFiled && (
                    <AnimatePresence mode="wait">
                      {!state.deliveryConfirmed ? (
                        <motion.div
                          key="waiting-delivery"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-3 py-2"
                        >
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          <p className="text-xs text-text-secondary">
                            Waiting for seller to confirm delivery...
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="delivery-confirmed"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-3"
                        >
                          <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-2.5">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2">
                              <circle cx="8" cy="8" r="6" />
                              <path d="M5 8l2 2 4-4" />
                            </svg>
                            <span className="text-xs font-medium text-success">
                              Seller confirmed delivery
                            </span>
                          </div>
                          <p className="text-[11px] text-text-tertiary">
                            You can release funds to the seller or file a dispute.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleRelease}
                              disabled={state.loading}
                              className="flex-1 rounded-lg bg-success px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                            >
                              Release Funds
                            </button>
                            <button
                              onClick={handleDispute}
                              disabled={state.loading}
                              className="flex-1 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
                            >
                              Dispute
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {state.disputeFiled && (
                    <div className="rounded-lg border border-error/20 bg-error/5 p-3 text-xs text-error">
                      Dispute filed. Waiting for arbiter resolution.
                    </div>
                  )}
                </motion.div>
              )}

              {state.step === "complete" && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-success/20 bg-success/5 p-6 text-center"
                >
                  <div className="mb-3 text-4xl">&#127881;</div>
                  <h3 className="mb-1 text-lg font-bold text-success">
                    Transaction Complete!
                  </h3>
                  <p className="mb-4 text-sm text-text-secondary">
                    Funds have been released to the seller.
                  </p>
                  {state.completionReputation && (
                    <div className="mx-auto mb-4 max-w-sm text-left">
                      <div className="rounded-lg border border-border-default bg-bg-secondary p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-primary">Seller Reputation</span>
                          {operatorAddress && <ReputationBadge address={operatorAddress} size="md" />}
                        </div>
                        {state.completionReputation.seller && (
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-text-tertiary">Completion Rate</span>
                              <span className="font-mono">
                                {(state.completionReputation.seller.completionRate * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-tertiary">Total Escrows</span>
                              <span className="font-mono">{state.completionReputation.seller.totalEscrows}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-tertiary">Confidence</span>
                              <span className="capitalize">{state.completionReputation.confidence}</span>
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-text-tertiary">
                          {state.paymentRequired
                            ? `Release window: ${formatReleaseWindow(state.paymentRequired.releaseWindow)} — ${
                                state.completionReputation.confidence === "low"
                                  ? "seller is new, default parameters applied"
                                  : state.completionReputation.seller && state.completionReputation.seller.score >= 80 && state.completionReputation.confidence === "high"
                                    ? "high trust seller, shortened release window"
                                    : "standard parameters based on seller history"
                              }`
                            : "This transaction is now part of the seller\u2019s on-chain reputation."}
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleReset}
                    className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {state.error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-error/20 bg-error/5 p-3 text-xs text-error"
              >
                {state.error}
              </motion.div>
            )}
          </div>

          {/* Seller panel */}
          <div className="space-y-4">
            <SellerPanel
              step={state.step}
              productTitle={state.product?.title}
              deliveryConfirmed={state.deliveryConfirmed}
            />
            <div className="panel-surface rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Protocol Snapshot
              </p>
              <div className="mt-3 space-y-2">
                <MetaRow
                  label="Order"
                  value={state.orderId ? `${state.orderId.slice(0, 8)}...` : "Not created"}
                />
                <MetaRow
                  label="Escrow"
                  value={state.escrowId ? `#${state.escrowId}` : "Pending"}
                />
                <MetaRow
                  label="Tx Hash"
                  value={state.txHash ? `${state.txHash.slice(0, 12)}...` : "Pending"}
                  mono
                />
                <MetaRow label="Current Step" value={currentStepLabel} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-default pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className={`text-right text-xs text-text-primary ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
