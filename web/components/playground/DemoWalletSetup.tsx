"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";
import { AddressDisplay } from "@/components/ui/AddressDisplay";

/* ── Inline SVG icons ────────────────────────────────────────────────── */

function WalletIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 010-4h14v4" />
      <path d="M3 5v14a2 2 0 002 2h16v-5" />
      <path d="M18 12a2 2 0 100 4h4v-4h-4z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M14.5 9.5c-.5-.7-1.4-1-2.5-1s-2 .5-2 1.5.8 1.5 2 1.5 2 .5 2 1.5-.9 1.5-2 1.5-2-.3-2.5-1" />
      <path d="M12 7v1m0 8v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/* ── Step indicator ──────────────────────────────────────────────────── */

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [1, 2, 3] as const;

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isCompleted = step < current;
        const isCurrent = step === current;

        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div className={`h-px w-4 ${isCompleted ? "bg-accent" : "bg-bg-tertiary"}`} />
            )}
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                isCompleted
                  ? "bg-accent text-white"
                  : isCurrent
                    ? "border border-accent/30 bg-accent/10 text-accent"
                    : "bg-bg-tertiary text-text-tertiary"
              }`}
            >
              {isCompleted ? <CheckIcon /> : step}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export function DemoWalletSetup() {
  const { address, usdcBalance, ethBalance, connectDemo, fundDemoWallet, isFunding, error } =
    useWallet();

  const isWalletCreated = address !== null;
  const isFunded = usdcBalance !== null && parseFloat(usdcBalance) > 0;
  const currentStep: 1 | 2 | 3 = !isWalletCreated ? 1 : !isFunded ? 2 : 3;

  return (
    <div className="rounded-2xl border border-border-default bg-bg-secondary p-8 text-center shadow-md">
      {/* Header with step indicator */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Demo Wallet
        </h2>
        <StepIndicator current={currentStep} />
      </div>

      {/* Step 1 — Create Wallet */}
      {currentStep === 1 && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <WalletIcon />
          </div>
          <div>
            <p className="text-sm font-medium">Create Demo Wallet</p>
            <p className="mt-1 text-xs text-text-secondary">
              An ephemeral wallet for this browser session. No extensions needed.
            </p>
          </div>
          <button
            onClick={connectDemo}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Create Wallet
          </button>
        </div>
      )}

      {/* Step 2 — Fund Wallet */}
      {currentStep === 2 && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <CoinIcon />
          </div>
          <div>
            <p className="text-sm font-medium">Fund with Test USDC</p>
            <p className="mt-1 text-xs text-text-secondary">
              Get free testnet USDC to try the demos.
            </p>
          </div>
          <AddressDisplay address={address!} />
          <button
            onClick={fundDemoWallet}
            disabled={isFunding}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {isFunding ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Funding…
              </span>
            ) : (
              "Get Test USDC"
            )}
          </button>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}

      {/* Step 3 — Ready */}
      {currentStep === 3 && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircleIcon />
          </div>
          <div>
            <p className="text-sm font-medium text-success">Wallet Ready</p>
            <p className="mt-1 text-xs text-text-secondary">
              You&apos;re ready to try the demos below.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AddressDisplay address={address!} />
            <div className="h-4 w-px bg-border-default" />
            <span className="text-sm font-medium text-accent">{usdcBalance} USDC</span>
            {ethBalance && (
              <>
                <div className="h-4 w-px bg-border-default" />
                <span className="text-sm text-text-secondary">{ethBalance} ETH</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
