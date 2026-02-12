"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useInspector } from "@/lib/protocol-inspector/context";
import {
  requestPayment,
  signPayment,
  submitPayment,
  AlreadyPaidError,
} from "@/lib/api/payment-flow";
import { ProductGrid, type Product } from "./ProductGrid";
import { StepTracker, type DemoStep } from "./StepTracker";
import { SellerPanel } from "./SellerPanel";

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
}

type FlowAction =
  | { type: "SELECT_PRODUCT"; product: Product }
  | { type: "SET_ORDER"; orderId: string; orderData: any }
  | { type: "SET_STEP"; step: DemoStep }
  | { type: "SET_ESCROWED"; escrowId: number; txHash: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "FILE_DISPUTE" }
  | { type: "RESET" };

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
    case "RESET":
      return initialState;
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
};

export function PaymentFlow() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { walletClient, address, type: walletType, connectDemo, fundDemoWallet, usdcBalance } = useWallet();
  const inspector = useInspector();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session storage for refresh recovery
  useEffect(() => {
    const saved = sessionStorage.getItem("x402-marketplace-state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.orderId && parsed.step !== "select") {
          dispatch({ type: "SET_ORDER", orderId: parsed.orderId, orderData: parsed.orderData });
          if (parsed.step === "escrowed" || parsed.step === "delivery" || parsed.step === "complete") {
            dispatch({ type: "SET_ESCROWED", escrowId: parsed.escrowId, txHash: parsed.txHash });
            dispatch({ type: "SET_STEP", step: parsed.step });
          }
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (state.orderId) {
      sessionStorage.setItem("x402-marketplace-state", JSON.stringify({
        step: state.step,
        orderId: state.orderId,
        escrowId: state.escrowId,
        txHash: state.txHash,
        orderData: state.orderData,
      }));
    }
  }, [state.step, state.orderId, state.escrowId, state.txHash, state.orderData]);

  // When escrow is created, transition to delivery and start polling
  const escrowedOrderId = state.step === "escrowed" ? state.orderId : null;

  useEffect(() => {
    if (!escrowedOrderId) return;

    // Move to delivery step
    dispatch({ type: "SET_STEP", step: "delivery" });

    // Trigger server-side confirm-delivery (seller simulation)
    fetch(`/api/orders/${escrowedOrderId}/confirm-delivery`, {
      method: "POST",
    }).catch((err) => {
      console.warn("[PaymentFlow] confirm-delivery failed:", err);
    });

    // Poll until delivery is confirmed on-chain
    let delivered = false;
    const interval = setInterval(async () => {
      if (delivered) return;
      try {
        const res = await fetch(`/api/orders?status=delivery_confirmed`);
        const orders = await res.json();
        const found = orders.find((o: any) => o.id === escrowedOrderId);
        if (found) {
          delivered = true;
          clearInterval(interval);
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

    return () => clearInterval(interval);
  }, [escrowedOrderId, inspector]);

  const handleSelectProduct = useCallback((product: Product) => {
    inspector.clear();
    inspector.setOpen(true);
    dispatch({ type: "SELECT_PRODUCT", product });
  }, [inspector]);

  const handleCreateOrder = useCallback(async () => {
    if (!state.product || !address) return;
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
            sellerAddress: address, // Demo: operator is seller
          },
        },
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.product.title,
          description: state.product.description,
          price: state.product.price,
          serviceType: "marketplace",
          sellerAddress: address,
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
  }, [state.product, address, inspector]);

  const handlePayment = useCallback(async () => {
    if (!state.orderId || !walletClient) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      // Step 1: Request payment (get 402)
      dispatch({ type: "SET_STEP", step: "request_payment" });
      const { paymentRequired } = await requestPayment(
        state.orderId,
        inspector.addEvent
      );

      // Step 2: Sign EIP-712
      dispatch({ type: "SET_STEP", step: "sign" });
      const payload = await signPayment(
        walletClient,
        paymentRequired,
        inspector.addEvent
      );

      // Step 3: Submit payment
      dispatch({ type: "SET_STEP", step: "submit" });
      const result = await submitPayment(
        state.orderId,
        payload,
        inspector.addEvent
      );

      dispatch({
        type: "SET_ESCROWED",
        escrowId: result.payment.escrowId,
        txHash: result.payment.txHash,
      });
    } catch (err: any) {
      if (err instanceof AlreadyPaidError) {
        // Order was already paid, try to recover
        dispatch({ type: "SET_STEP", step: "escrowed" });
      } else {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.orderId, walletClient, inspector]);

  const handleRelease = useCallback(async () => {
    if (!state.escrowId) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      // For the demo, we check if escrow is releasable then show completion
      const res = await fetch(`/api/escrows/${state.escrowId}`);
      const escrow = await res.json();

      inspector.addEvent({
        type: "state_change",
        label: "Funds Released",
        data: { previousState: "DeliveryConfirmed", newState: "Completed" },
      });

      dispatch({ type: "SET_STEP", step: "complete" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [state.escrowId, inspector]);

  const handleDispute = useCallback(async () => {
    if (!state.orderId) return;
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const res = await fetch(`/api/disputes/${state.orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    sessionStorage.removeItem("x402-marketplace-state");
    inspector.clear();
    dispatch({ type: "RESET" });
  }, [inspector]);

  // Ensure wallet is connected
  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 1;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left sidebar - Step tracker */}
      <div className="hidden lg:block lg:w-48 shrink-0">
        <StepTracker currentStep={state.step} />
        {state.step !== "select" && (
          <button
            onClick={handleReset}
            className="mt-4 w-full rounded-md border border-border-default px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:text-text-primary hover:border-border-active"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 space-y-4">
        {/* Info banner */}
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs text-text-secondary">
          In production, buyer and seller are different people. Here, the server
          plays the seller so you can experience the full flow.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Buyer panel */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="7" cy="5" r="3" />
                  <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                </svg>
              </div>
              <span className="text-sm font-medium">Buyer</span>
              <span className="text-xs text-text-tertiary">(You)</span>
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
                    <div className="rounded-xl border border-border-default bg-bg-secondary p-6 text-center">
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
                    <div className="rounded-xl border border-border-default bg-bg-secondary p-6 text-center">
                      <p className="mb-3 text-sm text-text-secondary">
                        Your demo wallet needs USDC to continue
                      </p>
                      <button
                        onClick={fundDemoWallet}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                      >
                        Fund Wallet with Test USDC
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
                  className="rounded-xl border border-border-default bg-bg-secondary p-4"
                >
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
                    className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-50"
                  >
                    {state.loading ? "Creating Order..." : "Buy Now"}
                  </button>
                </motion.div>
              )}

              {(state.step === "request_payment" ||
                state.step === "sign" ||
                state.step === "submit") && (
                <motion.div
                  key="payment"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-border-default bg-bg-secondary p-4"
                >
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
                  {state.step === "request_payment" ? (
                    <button
                      onClick={handlePayment}
                      disabled={state.loading}
                      className="glow-blue w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-50"
                    >
                      {state.loading ? "Processing..." : "Sign & Pay"}
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-lg bg-bg-tertiary py-2.5 text-sm text-text-secondary">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      {state.step === "sign"
                        ? "Signing authorization..."
                        : "Submitting on-chain..."}
                    </div>
                  )}
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
                        <a
                          href={`https://sepolia.basescan.org/tx/${state.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-accent hover:underline"
                        >
                          {state.txHash.slice(0, 10)}...
                        </a>
                      </div>
                    )}
                  </div>

                  {state.step === "delivery" && !state.disputeFiled && (
                    <div className="space-y-2">
                      <p className="text-xs text-text-secondary">
                        Waiting for delivery confirmation...
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
                    </div>
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
          <div>
            <SellerPanel step={state.step} productTitle={state.product?.title} />
          </div>
        </div>
      </div>
    </div>
  );
}
