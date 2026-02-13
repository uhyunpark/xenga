"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useInspector } from "@/lib/protocol-inspector/context";
import { useOperatorAddress } from "@/lib/hooks/useOperatorAddress";
import {
  requestPayment,
  signPayment,
  submitPayment,
} from "@/lib/api/payment-flow";

interface TerminalLine {
  id: string;
  type: "info" | "request" | "response" | "success" | "error" | "dim";
  text: string;
  delay: number;
}

const baseSteps: Omit<TerminalLine, "id">[] = [
  { type: "dim", text: "$ x402-agent discover --service weather-api", delay: 500 },
  { type: "info", text: "[discover] Found service: Weather API Premium", delay: 1000 },
  { type: "info", text: "[discover] Price: 2.50 USDC | Type: agent-service | Auto-release: 1 hour", delay: 500 },
  { type: "dim", text: "", delay: 300 },
  { type: "dim", text: "$ x402-agent order --create", delay: 500 },
  { type: "request", text: "POST /api/orders → 201 Created", delay: 1000 },
  { type: "info", text: "[order] Created order: {orderId}", delay: 500 },
  { type: "dim", text: "", delay: 300 },
  { type: "dim", text: "$ x402-agent pay --order {orderId}", delay: 500 },
  { type: "request", text: "POST /api/orders/{orderId}/pay → 402 Payment Required", delay: 2000 },
  { type: "info", text: "[pay] Received escrow payment requirements", delay: 500 },
  { type: "info", text: "[pay] scheme=escrow, amount=2500000, asset=USDC", delay: 300 },
  { type: "dim", text: "", delay: 300 },
  { type: "info", text: "[sign] Signing EIP-712 ReceiveWithAuthorization...", delay: 1500 },
  { type: "success", text: "[sign] Signature: v=27, r=0xab...cd, s=0xef...12", delay: 500 },
  { type: "dim", text: "", delay: 300 },
  { type: "request", text: "POST /api/orders/{orderId}/pay [X-PAYMENT] → 200 OK", delay: 1000 },
  { type: "success", text: "[settle] Escrow created on-chain!", delay: 500 },
  { type: "success", text: "[settle] Tx: {txHash}", delay: 500 },
  { type: "success", text: "[settle] Escrow ID: {escrowId}", delay: 300 },
  { type: "dim", text: "", delay: 300 },
  { type: "info", text: "[verify] Waiting for seller to confirm delivery...", delay: 2000 },
  { type: "info", text: "[verify] Seller is shipping item...", delay: 2000 },
  { type: "info", text: "[verify] Delivery confirmation submitted on-chain", delay: 1500 },
  { type: "success", text: "[verify] ✓ Delivery confirmed by operator", delay: 1500 },
  { type: "dim", text: "", delay: 300 },
  { type: "info", text: "[release] Auto-release window: 1 hour", delay: 1000 },
  { type: "success", text: "[complete] Transaction complete. Funds available for seller.", delay: 1000 },
];

interface AgentTerminalProps {
  speed: number;
}

export function AgentTerminal({ speed }: AgentTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [escrowId, setEscrowId] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const { walletClient, address, connectDemo, fundDemoWallet, usdcBalance, type: walletType } = useWallet();
  const inspector = useInspector();
  const operatorAddress = useOperatorAddress();

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  const addLine = useCallback(
    (line: Omit<TerminalLine, "id">) => {
      setLines((prev) => [
        ...prev,
        { ...line, id: crypto.randomUUID() },
      ]);
      setTimeout(scrollToBottom, 50);
    },
    [scrollToBottom]
  );

  const runDemo = useCallback(async () => {
    if (!walletClient || !address || !operatorAddress) return;
    setIsRunning(true);
    setLines([]);
    setCurrentStep(0);
    setIsComplete(false);
    inspector.clear();
    inspector.setOpen(true);

    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms / speed));

    try {
      // Step 1: Discover
      addLine({ type: "dim", text: "$ x402-agent discover --service weather-api", delay: 0 });
      await wait(1000);
      addLine({ type: "info", text: "[discover] Found service: Weather API Premium", delay: 0 });
      await wait(500);
      addLine({ type: "info", text: "[discover] Price: 2.50 USDC | Type: agent-service | Auto-release: 1 hour", delay: 0 });
      await wait(800);

      // Step 2: Create order
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "dim", text: "$ x402-agent order --create", delay: 0 });
      await wait(500);

      inspector.addEvent({
        type: "http_request",
        label: "Create Order",
        data: { method: "POST", url: "/api/orders" },
      });

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Weather API Premium Access",
          description: "1-hour premium API access",
          price: 2.5,
          serviceType: "agent-service",
          sellerAddress: operatorAddress,
        }),
      });
      const orderData = await orderRes.json();
      setOrderId(orderData.id);

      inspector.addEvent({
        type: "http_response",
        label: "201 Created",
        data: { status: 201, body: orderData },
      });

      addLine({ type: "request", text: `POST /api/orders → 201 Created`, delay: 0 });
      await wait(500);
      addLine({ type: "info", text: `[order] Created order: ${orderData.id.slice(0, 8)}...`, delay: 0 });
      await wait(800);

      // Step 3: Payment - 402
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "dim", text: `$ x402-agent pay --order ${orderData.id.slice(0, 8)}...`, delay: 0 });
      await wait(500);

      const { paymentRequired } = await requestPayment(
        orderData.id,
        inspector.addEvent
      );

      addLine({ type: "request", text: `POST /api/orders/${orderData.id.slice(0, 8)}.../pay → 402 Payment Required`, delay: 0 });
      await wait(500);
      addLine({ type: "info", text: "[pay] Received escrow payment requirements", delay: 0 });
      addLine({ type: "info", text: `[pay] scheme=escrow, amount=${paymentRequired.amount}, asset=USDC`, delay: 0 });
      await wait(1500);

      // Step 4: Sign
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "info", text: "[sign] Signing EIP-712 ReceiveWithAuthorization...", delay: 0 });
      await wait(1500);

      const payload = await signPayment(
        walletClient,
        paymentRequired,
        inspector.addEvent
      );

      addLine({ type: "success", text: `[sign] Signature: v=${payload.signature.v}, r=${payload.signature.r.slice(0, 8)}..., s=${payload.signature.s.slice(0, 8)}...`, delay: 0 });
      await wait(1200);

      // Step 5: Submit
      addLine({ type: "dim", text: "", delay: 0 });
      const result = await submitPayment(
        orderData.id,
        payload,
        inspector.addEvent
      );

      setEscrowId(result.payment.escrowId);
      setTxHash(result.payment.txHash);

      addLine({ type: "request", text: `POST /api/orders/${orderData.id.slice(0, 8)}.../pay [X-PAYMENT] → 200 OK`, delay: 0 });
      await wait(800);
      addLine({ type: "success", text: "[settle] Escrow created on-chain!", delay: 0 });
      await wait(400);
      addLine({ type: "success", text: `[settle] Tx: ${result.payment.txHash.slice(0, 14)}...`, delay: 0 });
      await wait(400);
      addLine({ type: "success", text: `[settle] Escrow ID: ${result.payment.escrowId}`, delay: 0 });
      await wait(1500);

      // Step 6: Auto-verify
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "info", text: "[verify] Waiting for seller to confirm delivery...", delay: 0 });

      // Trigger confirm delivery
      try {
        const cdRes = await fetch(`/api/orders/${orderData.id}/confirm-delivery`, { method: "POST" });
        if (!cdRes.ok) console.warn("[agent] confirm-delivery responded", cdRes.status);
      } catch (err) {
        console.warn("[agent] confirm-delivery failed:", err);
      }
      await wait(2000);
      addLine({ type: "info", text: "[verify] Seller is shipping item...", delay: 0 });
      await wait(2000);
      addLine({ type: "info", text: "[verify] Delivery confirmation submitted on-chain", delay: 0 });
      await wait(1500);

      addLine({ type: "success", text: "[verify] ✓ Delivery confirmed by operator", delay: 0 });
      inspector.addEvent({
        type: "state_change",
        label: "Delivery Confirmed",
        data: { previousState: "Active", newState: "DeliveryConfirmed" },
      });
      await wait(1500);

      // Step 7: Complete
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "info", text: "[release] Auto-release window: 1 hour", delay: 0 });
      await wait(500);
      addLine({ type: "success", text: "[complete] Transaction complete. Funds available for seller.", delay: 0 });

      inspector.addEvent({
        type: "state_change",
        label: "Complete",
        data: { previousState: "DeliveryConfirmed", newState: "Completed" },
      });

      setIsComplete(true);
    } catch (err: any) {
      addLine({ type: "error", text: `[error] ${err.message}`, delay: 0 });
    } finally {
      setIsRunning(false);
    }
  }, [walletClient, address, operatorAddress, speed, inspector, addLine]);

  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 1;

  return (
    <div className="space-y-4">
      {needsWallet ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary p-6 text-center">
          <p className="mb-3 text-sm text-text-secondary">
            Connect a wallet to run the agent demo
          </p>
          <button
            onClick={connectDemo}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Create Demo Wallet
          </button>
        </div>
      ) : needsFunding ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary p-6 text-center">
          <p className="mb-3 text-sm text-text-secondary">
            Fund your wallet to run the demo
          </p>
          <button
            onClick={fundDemoWallet}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Fund Wallet
          </button>
        </div>
      ) : (
        <>
          {!isRunning && !isComplete && (
            <button
              onClick={runDemo}
              disabled={!operatorAddress}
              className="glow-purple rounded-lg bg-accent-purple px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-purple/90 disabled:opacity-50"
            >
              {operatorAddress ? "Run Agent Demo" : "Loading..."}
            </button>
          )}
          {isComplete && (
            <button
              onClick={runDemo}
              className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              Replay
            </button>
          )}
        </>
      )}

      {/* Terminal */}
      <div className="overflow-hidden rounded-xl border border-border-default bg-[#0C0C0E]">
        <div className="flex items-center gap-1.5 border-b border-border-default px-4 py-2">
          <div className="h-3 w-3 rounded-full bg-error/60" />
          <div className="h-3 w-3 rounded-full bg-warning/60" />
          <div className="h-3 w-3 rounded-full bg-success/60" />
          <span className="ml-2 font-mono text-xs text-text-tertiary">
            x402-agent
          </span>
        </div>
        <div
          ref={terminalRef}
          className="max-h-[500px] overflow-y-auto p-4 font-mono text-[13px] leading-relaxed"
        >
          {lines.length === 0 && !isRunning && (
            <div className="text-text-tertiary">
              Click &quot;Run Agent Demo&quot; to start...
            </div>
          )}
          <AnimatePresence>
            {lines.map((line) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={
                  line.type === "success"
                    ? "text-success"
                    : line.type === "error"
                      ? "text-error"
                      : line.type === "request"
                        ? "text-accent"
                        : line.type === "dim"
                          ? "text-text-tertiary"
                          : "text-text-secondary"
                }
              >
                {line.text || "\u00A0"}
              </motion.div>
            ))}
          </AnimatePresence>
          {isRunning && (
            <span className="inline-block h-4 w-[2px] animate-pulse bg-text-primary" />
          )}
        </div>
      </div>

      {txHash && (
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>View on BaseScan:</span>
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent hover:underline"
          >
            {txHash.slice(0, 14)}...
          </a>
        </div>
      )}
    </div>
  );
}
