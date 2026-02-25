# Wallet & Faucet UX Split

**Date:** 2026-02-25
**Status:** Approved

## Problem

The Fund button and demo wallet are muddled into the global UX. The app runs on Base Sepolia (a real testnet) but gates the faucet behind a `DEMO_MODE` env var, which frames the whole app as a demo. The header `WalletSelector` mixes demo wallet controls (fund button, ephemeral wallet creation) with real wallet management, creating a confusing experience for both casual visitors and developers.

## Decisions

- **Separate demo pages from dashboard** — they have fundamentally different wallet needs
- **Demo pages** (`/marketplace`, `/agent`): ephemeral wallet + contextual inline faucet at the payment step
- **Dashboard** (`/dashboard/*`): browser wallet only (MetaMask etc.), no faucet, no demo wallet
- **Replace `DEMO_MODE`** with automatic chain detection (`isTestnet` flag on `ChainConfig`)
- **Scoped to EVM** — design is forward-compatible with Solana but implementation stays EVM-only

## Design

### 1. Chain-aware faucet (backend)

- Add `isTestnet: boolean` to `ChainConfig` in `src/shared/constants.ts`
  - Base Sepolia (84532): `isTestnet: true`
  - Base (8453): `isTestnet: false`
- In `src/server/routes/demo.ts`, replace `process.env.DEMO_MODE !== "true"` check with `config.chainConfig.isTestnet`
- Mock chain mode (`MOCK_CHAIN=true`): faucet disabled — no real chain to fund on
- Remove all references to `DEMO_MODE` from env examples and docs
- Endpoint stays at `POST /api/demo/fund`, rate limiting unchanged

### 2. Wallet UX split

**Dashboard (`/dashboard/*`) — browser wallet only:**
- `WalletGate`: show only "Connect Wallet" button calling `connectBrowser` — no "Create Demo Wallet" option
- If user has a demo wallet connected and navigates to dashboard, show the connect prompt (demo wallets not valid here)
- Navbar `WalletSelector` on dashboard pages: no demo wallet option

**Demo pages (`/marketplace`, `/agent`) — ephemeral wallet + inline faucet:**
- Keep "Create Demo Wallet" button inline (already exists in `PaymentFlow` and `AgentTerminal`)
- Also allow browser wallets (developers may use MetaMask on demo flows)
- Remove Fund button from header `WalletSelector` entirely

**Navbar `WalletSelector`:**
- Pure status display + connect/disconnect
- No funding controls
- Shows whichever wallet type is active

### 3. Inline faucet UX in demo flows

**Location:** Inside `PaymentFlow` and `AgentTerminal`, at the payment step.

**Behavior:**
- Before payment/signing step, check `usdcBalance < requiredAmount`
- If insufficient: inline prompt "You need X USDC to try this — [Get Test USDC]"
- Button calls existing `fundDemoWallet` (`POST /api/demo/fund`)
- After funding succeeds, auto-refresh balance, payment step becomes available
- Browser wallets with sufficient balance: no prompt shown

**Error handling:**
- Rate limit → "Testnet faucet limit reached. Try again in X minutes."
- Server unreachable → "Could not reach faucet. Make sure the facilitator is running."
- Sufficient balance → prompt never appears

**Not building:**
- No auto-funding on wallet creation
- No global faucet UI — contextual only in demo flows
- No faucet on dashboard pages

## Key Files Affected

- `src/shared/constants.ts` — add `isTestnet` to `ChainConfig`
- `src/server/routes/demo.ts` — replace `DEMO_MODE` with chain detection
- `src/server/config.ts` — remove `DEMO_MODE` references
- `web/components/ui/WalletSelector.tsx` — remove Fund button, become status-only
- `web/components/dashboard/WalletGate.tsx` — browser wallet only, reject demo wallets
- `web/components/marketplace/PaymentFlow.tsx` — add inline faucet prompt
- `web/components/agent/AgentTerminal.tsx` — add inline faucet prompt
- `web/lib/wallet/WalletProvider.tsx` — no changes needed (keeps both wallet types)
