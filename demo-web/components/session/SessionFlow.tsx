"use client";

import { useReducer, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useInspector } from "@/lib/protocol-inspector/context";
import {
  requestSession,
  signSession,
  submitSession,
  useSession,
  closeSession,
} from "@/lib/api/session-flow";
import type {
  SessionRequired,
  SessionPayload,
  SessionResponse,
} from "@/lib/api/session-flow";
import { Badge } from "@/components/ui/Badge";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { formatUsdc } from "@/lib/utils";

// ──────────── Types ────────────

type SessionStep = "init" | "sign" | "submit" | "active" | "settled";

interface UsageEntry {
  id: number;
  timestamp: number;
  priceCharged: string;
  remaining: string;
}

interface FlowState {
  step: SessionStep;
  error: string | null;
  loading: boolean;
  sessionRequired: SessionRequired | null;
  sessionPayload: SessionPayload | null;
  sessionId: number | null;
  expiresAt: number | null;
  deposit: string | null;
  pricePerUse: string | null;
  usedAmount: string;
  remaining: string;
  usageLog: UsageEntry[];
}

type FlowAction =
  | { type: "SET_SESSION_REQUIRED"; sessionRequired: SessionRequired }
  | { type: "SET_SESSION_PAYLOAD"; sessionPayload: SessionPayload }
  | { type: "SET_SESSION_ACTIVE"; response: SessionResponse }
  | { type: "RECORD_USAGE"; entry: UsageEntry }
  | { type: "SET_SETTLED" }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "RESET" };

const initialState: FlowState = {
  step: "init",
  error: null,
  loading: false,
  sessionRequired: null,
  sessionPayload: null,
  sessionId: null,
  expiresAt: null,
  deposit: null,
  pricePerUse: null,
  usedAmount: "0",
  remaining: "0",
  usageLog: [],
};

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SET_SESSION_REQUIRED":
      return { ...state, sessionRequired: action.sessionRequired, step: "sign", loading: false, error: null };
    case "SET_SESSION_PAYLOAD":
      return { ...state, sessionPayload: action.sessionPayload, step: "submit", loading: false, error: null };
    case "SET_SESSION_ACTIVE":
      return {
        ...state,
        step: "active",
        sessionId: action.response.sessionId,
        expiresAt: action.response.expiresAt,
        deposit: action.response.deposit,
        pricePerUse: action.response.pricePerUse,
        remaining: action.response.deposit,
        usedAmount: "0",
        loading: false,
        error: null,
      };
    case "RECORD_USAGE":
      return {
        ...state,
        usageLog: [...state.usageLog, action.entry],
        remaining: action.entry.remaining,
        usedAmount: (BigInt(state.deposit ?? "0") - BigInt(action.entry.remaining)).toString(),
        loading: false,
      };
    case "SET_SETTLED":
      return { ...state, step: "settled", loading: false, error: null };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ──────────── Steps ────────────

const STEPS: { key: SessionStep; label: string }[] = [
  { key: "init", label: "Authorize" },
  { key: "sign", label: "Sign" },
  { key: "submit", label: "Deposit" },
  { key: "active", label: "Use API" },
  { key: "settled", label: "Settled" },
];

// ──────────── Component ────────────

export function SessionFlow() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { walletClient, address, connectDemo, fundDemoWallet, usdcBalance, type: walletType } = useWallet();
  const inspector = useInspector();

  // Step 1: Request session (get 402)
  const handleRequestSession = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const { sessionRequired } = await requestSession(inspector.addEvent);
      dispatch({ type: "SET_SESSION_REQUIRED", sessionRequired });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [inspector]);

  // Step 2: Sign EIP-712
  const handleSignSession = useCallback(async () => {
    if (!state.sessionRequired || !walletClient) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const payload = await signSession(walletClient, state.sessionRequired, inspector.addEvent);
      dispatch({ type: "SET_SESSION_PAYLOAD", sessionPayload: payload });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [state.sessionRequired, walletClient, inspector]);

  // Step 3: Submit session creation
  const handleSubmitSession = useCallback(async () => {
    if (!state.sessionPayload) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const response = await submitSession(state.sessionPayload, inspector.addEvent);
      dispatch({ type: "SET_SESSION_ACTIVE", response });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [state.sessionPayload, inspector]);

  // Step 4: Use session API
  const handleUseSession = useCallback(async () => {
    if (!state.sessionId) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const result = await useSession(state.sessionId, inspector.addEvent);
      dispatch({
        type: "RECORD_USAGE",
        entry: {
          id: state.usageLog.length + 1,
          timestamp: result.timestamp,
          priceCharged: result.data.priceCharged,
          remaining: result.balance.remaining,
        },
      });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [state.sessionId, state.usageLog.length, inspector]);

  // Step 5: Close session
  const handleCloseSession = useCallback(async () => {
    if (!state.sessionId) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      await closeSession(state.sessionId, inspector.addEvent);
      dispatch({ type: "SET_SETTLED" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [state.sessionId, inspector]);

  const handleReset = useCallback(() => {
    inspector.clear();
    dispatch({ type: "RESET" });
  }, [inspector]);

  const needsWallet = !address;
  const needsFunding = walletType === "demo" && usdcBalance !== null && parseFloat(usdcBalance) < 10;

  const currentStepIndex = STEPS.findIndex((s) => s.key === state.step);
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100;

  const btnClass =
    "w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#031018] transition-all hover:bg-accent/90 disabled:opacity-50";
  const glowBtnClass =
    "glow-blue w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#031018] transition-all hover:bg-accent/90 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left sidebar — Step tracker */}
      <div className="hidden shrink-0 lg:block lg:w-56">
        <div className="panel-surface sticky top-20 rounded-xl p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Session Flow
          </p>
          <div className="mt-3 space-y-1">
            {STEPS.map((step, i) => {
              const isActive = step.key === state.step;
              const isDone = i < currentStepIndex;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "bg-accent/12 text-accent font-medium"
                      : isDone
                        ? "text-text-secondary"
                        : "text-text-tertiary"
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-accent text-[#031018]"
                        : isDone
                          ? "bg-success/20 text-success"
                          : "bg-bg-tertiary text-text-tertiary"
                    }`}
                  >
                    {isDone ? "\u2713" : i + 1}
                  </div>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
          {state.step !== "init" && (
            <button
              onClick={handleReset}
              className="mt-3 w-full rounded-md border border-border-default px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-active hover:text-text-primary"
            >
              Start Over
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Mobile progress */}
        <div className="panel-surface rounded-xl p-3 lg:hidden">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Session flow</span>
            <span className="font-mono">{currentStepIndex + 1}/{STEPS.length}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-medium">{STEPS[currentStepIndex]?.label}</p>
        </div>

        {/* Info banner */}
        <div className="panel-surface rounded-lg p-3 text-xs text-text-secondary">
          <span className="font-semibold text-accent">Session pattern:</span> authorize once with a deposit,
          make multiple API calls without signing, then settle. 1 signature for N requests.
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main panel */}
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {/* Step: Init */}
              {state.step === "init" && (
                <motion.div
                  key="init"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {needsWallet ? (
                    <div className="panel-surface rounded-xl p-6 text-center">
                      <p className="mb-3 text-sm text-text-secondary">
                        Connect a wallet to start the session demo
                      </p>
                      <button onClick={connectDemo} className={btnClass}>
                        Create Demo Wallet
                      </button>
                    </div>
                  ) : needsFunding ? (
                    <div className="panel-surface rounded-xl p-6 text-center">
                      <p className="mb-3 text-sm text-text-secondary">
                        Your demo wallet needs at least 10 USDC for the session deposit
                      </p>
                      <button onClick={fundDemoWallet} className={btnClass}>
                        Fund Wallet with Test USDC
                      </button>
                    </div>
                  ) : (
                    <div className="panel-surface rounded-xl p-4">
                      <h3 className="mb-2 text-sm font-semibold">Start a Session</h3>
                      <p className="mb-4 text-xs text-text-tertiary">
                        Deposit 10 USDC to create a session. Each API call costs 0.10 USDC,
                        deducted from your balance without additional signatures.
                        Unused funds are refunded when you close the session.
                      </p>
                      <div className="mb-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Deposit</span>
                          <span className="font-mono text-accent">10.00 USDC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Price per call</span>
                          <span className="font-mono">0.10 USDC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Duration</span>
                          <span>1 hour</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Max API calls</span>
                          <span className="font-mono">100</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          inspector.clear();
                          inspector.setOpen(true);
                          handleRequestSession();
                        }}
                        disabled={state.loading}
                        className={glowBtnClass}
                      >
                        {state.loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#031018] border-t-transparent" />
                            Requesting...
                          </span>
                        ) : (
                          "Authorize Session"
                        )}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step: Sign */}
              {state.step === "sign" && state.sessionRequired && (
                <motion.div
                  key="sign"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="panel-surface rounded-xl p-4"
                >
                  <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="info">402 Session Payment Required</Badge>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Deposit</span>
                        <span className="font-mono text-accent">
                          {formatUsdc(state.sessionRequired.maxAmount)} USDC
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-tertiary">Session Contract</span>
                        <AddressDisplay address={state.sessionRequired.sessionContract} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Price/Call</span>
                        <span className="font-mono">
                          {formatUsdc(state.sessionRequired.pricePerUse)} USDC
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Duration</span>
                        <span>{Math.floor(state.sessionRequired.duration / 3600)}h</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSignSession}
                    disabled={state.loading}
                    className={glowBtnClass}
                  >
                    {state.loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#031018] border-t-transparent" />
                        Signing...
                      </span>
                    ) : (
                      "Sign Authorization"
                    )}
                  </button>
                </motion.div>
              )}

              {/* Step: Submit */}
              {state.step === "submit" && state.sessionPayload && (
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
                        <AddressDisplay address={state.sessionPayload.from} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Deposit</span>
                        <span className="font-mono text-accent">
                          {formatUsdc(state.sessionPayload.value)} USDC
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmitSession}
                    disabled={state.loading}
                    className={glowBtnClass}
                  >
                    {state.loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#031018] border-t-transparent" />
                        Creating session...
                      </span>
                    ) : (
                      "Create Session"
                    )}
                  </button>
                </motion.div>
              )}

              {/* Step: Active — Use API */}
              {state.step === "active" && (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Balance bar */}
                  <div className="panel-surface rounded-xl p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        Session Balance
                      </span>
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                        Active
                      </span>
                    </div>
                    <SessionBalanceBar
                      deposit={state.deposit ?? "0"}
                      remaining={state.remaining}
                    />
                    <div className="mt-2 flex justify-between text-xs text-text-tertiary">
                      <span>Used: {formatUsdc(state.usedAmount)} USDC</span>
                      <span>Remaining: {formatUsdc(state.remaining)} USDC</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="panel-surface rounded-xl p-4">
                    <h3 className="mb-2 text-sm font-semibold">Make API Calls</h3>
                    <p className="mb-3 text-xs text-text-tertiary">
                      Each click sends a request using your session.
                      No additional signatures needed — just your session ID.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUseSession}
                        disabled={state.loading || BigInt(state.remaining) < BigInt(state.pricePerUse ?? "0")}
                        className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#031018] transition-all hover:bg-accent/90 disabled:opacity-50"
                      >
                        {state.loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#031018] border-t-transparent" />
                            Calling...
                          </span>
                        ) : (
                          "Make Request"
                        )}
                      </button>
                      <button
                        onClick={handleCloseSession}
                        disabled={state.loading}
                        className="rounded-lg border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-active hover:text-text-primary disabled:opacity-50"
                      >
                        Close Session
                      </button>
                    </div>
                  </div>

                  {/* Usage log */}
                  {state.usageLog.length > 0 && (
                    <div className="panel-surface rounded-xl p-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        Usage Log ({state.usageLog.length} calls)
                      </h4>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {state.usageLog.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between rounded border border-border-default bg-bg-primary/50 px-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-text-tertiary">
                                #{entry.id}
                              </span>
                              <span className="text-text-secondary">
                                {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-error">
                                -{formatUsdc(entry.priceCharged)}
                              </span>
                              <span className="font-mono text-text-tertiary">
                                bal: {formatUsdc(entry.remaining)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step: Settled */}
              {state.step === "settled" && (
                <motion.div
                  key="settled"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-success/20 bg-success/5 p-6 text-center"
                >
                  <div className="mb-3 text-4xl">&#127881;</div>
                  <h3 className="mb-1 text-lg font-bold text-success">
                    Session Settled!
                  </h3>
                  <p className="mb-2 text-sm text-text-secondary">
                    {state.usageLog.length} API calls made with 1 signature.
                  </p>
                  <div className="mx-auto mb-4 max-w-xs space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Total used</span>
                      <span className="font-mono text-error">
                        {formatUsdc(state.usedAmount)} USDC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Refunded</span>
                      <span className="font-mono text-success">
                        {formatUsdc(state.remaining)} USDC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">Deposit</span>
                      <span className="font-mono">
                        {formatUsdc(state.deposit ?? "0")} USDC
                      </span>
                    </div>
                  </div>
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

          {/* Right sidebar — Session info */}
          <div className="space-y-4">
            <div className="panel-surface rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Session Info
              </p>
              <div className="mt-3 space-y-2">
                <MetaRow
                  label="Session ID"
                  value={state.sessionId ? `#${state.sessionId}` : "Not created"}
                />
                <MetaRow
                  label="Status"
                  value={state.step === "active" ? "Active" : state.step === "settled" ? "Settled" : "Pending"}
                />
                <MetaRow
                  label="API Calls"
                  value={state.usageLog.length.toString()}
                  mono
                />
                <MetaRow
                  label="Balance"
                  value={state.deposit ? `${formatUsdc(state.remaining)} / ${formatUsdc(state.deposit)}` : "-"}
                  mono
                />
              </div>
            </div>

            <div className="panel-surface rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Why Sessions?
              </p>
              <div className="mt-2 space-y-2 text-[11px] text-text-tertiary">
                <p>
                  <span className="font-medium text-text-secondary">Without sessions:</span> each API call
                  requires a signature + on-chain transaction. N calls = N signatures + N txs.
                </p>
                <p>
                  <span className="font-medium text-text-secondary">With sessions:</span> 1 signature to deposit,
                  N API calls with just HTTP, 1 tx to settle. Total: 1 signature + 2 txs for N calls.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────── Sub-components ────────────

function SessionBalanceBar({
  deposit,
  remaining,
}: {
  deposit: string;
  remaining: string;
}) {
  const depositNum = Number(deposit);
  const remainingNum = Number(remaining);
  const usedPct = depositNum > 0 ? ((depositNum - remainingNum) / depositNum) * 100 : 0;

  return (
    <div className="h-3 overflow-hidden rounded-full bg-bg-tertiary">
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-purple transition-all duration-500"
        style={{ width: `${Math.min(usedPct, 100)}%` }}
      />
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
