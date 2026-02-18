"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useInspector } from "@/lib/protocol-inspector/context";
import { useOperatorAddress } from "@/lib/hooks/useOperatorAddress";
import { isMockChainClient } from "@/lib/env/isMockChainClient";
import {
  requestPayment,
  signPayment,
  submitPayment,
} from "@/lib/api/payment-flow";
import { ReputationSummary } from "./ReputationSummary";
import type { ReputationScore } from "@shared/types";

interface TerminalLine {
  id: string;
  type: "info" | "request" | "response" | "success" | "error" | "dim" | "reputation";
  text: string;
  delay: number;
}

type Scenario = "happy" | "dispute";

interface AgentTerminalProps {
  speed: number;
}

export function AgentTerminal({ speed }: AgentTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [reputationData, setReputationData] = useState<{
    buyer: ReputationScore | null;
    seller: ReputationScore | null;
    scenario: Scenario;
  } | null>(null);
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

  const runDemo = useCallback(async (scenario: Scenario) => {
    if (!walletClient || !address || !operatorAddress) return;
    setIsRunning(true);
    setActiveScenario(scenario);
    setLines([]);
    setIsComplete(false);
    setReputationData(null);
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

      // Step 1.5: Check seller reputation
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "dim", text: `$ x402-agent reputation --check ${operatorAddress.slice(0, 10)}...`, delay: 0 });
      await wait(800);

      inspector.addEvent({
        type: "http_request",
        label: "Check Seller Reputation",
        data: { method: "GET", url: `/api/reputation/${operatorAddress}` },
      });

      let sellerRep: ReputationScore | null = null;
      try {
        const repRes = await fetch(`/api/reputation/${operatorAddress}`);
        if (repRes.ok) sellerRep = await repRes.json();
      } catch {}

      inspector.addEvent({
        type: "http_response",
        label: sellerRep?.seller ? `${sellerRep.overall}/100` : "No History",
        data: { status: 200, body: sellerRep },
      });

      if (sellerRep?.seller) {
        const s = sellerRep.seller;
        addLine({ type: "reputation", text: `[reputation] Seller score: ${s.score}/100 (${sellerRep.confidence} confidence)`, delay: 0 });
        await wait(400);
        addLine({ type: "reputation", text: `[reputation] Completion: ${(s.completionRate * 100).toFixed(0)}% | Disputes: ${(s.disputeRate * 100).toFixed(0)}% | Volume: ${(Number(s.totalVolume) / 1e6).toFixed(2)} USDC`, delay: 0 });
        await wait(400);
        const trust = sellerRep.confidence === "low"
          ? "NEW SELLER — default escrow parameters"
          : s.score >= 70 ? "HIGH TRUST — shortened release window eligible"
          : "ELEVATED RISK — extended release window applied";
        addLine({ type: "reputation", text: `[reputation] ${trust}`, delay: 0 });
      } else {
        addLine({ type: "reputation", text: `[reputation] Seller: no transaction history`, delay: 0 });
        await wait(400);
        addLine({ type: "reputation", text: `[reputation] New seller — using default 1-hour release window`, delay: 0 });
      }
      await wait(1200);

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
      setTxHash(result.payment.txHash);

      addLine({ type: "request", text: `POST /api/orders/${orderData.id.slice(0, 8)}.../pay [X-PAYMENT] → 200 OK`, delay: 0 });
      await wait(800);
      addLine({
        type: "success",
        text: isMockChainClient
          ? "[settle] Escrow created in simulation!"
          : "[settle] Escrow created on-chain!",
        delay: 0,
      });
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
      addLine({
        type: "info",
        text: isMockChainClient
          ? "[verify] Delivery confirmation submitted in simulation"
          : "[verify] Delivery confirmation submitted on-chain",
        delay: 0,
      });
      await wait(1500);

      addLine({ type: "success", text: "[verify] ✓ Delivery confirmed by operator", delay: 0 });
      inspector.addEvent({
        type: "state_change",
        label: "Delivery Confirmed",
        data: { previousState: "Active", newState: "DeliveryConfirmed" },
      });
      await wait(1500);

      // ── Branch: Happy Path vs Dispute Path ──

      if (scenario === "happy") {
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
      } else {
        // Step 7: Quality check failure
        addLine({ type: "dim", text: "", delay: 0 });
        addLine({ type: "dim", text: "$ x402-agent verify --check-quality", delay: 0 });
        await wait(1200);
        addLine({ type: "error", text: "[verify] QUALITY CHECK FAILED", delay: 0 });
        await wait(500);
        addLine({ type: "error", text: "[verify] Response accuracy: 0.23 (threshold: 0.70)", delay: 0 });
        await wait(500);
        addLine({ type: "info", text: "[verify] SLA violation detected — initiating dispute...", delay: 0 });
        await wait(1500);

        // Step 8: File dispute
        addLine({ type: "dim", text: "", delay: 0 });
        addLine({ type: "dim", text: `$ x402-agent dispute --escrow ${result.payment.escrowId}`, delay: 0 });
        await wait(500);

        inspector.addEvent({
          type: "http_request",
          label: "File Dispute",
          data: {
            method: "POST",
            url: `/api/disputes/${orderData.id}`,
            body: { reason: "Service quality below SLA threshold (accuracy: 0.23, required: 0.70)" },
          },
        });

        const disputeRes = await fetch(`/api/disputes/${orderData.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "Service quality below SLA threshold (accuracy: 0.23, required: 0.70)",
          }),
        });
        const disputeData = await disputeRes.json();

        inspector.addEvent({
          type: "http_response",
          label: "201 Dispute Filed",
          data: { status: 201, body: disputeData },
        });

        addLine({ type: "request", text: `POST /api/disputes/${orderData.id.slice(0, 8)}... → 201 Dispute Filed`, delay: 0 });
        await wait(500);
        addLine({ type: "info", text: `[dispute] Dispute ID: ${disputeData.disputeId.slice(0, 8)}...`, delay: 0 });

        if (disputeData.txHash) {
          inspector.addEvent({
            type: "tx_confirmed",
            label: "Dispute Filed",
            data: {
              txHash: disputeData.txHash,
              escrowId: result.payment.escrowId,
              function: "dispute",
            },
          });
        }

        inspector.addEvent({
          type: "state_change",
          label: "Disputed",
          data: { previousState: "DeliveryConfirmed", newState: "Disputed" },
        });

        addLine({ type: "error", text: "[dispute] Escrow state: DeliveryConfirmed → Disputed", delay: 0 });
        await wait(2000);

        // Step 9: Arbiter review (simulated)
        addLine({ type: "dim", text: "", delay: 0 });
        addLine({ type: "info", text: "[resolve] Arbiter reviewing dispute evidence...", delay: 0 });
        await wait(2000);
        addLine({ type: "info", text: "[resolve] Evidence: response accuracy 0.23 vs SLA threshold 0.70", delay: 0 });
        await wait(1500);
        addLine({ type: "info", text: "[resolve] Ruling: 70% refund to buyer, 30% to seller", delay: 0 });
        await wait(1500);

        // Step 10: Resolve dispute
        inspector.addEvent({
          type: "http_request",
          label: "Resolve Dispute",
          data: {
            method: "POST",
            url: `/api/disputes/${disputeData.disputeId}/resolve`,
            body: { buyerPct: 70, resolution: "Service quality below SLA threshold" },
          },
        });

        const resolveRes = await fetch(`/api/disputes/${disputeData.disputeId}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerPct: 70,
            resolution: "Service quality below SLA threshold",
          }),
        });
        const resolveData = await resolveRes.json();

        inspector.addEvent({
          type: "http_response",
          label: "200 Dispute Resolved",
          data: { status: 200, body: resolveData },
        });

        addLine({ type: "request", text: `POST /api/disputes/${disputeData.disputeId.slice(0, 8)}.../resolve → 200 Resolved`, delay: 0 });
        await wait(500);

        if (resolveData.txHash) {
          inspector.addEvent({
            type: "tx_confirmed",
            label: "Dispute Resolved",
            data: {
              txHash: resolveData.txHash,
              escrowId: result.payment.escrowId,
              function: "resolveDispute",
              args: { buyerPct: 70 },
            },
          });
        }

        inspector.addEvent({
          type: "state_change",
          label: "Resolved",
          data: { previousState: "Disputed", newState: "Resolved" },
        });

        addLine({ type: "dim", text: "", delay: 0 });
        addLine({ type: "success", text: "[resolve] Dispute resolved", delay: 0 });
        await wait(400);
        addLine({ type: "success", text: "[resolve] Buyer receives: 1.75 USDC (70%)", delay: 0 });
        await wait(400);
        addLine({ type: "success", text: "[resolve] Seller receives: 0.75 USDC (30%)", delay: 0 });
        await wait(400);
        addLine({ type: "info", text: "[complete] Dispute resolved. Funds distributed per arbiter ruling.", delay: 0 });
      }

      // ── Reputation Update (both paths) ──
      addLine({ type: "dim", text: "", delay: 0 });
      addLine({ type: "dim", text: "$ x402-agent reputation --update", delay: 0 });
      await wait(1000);

      let buyerRep: ReputationScore | null = null;
      let updatedSellerRep: ReputationScore | null = null;
      try {
        const [bRes, sRes] = await Promise.all([
          fetch(`/api/reputation/${address}?fresh=true`),
          fetch(`/api/reputation/${operatorAddress}?fresh=true`),
        ]);
        if (bRes.ok) buyerRep = await bRes.json();
        if (sRes.ok) updatedSellerRep = await sRes.json();
      } catch {}

      inspector.addEvent({
        type: "http_request",
        label: "Fetch Updated Reputation",
        data: { method: "GET", url: `/api/reputation/${address}?fresh=true` },
      });
      inspector.addEvent({
        type: "http_response",
        label: "Reputation Updated",
        data: { buyer: buyerRep?.buyer ? { score: buyerRep.buyer.score } : null, seller: updatedSellerRep?.seller ? { score: updatedSellerRep.seller.score } : null },
      });

      addLine({ type: "reputation", text: "[reputation] On-chain stats updated", delay: 0 });
      await wait(400);

      if (buyerRep?.buyer) {
        addLine({ type: "reputation", text: `[reputation] Buyer  — score: ${buyerRep.buyer.score}/100 | completed: ${(buyerRep.buyer.completionRate * 100).toFixed(0)}% | disputes: ${(buyerRep.buyer.disputeRate * 100).toFixed(0)}%`, delay: 0 });
      } else {
        addLine({ type: "reputation", text: `[reputation] Buyer  — awaiting on-chain confirmation`, delay: 0 });
      }
      await wait(300);

      if (updatedSellerRep?.seller) {
        addLine({ type: "reputation", text: `[reputation] Seller — score: ${updatedSellerRep.seller.score}/100 | completed: ${(updatedSellerRep.seller.completionRate * 100).toFixed(0)}% | disputes: ${(updatedSellerRep.seller.disputeRate * 100).toFixed(0)}%`, delay: 0 });
      } else {
        addLine({ type: "reputation", text: `[reputation] Seller — awaiting on-chain confirmation`, delay: 0 });
      }
      await wait(400);

      if (scenario === "happy") {
        addLine({ type: "reputation", text: `[reputation] Both parties building toward "medium" confidence (need 3+ escrows)`, delay: 0 });
      } else {
        addLine({ type: "reputation", text: `[reputation] Dispute recorded — future escrows may use extended release windows`, delay: 0 });
      }

      setReputationData({ buyer: buyerRep, seller: updatedSellerRep, scenario });

      setIsComplete(true);
    } catch (err: any) {
      addLine({ type: "error", text: `[error] ${err.message}`, delay: 0 });
    } finally {
      setIsRunning(false);
    }
  }, [walletClient, address, operatorAddress, speed, inspector, addLine]);

  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 1;
  const terminalStatus = isRunning
    ? `Running`
    : isComplete
      ? "Complete"
      : "Ready";

  const otherScenario: Scenario = activeScenario === "happy" ? "dispute" : "happy";
  const scenarioLabel = (s: Scenario) => s === "happy" ? "Happy Path" : "Dispute Path";

  return (
    <div className="space-y-4">
      {needsWallet ? (
        <div className="panel-surface rounded-xl p-6 text-center">
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
        <div className="panel-surface rounded-xl p-6 text-center">
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
        <div className="panel-surface flex flex-wrap items-center gap-3 rounded-xl p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Agent Runtime
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              terminalStatus === "Running"
                ? "border-warning/30 bg-warning/10 text-warning"
                : terminalStatus === "Complete"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border-default bg-bg-primary/55 text-text-tertiary"
            }`}
          >
            {terminalStatus}
          </span>
          {isRunning && activeScenario && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              activeScenario === "dispute"
                ? "border-error/30 bg-error/10 text-error"
                : "border-accent-purple/30 bg-accent-purple/10 text-accent-purple"
            }`}>
              {scenarioLabel(activeScenario)}
            </span>
          )}
          <span className="rounded-full border border-border-default bg-bg-primary/55 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
            Speed {speed}x
          </span>
          <span className="rounded-full border border-border-default bg-bg-primary/55 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
            {lines.length} log lines
          </span>

          {!isRunning && !isComplete && (
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => runDemo("happy")}
                disabled={!operatorAddress}
                className="rounded-lg bg-accent-purple px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-purple/90 disabled:opacity-50"
              >
                {operatorAddress ? "Happy Path" : "Loading..."}
              </button>
              <button
                onClick={() => runDemo("dispute")}
                disabled={!operatorAddress}
                className="rounded-lg border border-error/30 bg-error/10 px-5 py-2.5 text-sm font-semibold text-error transition-all hover:bg-error/20 disabled:opacity-50"
              >
                Dispute Path
              </button>
            </div>
          )}
          {isComplete && (
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => runDemo(activeScenario ?? "happy")}
                className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                Replay
              </button>
              <button
                onClick={() => runDemo(otherScenario)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  otherScenario === "dispute"
                    ? "border border-error/30 bg-error/10 text-error hover:bg-error/20"
                    : "border border-accent-purple/30 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20"
                }`}
              >
                Try {scenarioLabel(otherScenario)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Terminal */}
      <div className="panel-surface overflow-hidden rounded-xl">
        <div className="flex items-center gap-1.5 border-b border-border-default bg-bg-primary/55 px-4 py-2">
          <div className="h-3 w-3 rounded-full bg-error/60" />
          <div className="h-3 w-3 rounded-full bg-warning/60" />
          <div className="h-3 w-3 rounded-full bg-success/60" />
          <span className="ml-2 font-mono text-xs text-text-tertiary">
            x402-agent
          </span>
          <span className="ml-auto text-[11px] text-text-tertiary">
            stream: protocol-events.log
          </span>
        </div>
        <div
          ref={terminalRef}
          className="max-h-[500px] overflow-y-auto bg-slate-950 p-4 font-mono text-[13px] leading-relaxed"
        >
          {lines.length === 0 && !isRunning && (
            <div className="text-text-tertiary">
              Click &quot;Happy Path&quot; or &quot;Dispute Path&quot; to start...
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
                        : line.type === "reputation"
                          ? "text-violet"
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
        <div className="panel-surface flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-tertiary">
          <span>{isMockChainClient ? "Transaction ID:" : "View on BaseScan:"}</span>
          {isMockChainClient ? (
            <span className="font-mono text-text-secondary">
              {txHash.slice(0, 14)}...
            </span>
          ) : (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {txHash.slice(0, 14)}...
            </a>
          )}
        </div>
      )}

      {isComplete && reputationData && (
        <ReputationSummary
          buyerAddress={address!}
          sellerAddress={operatorAddress!}
          buyerRep={reputationData.buyer}
          sellerRep={reputationData.seller}
          scenario={reputationData.scenario}
        />
      )}
    </div>
  );
}
