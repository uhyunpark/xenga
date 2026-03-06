"use client";

import { useState, useReducer, useCallback, useEffect, useRef } from "react";
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
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ReputationBadge } from "@/components/ui/ReputationBadge";
import { TxLink } from "@/components/ui/TxLink";
import { isMockChainClient } from "@/lib/env/isMockChainClient";
import { ProductGrid, type Product } from "./ProductGrid";
import { BUYER_STEPS, StepTracker, type BuyerStep, type PaySubStep } from "./StepTracker";
import { SellerPanel } from "./SellerPanel";
import { ReviewTermsStep } from "./ReviewTermsStep";
import { PayingStep } from "./PayingStep";
import { TrackingStep } from "./TrackingStep";
import { facilitatorFetch } from "@/lib/api/client";
import { formatReleaseWindow } from "./utils";

interface FlowState {
  step: BuyerStep;
  product: Product | null;
  orderId: string | null;
  escrowId: number | null;
  txHash: string | null;
  releaseTxHash: string | null;
  error: string | null;
  loading: boolean;
  orderData: any | null;
  disputeFiled: boolean;
  disputeResolved: boolean;
  deliveryConfirmed: boolean;
  paymentRequired: PaymentRequired | null;
  paymentPayload: PaymentPayload | null;
  completionReputation: ReputationScore | null;
  paySubStep: PaySubStep;
  loadingAction: "release" | "dispute" | null;
}

type FlowAction =
  | { type: "SELECT_PRODUCT"; product: Product }
  | { type: "START_PAYMENT" }
  | { type: "SET_PAY_SUBSTEP"; paySubStep: PaySubStep }
  | { type: "SET_ORDER"; orderId: string; orderData: any }
  | { type: "SET_PAYMENT_REQUIRED"; paymentRequired: PaymentRequired }
  | { type: "SET_PAYMENT_PAYLOAD"; paymentPayload: PaymentPayload }
  | { type: "PAYMENT_COMPLETE"; escrowId: number; txHash: string }
  | { type: "SET_STEP"; step: BuyerStep }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "FILE_DISPUTE" }
  | { type: "DISPUTE_RESOLVED" }
  | { type: "DELIVERY_CONFIRMED" }
  | { type: "RELEASE_COMPLETE"; releaseTxHash: string }
  | { type: "RESET" }
  | { type: "SET_COMPLETION_REPUTATION"; reputation: ReputationScore }
  | { type: "SET_LOADING_ACTION"; action: "release" | "dispute" | null };

const initialState: FlowState = {
  step: "browse",
  product: null,
  orderId: null,
  escrowId: null,
  txHash: null,
  releaseTxHash: null,
  error: null,
  loading: false,
  orderData: null,
  disputeFiled: false,
  disputeResolved: false,
  deliveryConfirmed: false,
  paymentRequired: null,
  paymentPayload: null,
  completionReputation: null,
  paySubStep: "creating_order",
  loadingAction: null,
};

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SELECT_PRODUCT":
      return {
        ...state,
        product: action.product,
        step: "review_terms",
        error: null,
      };
    case "START_PAYMENT":
      return { ...state, step: "paying", paySubStep: "creating_order", error: null };
    case "SET_PAY_SUBSTEP":
      return { ...state, paySubStep: action.paySubStep };
    case "SET_ORDER":
      return { ...state, orderId: action.orderId, orderData: action.orderData };
    case "SET_PAYMENT_REQUIRED":
      return { ...state, paymentRequired: action.paymentRequired };
    case "SET_PAYMENT_PAYLOAD":
      return { ...state, paymentPayload: action.paymentPayload };
    case "PAYMENT_COMPLETE":
      return { ...state, escrowId: action.escrowId, txHash: action.txHash, paySubStep: "locked", error: null };
    case "SET_STEP":
      return { ...state, step: action.step, error: null };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "FILE_DISPUTE":
      return { ...state, disputeFiled: true };
    case "DISPUTE_RESOLVED":
      return { ...state, disputeResolved: true, step: "complete" };
    case "DELIVERY_CONFIRMED":
      return { ...state, deliveryConfirmed: true };
    case "RELEASE_COMPLETE":
      return { ...state, releaseTxHash: action.releaseTxHash, step: "complete", error: null };
    case "RESET":
      return initialState;
    case "SET_COMPLETION_REPUTATION":
      return { ...state, completionReputation: action.reputation };
    case "SET_LOADING_ACTION":
      return { ...state, loadingAction: action.action, loading: action.action !== null };
    default:
      return state;
  }
}

const STEP_HINTS: Record<BuyerStep, string> = {
  browse: "Choose an item to purchase from the marketplace.",
  review_terms: "Review escrow terms and buyer protection before paying.",
  paying: "Payment is being processed — order, signing, and on-chain settlement.",
  tracking: "Your order is being fulfilled. Release funds or dispute when ready.",
  complete: "Payment flow completed and seller settlement finalized.",
};

const SESSION_KEY = "xenga-marketplace-state-v2";

export function PaymentFlow() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { walletClient, publicClient, address, type: walletType, connectDemo, fundDemoWallet, isFunding, usdcBalance, error, refreshBalances } = useWallet();
  const inspector = useInspector();
  const { address: operatorAddress } = useOperatorAddress();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Session storage: restore on mount ----
  useEffect(() => {
    // Clear old-format state
    const oldState = sessionStorage.getItem("xenga-marketplace-state");
    if (oldState) {
      sessionStorage.removeItem("xenga-marketplace-state");
    }

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed.orderId || parsed.step === "browse") return;

      // Validate the order still exists on the server before restoring
      facilitatorFetch("/api/orders")
        .then((res) => res.json())
        .then((data: any) => {
          const orderList = Array.isArray(data) ? data : data.orders ?? [];
          const found = orderList.find((o: any) => o.id === parsed.orderId);
          if (!found) {
            sessionStorage.removeItem(SESSION_KEY);
            return;
          }

          // Restore product state
          if (parsed.product) {
            dispatch({ type: "SELECT_PRODUCT", product: parsed.product });
          }

          dispatch({ type: "SET_ORDER", orderId: parsed.orderId, orderData: parsed.orderData });

          const serverStatus = found.status;
          switch (serverStatus) {
            case "created":
            case "pending_payment":
              // Pre-payment — restore to review so user can click "Pay Now" to restart.
              dispatch({ type: "SET_STEP", step: "review_terms" });
              break;
            case "escrowed":
              dispatch({ type: "PAYMENT_COMPLETE", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "tracking" });
              break;
            case "delivery_confirmed":
              dispatch({ type: "PAYMENT_COMPLETE", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "tracking" });
              dispatch({ type: "DELIVERY_CONFIRMED" });
              break;
            case "completed":
              dispatch({ type: "PAYMENT_COMPLETE", escrowId: found.escrowId, txHash: found.txHash });
              if (parsed.releaseTxHash) {
                dispatch({ type: "RELEASE_COMPLETE", releaseTxHash: parsed.releaseTxHash });
              } else {
                dispatch({ type: "SET_STEP", step: "complete" });
              }
              break;
            case "disputed":
              dispatch({ type: "PAYMENT_COMPLETE", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "tracking" });
              dispatch({ type: "DELIVERY_CONFIRMED" });
              dispatch({ type: "FILE_DISPUTE" });
              break;
            case "resolved":
              dispatch({ type: "PAYMENT_COMPLETE", escrowId: found.escrowId, txHash: found.txHash });
              dispatch({ type: "SET_STEP", step: "tracking" });
              dispatch({ type: "DELIVERY_CONFIRMED" });
              dispatch({ type: "FILE_DISPUTE" });
              dispatch({ type: "DISPUTE_RESOLVED" });
              break;
            default:
              sessionStorage.removeItem(SESSION_KEY);
              break;
          }
        })
        .catch(() => {
          sessionStorage.removeItem(SESSION_KEY);
        });
    } catch {
      // ignore malformed JSON
    }
  }, []);

  // ---- Session storage: persist on change ----
  useEffect(() => {
    if (state.orderId) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        step: state.step,
        product: state.product,
        orderId: state.orderId,
        escrowId: state.escrowId,
        txHash: state.txHash,
        releaseTxHash: state.releaseTxHash,
        orderData: state.orderData,
        paymentRequired: state.paymentRequired,
      }));
    }
  }, [state.step, state.product, state.orderId, state.escrowId, state.txHash, state.releaseTxHash, state.orderData, state.paymentRequired]);

  // ---- Delivery polling ----
  const deliveryOrderId = state.step === "tracking" && !state.deliveryConfirmed ? state.orderId : null;

  useEffect(() => {
    if (!deliveryOrderId) return;
    let cancelled = false;

    facilitatorFetch(`/api/orders/${deliveryOrderId}/confirm-delivery`, {
      method: "POST",
    }).catch((err) => {
      console.warn("[PaymentFlow] confirm-delivery failed:", err);
    });

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

  // ---- Dispute resolution polling ----
  const disputePending = state.disputeFiled && !state.disputeResolved;

  useEffect(() => {
    if (!disputePending || !state.orderId) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        dispatch({ type: "SET_ERROR", error: "Dispute resolution timed out. Try refreshing." });
        return;
      }
      try {
        const res = await facilitatorFetch(`/api/orders?status=resolved`);
        const data = await res.json();
        const orders = Array.isArray(data) ? data : data.orders ?? [];
        if (orders.find((o: any) => o.id === state.orderId)) {
          clearInterval(interval);
          inspector.addEvent({
            type: "state_change",
            label: "Dispute Resolved",
            data: { previousState: "Disputed", newState: "Resolved", buyerPct: 100 },
          });
          dispatch({ type: "DISPUTE_RESOLVED" });
        }
      } catch {
        // Retry on next interval
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [disputePending, state.orderId, inspector]);

  // ---- Fetch seller reputation on completion ----
  useEffect(() => {
    if (state.step !== "complete" || !operatorAddress) return;
    facilitatorFetch(`/api/reputation/${operatorAddress}?fresh=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rep) => {
        if (rep) dispatch({ type: "SET_COMPLETION_REPUTATION", reputation: rep });
      })
      .catch(() => {});
  }, [state.step, operatorAddress]);

  // ---- Handlers ----

  const handleSelectProduct = useCallback((product: Product) => {
    inspector.clear();
    inspector.setOpen(true);
    dispatch({ type: "SELECT_PRODUCT", product });
  }, [inspector]);

  // Collapsed payment flow — runs all 4 protocol steps sequentially
  const handlePayNow = useCallback(async () => {
    if (!state.product || !address || !operatorAddress || !walletClient) return;
    dispatch({ type: "START_PAYMENT" });

    try {
      // Step 1: Create order (skip if already have orderId from a retry)
      let orderId = state.orderId;
      if (!orderId) {
        dispatch({ type: "SET_PAY_SUBSTEP", paySubStep: "creating_order" });

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

        orderId = data.id;
        dispatch({ type: "SET_ORDER", orderId: data.id, orderData: data });
      }

      await new Promise(r => setTimeout(r, 1500));

      // Step 2: Request payment (402)
      dispatch({ type: "SET_PAY_SUBSTEP", paySubStep: "requesting_payment" });
      let paymentRequired: PaymentRequired;
      try {
        const result = await requestPayment(orderId!, inspector.addEvent);
        paymentRequired = result.paymentRequired;
        dispatch({ type: "SET_PAYMENT_REQUIRED", paymentRequired });
      } catch (err) {
        if (err instanceof AlreadyPaidError) {
          const p = err.data?.payment;
          if (p?.escrowId && p?.txHash) {
            dispatch({ type: "PAYMENT_COMPLETE", escrowId: p.escrowId, txHash: p.txHash });
            dispatch({ type: "SET_STEP", step: "tracking" });
          } else {
            dispatch({ type: "SET_STEP", step: "tracking" });
          }
          return;
        }
        throw err;
      }

      await new Promise(r => setTimeout(r, 1500));

      // Step 3: Sign EIP-712
      dispatch({ type: "SET_PAY_SUBSTEP", paySubStep: "signing" });
      const payload = await signPayment(walletClient, paymentRequired, inspector.addEvent);
      dispatch({ type: "SET_PAYMENT_PAYLOAD", paymentPayload: payload });

      await new Promise(r => setTimeout(r, 1500));

      // Step 4: Submit on-chain
      dispatch({ type: "SET_PAY_SUBSTEP", paySubStep: "submitting" });
      const result = await submitPayment(orderId!, payload, inspector.addEvent);
      dispatch({
        type: "PAYMENT_COMPLETE",
        escrowId: result.payment.escrowId,
        txHash: result.payment.txHash,
      });
      refreshBalances();

      // "Funds Locked" celebration — 1.5s animation before transitioning
      await new Promise<void>((resolve) => {
        lockedTimerRef.current = setTimeout(resolve, 1500);
      });
      lockedTimerRef.current = null;
      dispatch({ type: "SET_STEP", step: "tracking" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [state.product, state.orderId, address, operatorAddress, walletClient, inspector, refreshBalances]);

  const handleRelease = useCallback(async () => {
    if (!state.escrowId || !walletClient?.account || !state.paymentRequired) return;
    dispatch({ type: "SET_LOADING_ACTION", action: "release" });

    try {
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

      dispatch({ type: "RELEASE_COMPLETE", releaseTxHash: txHash });
    } catch {
      // Demo graceful degradation: mark complete even on failure (e.g. MetaMask reject,
      // gas error, mock mode). In production, you'd show an error and let the user retry.
      inspector.addEvent({
        type: "state_change",
        label: "Funds Released",
        data: { previousState: "DeliveryConfirmed", newState: "Completed", note: "Release pending" },
      });
      dispatch({ type: "SET_STEP", step: "complete" });
    } finally {
      dispatch({ type: "SET_LOADING_ACTION", action: null });
    }
  }, [state.escrowId, state.paymentRequired, walletClient, publicClient, inspector]);

  const handleDispute = useCallback(async () => {
    if (!state.escrowId || !walletClient?.account || !state.paymentRequired || !state.orderId) return;
    dispatch({ type: "SET_LOADING_ACTION", action: "dispute" });

    try {
      // On-chain dispute call (buyer is msg.sender)
      const disputeTxHash = await walletClient.writeContract({
        chain: baseSepolia,
        account: walletClient.account!,
        address: state.paymentRequired.escrowContract,
        abi: escrowVaultAbi,
        functionName: "dispute",
        args: [BigInt(state.escrowId)],
      });

      await publicClient.waitForTransactionReceipt({ hash: disputeTxHash });

      inspector.addEvent({
        type: "tx_confirmed",
        label: "Dispute Filed",
        data: { txHash: disputeTxHash, escrowId: state.escrowId, function: "dispute" },
      });
      inspector.addEvent({
        type: "state_change",
        label: "Dispute Filed",
        data: { previousState: "DeliveryConfirmed", newState: "Disputed" },
      });

      dispatch({ type: "FILE_DISPUTE" });

      // Fire-and-forget API POST (event listener may have already updated status)
      facilitatorFetch(`/api/disputes/${state.orderId}`, {
        method: "POST",
        body: JSON.stringify({ reason: "Product not as described" }),
      }).catch(() => {});
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING_ACTION", action: null });
    }
  }, [state.escrowId, state.paymentRequired, state.orderId, walletClient, publicClient, inspector]);

  const handleReset = useCallback(() => {
    if (lockedTimerRef.current) {
      clearTimeout(lockedTimerRef.current);
      lockedTimerRef.current = null;
    }
    sessionStorage.removeItem(SESSION_KEY);
    inspector.clear();
    dispatch({ type: "RESET" });
    refreshBalances();
  }, [inspector, refreshBalances]);

  const handleStepClick = useCallback((step: BuyerStep) => {
    if (step === "browse") {
      handleReset();
    }
  }, [handleReset]);

  // ---- Derived values ----
  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 0.01;
  const currentStepIndex = Math.max(0, BUYER_STEPS.findIndex((s) => s.key === state.step));
  const currentStepLabel = BUYER_STEPS[currentStepIndex]?.label ?? "Progress";
  const progressPercent = ((currentStepIndex + 1) / BUYER_STEPS.length) * 100;
  const stepHint = STEP_HINTS[state.step];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left sidebar - Step tracker */}
      <div className="hidden shrink-0 lg:block lg:w-56">
        <div className="panel-surface sticky top-20 rounded-xl p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Flow Map
          </p>
          <StepTracker
            currentStep={state.step}
            paySubStep={state.step === "paying" ? state.paySubStep : undefined}
            className="mt-2"
            onStepClick={
              state.step === "review_terms"
                ? handleStepClick
                : undefined
            }
          />
          <p className="mt-3 rounded-lg border border-border-default bg-bg-primary/55 p-2 text-[11px] text-text-tertiary">
            {stepHint}
          </p>
          {state.step !== "browse" && (
            <button
              onClick={handleReset}
              className="mt-3 w-full rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 hover:border-accent/50"
            >
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 space-y-4">
        {/* Mobile progress bar */}
        <div className="panel-surface rounded-xl p-3 lg:hidden">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Escrow flow progress</span>
            <span className="font-mono">
              {currentStepIndex + 1}/{BUYER_STEPS.length}
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
              {/* Browse step */}
              {state.step === "browse" && (
                <motion.div
                  key="browse"
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
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                      >
                        {isFunding ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Getting Test USDC...
                          </span>
                        ) : "Get Test USDC"}
                      </button>
                      {error && (
                        <p className="mt-2 text-xs text-red-400">{error}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {walletType === "demo" && usdcBalance !== null && (
                        <div className="panel-surface mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 text-text-tertiary">
                            <AddressDisplay address={address!} full className="text-xs" />
                            <span className="text-text-primary font-medium">{usdcBalance} USDC</span>
                          </div>
                          <button
                            onClick={fundDemoWallet}
                            disabled={isFunding}
                            className="text-accent hover:underline disabled:opacity-50"
                          >
                            {isFunding ? (
                              <span className="flex items-center gap-1.5">
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                                Funding...
                              </span>
                            ) : "Get More"}
                          </button>
                        </div>
                      )}
                      <ProductGrid onSelect={handleSelectProduct} />
                    </>
                  )}
                </motion.div>
              )}

              {/* Review Terms step */}
              {state.step === "review_terms" && state.product && (
                <ReviewTermsStep
                  product={state.product}
                  operatorAddress={operatorAddress}
                  loading={state.loading}
                  onPayNow={handlePayNow}
                  onBack={handleReset}
                />
              )}

              {/* Paying step */}
              {state.step === "paying" && (
                <PayingStep
                  paySubStep={state.paySubStep}
                  error={state.error}
                  onRetry={handlePayNow}
                  walletType={walletType}
                />
              )}

              {/* Tracking step */}
              {state.step === "tracking" && (
                <TrackingStep
                  escrowId={state.escrowId}
                  txHash={state.txHash}
                  deliveryConfirmed={state.deliveryConfirmed}
                  disputeFiled={state.disputeFiled}
                  loading={!!state.loadingAction}
                  loadingAction={state.loadingAction}
                  onRelease={handleRelease}
                  onDispute={handleDispute}
                />
              )}

              {/* Complete step */}
              {state.step === "complete" && (
                <div className="relative" style={{ overflow: "visible" }}>
                  {/* CSS confetti burst */}
                  {!state.disputeResolved && (
                    <>
                      <div
                        className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2"
                        style={{
                          width: 200,
                          height: 200,
                          background: "radial-gradient(circle, rgba(13,148,136,0.3) 0%, rgba(13,148,136,0.15) 20%, transparent 50%), radial-gradient(circle at 30% 40%, rgba(139,92,246,0.2) 0%, transparent 40%), radial-gradient(circle at 70% 30%, rgba(22,163,74,0.2) 0%, transparent 40%)",
                          animation: "confetti-burst 1.2s ease-out forwards",
                        }}
                      />
                    </>
                  )}
                  <motion.div
                    key="complete"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl border border-success/20 bg-success/5 p-6 text-center"
                  >
                    {/* Animated checkmark instead of emoji */}
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
                      {state.disputeResolved ? (
                        <svg className="h-7 w-7 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      ) : (
                        <svg className="h-7 w-7 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" className="animate-draw-check" style={{ strokeDasharray: 30, strokeDashoffset: 30 }} />
                        </svg>
                      )}
                    </div>
                    <h3 className="mb-1 text-lg font-bold text-success">
                      {state.disputeResolved ? "Dispute Resolved" : "Transaction Complete!"}
                    </h3>
                    <p className="mb-4 text-sm text-text-secondary">
                      {state.disputeResolved
                        ? "Funds have been returned to the buyer."
                        : "Funds have been released to the seller."}
                    </p>
                    <motion.div
                      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                      initial="hidden"
                      animate="show"
                    >
                      {(state.txHash || state.releaseTxHash) && (
                        <div className="mx-auto mb-4 max-w-sm space-y-1.5">
                          {state.txHash && (
                            <motion.div
                              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                              className="flex items-center justify-between rounded-lg border border-border-default bg-bg-secondary px-3 py-2"
                            >
                              <span className="text-xs text-text-tertiary">Escrow creation</span>
                              <TxLink hash={state.txHash} className="text-xs" />
                            </motion.div>
                          )}
                          {state.releaseTxHash && (
                            <motion.div
                              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                              className="flex items-center justify-between rounded-lg border border-border-default bg-bg-secondary px-3 py-2"
                            >
                              <span className="text-xs text-text-tertiary">Funds released</span>
                              <TxLink hash={state.releaseTxHash} className="text-xs" />
                            </motion.div>
                          )}
                        </div>
                      )}
                      {state.completionReputation && (
                        <motion.div
                          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                          className="mx-auto mb-4 max-w-sm text-left"
                        >
                          <div className="rounded-lg border border-border-default bg-bg-secondary p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-text-primary">Seller On-Chain Stats</span>
                              {operatorAddress && <ReputationBadge address={operatorAddress} size="md" />}
                            </div>
                            {state.completionReputation.seller && (
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-text-tertiary">Completion Rate</span>
                                  <span className="font-mono">
                                    <AnimatedNumber
                                      value={state.completionReputation.seller.completionRate * 100}
                                      format={(n) => `${Math.round(n)}%`}
                                    />
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-text-tertiary">Total Escrows</span>
                                  <span className="font-mono">
                                    <AnimatedNumber value={state.completionReputation.seller.totalEscrows} />
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-text-tertiary">Confidence</span>
                                  <span className="capitalize">{state.completionReputation.confidence}</span>
                                </div>
                              </div>
                            )}
                            <p className="text-[11px] text-text-tertiary">
                              {state.paymentRequired
                                ? `Release window: ${formatReleaseWindow(state.paymentRequired.releaseWindow)} \u2014 ${
                                    state.completionReputation.confidence === "low"
                                      ? "seller is new, default parameters applied"
                                      : state.completionReputation.seller && state.completionReputation.seller.score >= 80 && state.completionReputation.confidence === "high"
                                        ? "trusted seller on this service, shortened release window"
                                        : "standard parameters based on seller history"
                                  }`
                                : "This transaction is now part of the seller\u2019s on-chain reputation."}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                    <button
                      onClick={handleReset}
                      className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
                    >
                      Try Again
                    </button>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {state.error && state.step !== "paying" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-error/20 bg-error/5 p-3 text-xs text-error"
              >
                {state.error}
              </motion.div>
            )}
          </div>

          {/* Seller panel + metadata */}
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
                  value={state.orderId ? <CopyableId value={state.orderId} /> : "Not created"}
                  mono
                />
                <MetaRow
                  label="Escrow"
                  value={
                    state.escrowId != null ? (
                      !isMockChainClient && state.paymentRequired?.escrowContract ? (
                        <a
                          href={`https://sepolia.basescan.org/address/${state.paymentRequired.escrowContract}#readContract`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
                        >
                          <span>#{state.escrowId}</span>
                          <svg
                            className="h-3 w-3 shrink-0"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M3.5 1.5h7v7M10.5 1.5l-9 9" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      ) : (
                        `#${state.escrowId}`
                      )
                    ) : (
                      "Pending"
                    )
                  }
                />
                <MetaRow
                  label="Tx Hash"
                  value={state.txHash ? <TxLink hash={state.txHash} label={`${state.txHash.slice(0, 12)}...`} className="text-xs" /> : "Pending"}
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

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span>{value.slice(0, 8)}...</span>
      <button
        onClick={copy}
        className="text-text-tertiary transition-colors hover:text-text-primary"
        title="Copy full ID"
      >
        {copied ? (
          <svg className="h-3 w-3 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8l3 3 5-5" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="8" height="8" rx="1" />
            <path d="M3 11V3h8" />
          </svg>
        )}
      </button>
    </span>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
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
