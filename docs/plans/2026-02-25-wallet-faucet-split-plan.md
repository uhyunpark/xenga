# Wallet & Faucet UX Split — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate demo wallet/faucet from dashboard wallet UX and replace `DEMO_MODE` env var with chain-aware testnet detection.

**Architecture:** Add `isTestnet` to shared `ChainConfig`, gate the faucet endpoint on it, strip funding controls from the header `WalletSelector`, make `WalletGate` require browser wallets, and add inline faucet prompts in demo flow components.

**Tech Stack:** TypeScript, Next.js 15, Express, viem, Foundry (no contract changes)

---

### Task 1: Add `isTestnet` to `ChainConfig`

**Files:**
- Modify: `src/shared/constants.ts:6-13` (ChainConfig interface) and `:16-31` (CHAIN_CONFIGS)

**Step 1: Add `isTestnet` to the `ChainConfig` interface**

In `src/shared/constants.ts`, add `isTestnet` to the interface:

```typescript
export interface ChainConfig {
  chain: Chain;
  chainId: number;
  usdcAddress: `0x${string}`;
  defaultRpc: string;
  /** Network name used in xenga payment headers */
  network: string;
  /** Whether this is a testnet (enables faucet, etc.) */
  isTestnet: boolean;
}
```

**Step 2: Set `isTestnet` in both chain configs**

```typescript
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  84532: {
    chain: baseSepolia,
    chainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    defaultRpc: "https://sepolia.base.org",
    network: "base-sepolia",
    isTestnet: true,
  },
  8453: {
    chain: base,
    chainId: 8453,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    defaultRpc: "https://mainnet.base.org",
    network: "base",
    isTestnet: false,
  },
};
```

**Step 3: Verify build**

Run: `cd /Users/uhyun/personal/x402-escrow && npx tsc --noEmit -p src/tsconfig.json`
Expected: No errors (isTestnet is additive, no consumers yet)

**Step 4: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add isTestnet to ChainConfig"
```

---

### Task 2: Replace `DEMO_MODE` with chain detection in faucet endpoint

**Files:**
- Modify: `src/server/routes/demo.ts:32-35`
- Modify: `src/server/config.ts` (expose `isMock` in config)

**Step 1: Export `isMock` from config**

In `src/server/config.ts`, add `isMock` to the config object:

```typescript
export const config = {
  // ... existing fields ...
  isMock,
};
```

(The `const isMock = process.env.MOCK_CHAIN === "true"` already exists at line 20.)

**Step 2: Replace `DEMO_MODE` check in demo route**

In `src/server/routes/demo.ts`, replace the guard:

Old:
```typescript
if (process.env.DEMO_MODE !== "true") {
  return res.status(403).json({ error: "Demo faucet is not enabled" });
}
```

New:
```typescript
import { config } from "../config.js";

// ...

if (!config.chainConfig.isTestnet || config.isMock) {
  return res.status(403).json({ error: "Faucet is only available on testnets" });
}
```

**Step 3: Verify the server starts**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run build:check` or `npx tsc --noEmit -p src/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add src/server/routes/demo.ts src/server/config.ts
git commit -m "feat: replace DEMO_MODE with chain-aware faucet gating"
```

---

### Task 3: Strip funding controls from `WalletSelector`

**Files:**
- Modify: `web/components/ui/WalletSelector.tsx`

**Step 1: Remove Fund button and funding-related imports**

Replace the entire `WalletSelector` component. Remove `isFunding` and `fundDemoWallet` from the `useWallet()` destructure. Remove the Fund button JSX block (lines 30-38).

New `WalletSelector`:

```typescript
"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";
import { shortenAddress } from "@/lib/utils";

export function WalletSelector() {
  const {
    type,
    address,
    usdcBalance,
    connectDemo,
    disconnect,
  } = useWallet();

  if (!address) {
    return (
      <button
        onClick={connectDemo}
        className="rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      >
        Create Demo Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {usdcBalance !== null && (
        <span className="text-xs text-text-secondary">
          {usdcBalance} USDC
        </span>
      )}
      <div className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-2.5 py-1.5">
        <div className="h-2 w-2 rounded-full bg-success" />
        <span className="font-mono text-xs text-text-primary">
          {shortenAddress(address)}
        </span>
        <button
          onClick={disconnect}
          className="ml-1 text-text-tertiary transition-colors hover:text-text-primary"
          title="Disconnect"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/components/ui/WalletSelector.tsx
git commit -m "refactor: remove Fund button from WalletSelector header"
```

---

### Task 4: Make `WalletGate` require browser wallet

**Files:**
- Modify: `web/components/dashboard/WalletGate.tsx`

**Step 1: Update WalletGate to reject demo wallets**

The gate should show a connect prompt if no wallet OR if the connected wallet is a demo wallet. Import `connectBrowser` instead of relying on `WalletSelector`.

```typescript
"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, type, connectBrowser } = useWallet();

  if (!address || type === "demo") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Connect Your Wallet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {type === "demo"
              ? "The dashboard requires a browser wallet (e.g. MetaMask). Demo wallets are not supported here."
              : "Connect a browser wallet to access the seller dashboard."}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={connectBrowser}
              className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/components/dashboard/WalletGate.tsx
git commit -m "feat: WalletGate requires browser wallet, rejects demo wallets"
```

---

### Task 5: Improve inline faucet prompt in `PaymentFlow`

**Files:**
- Modify: `web/components/marketplace/PaymentFlow.tsx`

**Step 1: Update the `needsFunding` prompt with better copy and error handling**

The existing `needsFunding` block at lines 616-627 already shows an inline faucet prompt. Update it with improved copy and error feedback:

Find the `needsFunding` block (inside the `state.step === "select"` section, around line 616):

Old:
```tsx
) : needsFunding ? (
  <div className="panel-surface rounded-xl p-6 text-center">
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
```

New:
```tsx
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
```

Also add `isFunding` to the destructured `useWallet()` call at line 132 (it's not currently destructured in PaymentFlow).

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/components/marketplace/PaymentFlow.tsx
git commit -m "refactor: improve inline faucet prompt in PaymentFlow"
```

---

### Task 6: Improve inline faucet prompt in `AgentTerminal`

**Files:**
- Modify: `web/components/agent/AgentTerminal.tsx`

**Step 1: Update the `needsFunding` prompt**

The existing block is at lines 781-792. Update with same pattern as PaymentFlow:

Old:
```tsx
) : needsFunding ? (
  <div className="panel-surface rounded-xl p-6 text-center">
    <p className="mb-3 text-sm text-text-secondary">
      Fund your wallet to run the on-chain demos
    </p>
    <button
      onClick={fundDemoWallet}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
    >
      Fund Wallet
    </button>
  </div>
```

New:
```tsx
) : needsFunding ? (
  <div className="panel-surface rounded-xl p-6 text-center">
    <p className="mb-1 text-sm font-medium text-text-primary">
      You need USDC to try this
    </p>
    <p className="mb-4 text-xs text-text-tertiary">
      Get free testnet USDC from the faucet to run on-chain demos.
    </p>
    <button
      onClick={fundDemoWallet}
      disabled={isFunding}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
    >
      {isFunding ? "Getting Test USDC..." : "Get Test USDC"}
    </button>
  </div>
```

Also add `isFunding` to the destructured `useWallet()` call at line 53.

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/components/agent/AgentTerminal.tsx
git commit -m "refactor: improve inline faucet prompt in AgentTerminal"
```

---

### Task 7: Update docs (`CLAUDE.md`)

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md references**

1. Line 226 — Change `Requires \`DEMO_MODE=true\`.` to `Automatically available on testnets (detected via \`chainConfig.isTestnet\`).`

2. Line 241 — Remove `DEMO_MODE` from the env var list. Change to: `Requires \`.env\` (see \`.env.example\`): \`PRIVATE_KEY\`, \`ESCROW_VAULT_ADDRESS\`, optionally \`BASE_SEPOLIA_RPC\`, \`PORT\`, \`CORS_ORIGIN\`.`

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — remove DEMO_MODE references"
```

---

### Task 8: Final verification

**Step 1: Verify server TypeScript**

Run: `cd /Users/uhyun/personal/x402-escrow && npx tsc --noEmit -p src/tsconfig.json`
Expected: No errors

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Verify contract tests still pass**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run test:contracts`
Expected: All 86 tests pass (no contract changes in this plan)

**Step 4: Manual smoke test (optional)**

1. Start facilitator: `bun run dev`
2. Start web: `cd web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev`
3. Verify: Fund button is gone from header
4. Verify: `/marketplace` shows inline "Get Test USDC" when balance is low
5. Verify: `/dashboard` shows "Connect Wallet" (not "Create Demo Wallet")
