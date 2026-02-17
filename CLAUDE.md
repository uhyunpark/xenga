# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Server (Express + SQLite)
bun run dev                    # Dev mode with watch
bun run start                  # Production start

# Demo Web (Next.js 15)
cd demo-web && bun run dev     # Dev mode on port 3000 (includes API + UI)
cd demo-web && bun run build   # Production build
cd demo-web && bun run start   # Production start

# Contracts (Foundry)
bun run build:contracts        # forge build (from contracts/)
bun run test:contracts         # forge test (from contracts/)
cd contracts && forge test --match-test test_specificName  # Run single test
cd contracts && forge test -vvvv  # Verbose output with traces

# ABI sync (run after contract changes)
bun run build:contracts && bun run sync-abi
```

## Architecture

x402 escrow payment system on Base Sepolia using USDC (ERC-3009 gasless transfers).

**Four layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/server/`** — Express server: x402 middleware intercepts requests, returns 402 with payment requirements, verifies EIP-712 signatures, settles on-chain
- **`src/client/`** — SDK: `escrowFetch` wraps fetch to handle the 402 flow automatically (with optional `onSellerReputation` callback), `escrowScheme` handles EIP-712 ReceiveWithAuthorization signing, `createEscrowClient` includes `getReputation()`
- **`demo-web/`** — Next.js 15 App Router demo: interactive webpage showcasing the x402 escrow flow with Protocol Inspector

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`). Note: `getBuyerStats`/`buyerStats` ABI entries were manually added pending a `sync-abi` run after contract redeployment.

### x402 Payment Flow

1. Client POSTs to a payment-protected endpoint without `X-PAYMENT` header
2. Middleware returns **402** with `X-PAYMENT-REQUIRED` header (base64 JSON: amount, token, escrow address, order details)
3. Client signs ERC-3009 `ReceiveWithAuthorization` via EIP-712 (USDC gasless transfer to EscrowVault)
4. Client retries with `X-PAYMENT` header containing the signature
5. Server verifies signature off-chain (`facilitator/verifier.ts`), submits `createEscrowWithAuth` on-chain (`facilitator/settler.ts`)
6. Returns **200** with `X-PAYMENT-RESPONSE` header

### Service Types

Service types (`src/server/service-types/`) define escrow parameters per use case:
- **marketplace**: 7-day release window, manual delivery confirmation
- **agent-service**: 1-hour release window, auto-verify delivery

Each service type can implement `adjustParams(params, reputation)` to dynamically adjust escrow parameters (e.g. release window) based on counterparty reputation scores.

### Reputation System

On-chain credit scoring for agents/wallets, computed from escrow transaction history. The facilitator tracks both `sellerStats` and `buyerStats` on-chain (in `EscrowVault.sol`), and the server computes weighted reputation scores from this data.

**Architecture:**
- **On-chain**: `buyerStats[address]` and `sellerStats[address]` mappings in EscrowVault track totalEscrows, completedCount, disputedCount, refundedCount, resolvedCount, and amounts. Raw data is permissionless — anyone can read and compute their own scores.
- **Off-chain**: `reputationService.ts` computes weighted scores (0-100) with confidence levels, cached 60s in-memory.
- **Dynamic params**: Service types use `adjustParams()` to shorten/extend release windows based on counterparty reputation (e.g. high-trust pairs get 3-day instead of 7-day marketplace window).
- **402 integration**: Seller reputation is included in 402 response body; clients can check via `onSellerReputation` callback before paying.

**Scoring formulas:**
- Seller: completionRate×40 + (1-disputeRate)×25 + (1-refundRate)×15 + resolutionFairness×10 + volumeBonus×10
- Buyer: completionRate×45 + (1-disputeRate)×25 + (1-frivolousDisputeRate)×20 + volumeBonus×10
- Confidence: `"low"` (<3 escrows), `"medium"` (3-9), `"high"` (≥10)

**Key files:**
- `contracts/src/EscrowVault.sol` — `buyerStats` mapping + `getBuyerStats()` view
- `src/server/services/reputationService.ts` — `computeReputation()`, `computeReputationHistory()`
- `src/server/routes/reputation.ts` — `GET /api/reputation/:address`, `GET /api/reputation/:address/history`
- `src/shared/types.ts` — `ReputationScore`, `SellerReputation`, `BuyerReputation`

### Fee System

The facilitator pays all gas fees for on-chain transactions (createEscrowWithAuth, confirmDelivery, resolveDispute, refund). To cover costs and earn margin, a configurable facilitator fee is deducted from the seller's payout at settlement (seller-pays model, like Stripe/PayPal).

**How it works:**
- `feeBps` and `feeRecipient` are global contract state, set by owner via `setFeeConfig()`
- Fee is computed at escrow creation: `fee = (amount * feeBps) / 10000`, stored in `Escrow.facilitatorFee`
- Buyer pays exactly `orderPrice` — no amount inflation
- On release/autoRelease: seller gets `amount - fee`, feeRecipient gets `fee`
- On refund: buyer gets full `amount` back (facilitator absorbs cost)
- On dispute resolution: fee goes to feeRecipient, `buyerPct` split applies to `amount - fee`
- `MAX_FEE_BPS = 1000` (10% cap)
- Safety guard: `if (fee > 0 && feeRecipient != address(0))` prevents revert if feeRecipient changed to zero while escrows are active
- Stats track gross `amount` (not net) — reputation scoring uses transaction volume

**Config:** `FEE_BPS` and `FEE_RECIPIENT` env vars (see `.env.example`). Default: 0 (no fee).

### Escrow Lifecycle (On-Chain)

`None → Active → DeliveryConfirmed → Completed` (happy path: seller confirms, buyer releases)
- **AutoReleased**: anyone triggers after release window expires
- **Disputed**: buyer files within 3-day window after delivery confirmation
- **Resolved**: arbiter splits funds by percentage
- **Refunded**: seller or arbiter refunds buyer

## Demo Web (`demo-web/`)

Next.js 15 App Router app that replaces the Express server for demo purposes. Imports existing server logic directly via webpack aliases — no code duplication. See `demo-web/CLAUDE.md` for full context on the chain adapter, wallet system, protocol inspector, and payment flow internals.

### Structure

```
demo-web/
  app/
    page.tsx                 # Landing page
    marketplace/page.tsx     # Interactive marketplace demo
    agent/page.tsx           # Auto-advancing agent service demo
    api/                     # Route Handlers (replace Express routes)
      health/                # GET — server status
      orders/                # GET/POST orders
      orders/[id]/pay/       # POST — core x402 payment flow
      orders/[id]/confirm-delivery/  # POST — demo delivery confirmation
      disputes/              # POST dispute, POST resolve
      escrows/[escrowId]/    # GET on-chain state
      reputation/[address]/  # GET reputation score + GET history
      demo/fund/             # POST — faucet for demo wallets
  components/
    landing/                 # Hero, ProtocolFlow, DemoCards, HowItWorks, Footer
    marketplace/             # PaymentFlow, ProductGrid, StepTracker, SellerPanel
    agent/                   # AgentTerminal
    protocol-inspector/      # InspectorPanel + 4 tab components
    ui/                      # Badge, AddressDisplay, TxLink, UsdcAmount, JsonViewer, WalletSelector, ReputationBadge
    layout/                  # Navbar
  lib/
    wallet/WalletProvider.tsx     # Demo wallet (sessionStorage) + browser wallet (MetaMask)
    protocol-inspector/context.tsx # Inspector event bus + auto-tab-switching
    api/payment-flow.ts           # Decomposed x402 client flow with inspector hooks
    utils.ts                      # cn(), shortenAddress(), formatUsdc()
  instrumentation.ts         # Registers service types, inits DB, starts event listener on server boot
```

### Key Configuration

- **`next.config.ts`**: webpack aliases (`@server/` → `../src/server/`, `@shared/` → `../src/shared/`), `extensionAlias` (`.js` → `.ts` for existing server code), `serverExternalPackages: ['better-sqlite3']`, viem deduplication
- **`tsconfig.json`**: path aliases matching webpack, `moduleResolution: bundler`
- **`instrumentation.ts`**: runs once on server start — registers service types, initializes SQLite, starts event listener
- **Environment**: same vars as root `.env.example` plus `DEMO_MODE=true`

### Demo Web Technical Notes

- **Imports from parent `src/`**: Route handlers import `@server/services/orderService`, `@server/facilitator/verifier`, etc. directly. Existing server code uses `.js` extensions (Node ESM), resolved by webpack `extensionAlias` config.
- **Wallet**: `WalletProvider` manages ephemeral demo wallets (`generatePrivateKey()` stored in `sessionStorage`) and browser wallets (`window.ethereum`). Both expose viem `WalletClient`.
- **Protocol Inspector**: React context + 4-tab panel showing HTTP traffic, EIP-712 signatures, on-chain transactions, and escrow state machine. Events emitted by `payment-flow.ts` during the x402 flow.
- **No CORS needed**: API routes and pages are same-origin in Next.js.
- **Demo funding**: `POST /api/demo/fund` sends 10 USDC + 0.005 ETH from operator wallet. Rate-limited to 100 USDC/hr per IP+address. Requires `DEMO_MODE=true`.

## Key Technical Notes

- **`via_ir = true`** in `foundry.toml` is required — OpenZeppelin contracts cause "stack too deep" without it
- **`@types/express` v5**: `req.params` values are `string | string[]`, cast to `string` when needed
- **Foundry tests**: default `block.timestamp` is 1 (not 0); use explicit absolute timestamps with `vm.warp()` rather than relative offsets from captured `block.timestamp` (via_ir can change evaluation order)
- **ABI source of truth**: Foundry artifacts in `contracts/out/` → run `sync-abi` to regenerate `src/shared/abi.ts`
- **AutomationCompatibleInterface**: defined locally in `contracts/src/interfaces/` (Chainlink repo too large to install)
- **Workspaces**: root `package.json` has `"workspaces": ["demo-web"]`; run `bun install` from root to link

## Environment

Requires `.env` (see `.env.example`): `PRIVATE_KEY`, `ESCROW_VAULT_ADDRESS`, optionally `BASE_SEPOLIA_RPC` and `PORT`.

For `demo-web/`, copy these same vars into `demo-web/.env` and add `DEMO_MODE=true`.

## Constants

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
