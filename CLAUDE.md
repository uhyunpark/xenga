# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Facilitator (Express + SQLite) — handles all chain interaction
bun run dev                    # Dev mode with watch (port 3000)
bun run start                  # Production start

# Web (Next.js 15) — pure frontend, calls facilitator API
cd web && bun run dev          # Dev mode (port 3001)
cd web && bun run build        # Production build
cd web && bun run start        # Production start

# Local development (two terminals):
# Terminal 1: bun run dev
# Terminal 2: cd web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev

# Contracts (Foundry)
bun run build:contracts        # forge build (from contracts/)
bun run test:contracts         # forge test (from contracts/)
cd contracts && forge test --match-test test_specificName  # Run single test
cd contracts && forge test -vvvv  # Verbose output with traces

# ABI sync (run after contract changes)
bun run build:contracts && bun run sync-abi

# Docker (facilitator only)
docker build -t xenga-facilitator .
docker run -p 8080:8080 --env-file .env xenga-facilitator
```

## Architecture

On-chain escrow and reputation system on Base Sepolia using USDC (ERC-3009 gasless transfers). The x402 protocol provides the HTTP integration layer.

**Split deployment:**
- **`web/`** — Next.js 15 frontend deployed on **Vercel**. Pure client-side: pages, wallet management, EIP-712 signing, Protocol Inspector. Calls the facilitator API via `NEXT_PUBLIC_FACILITATOR_URL`.
- **`src/server/`** — Express facilitator deployed on **GCP Cloud Run**. Handles all chain interaction: settlement, event listening, reputation, order management, SQLite DB. Runs with `PRIVATE_KEY` for gas.

```
Vercel (web/)                    GCP Cloud Run (src/server/)
┌──────────────────┐             ┌──────────────────────────┐
│ Next.js Frontend │   fetch     │ Express Facilitator      │
│ Pages + Signing  │────────────>│ REST API + Chain + SQLite│
└──────────────────┘   CORS      └──────────────────────────┘
        │                                   │
        │ signTypedData                     │ PRIVATE_KEY (gas)
        ▼                                   ▼
   User's Browser                  EscrowVault (Base Sepolia)
```

**Other layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine + stats), SessionEscrow (session micropayments), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/client/`** — Client SDK: EIP-712 signing, reputation lookup (`getReputation()`), and x402 payment flow (`escrowFetch` with optional `onSellerReputation` callback)

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`). The web app imports `@shared/` via webpack alias for types and EIP-712 signing functions (client-safe, no server deps).

### Escrow Lifecycle (On-Chain)

```
None → Active → DeliveryConfirmed → Completed      (buyer releases)
         │             │              AutoReleased   (timeout, anyone triggers)
         │             └────────────→ Disputed ──→ Resolved (arbiter splits %)
         └───────────────────────────→ Refunded   (seller voluntary / arbiter)
```

- **Active**: escrow created, USDC locked. Buyer can release anytime, seller can confirm delivery or refund.
- **DeliveryConfirmed**: seller confirmed delivery, dispute window (3 days) starts. Buyer can release or dispute.
- **AutoRelease timing**: From Active state, requires `releaseWindow + disputeWindow`. From DeliveryConfirmed, requires `releaseWindow` from creation AND `disputeWindow` from delivery confirmation.
- **Dispute timing**: From DeliveryConfirmed, within `disputeWindow` of confirmation. From Active, between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation.
- **Resolved**: arbiter splits funds by buyer percentage (0-100). Fee goes to feeRecipient, split applies to `amount - fee`.
- **Refunded**: buyer gets full deposit back including fee — facilitator absorbs cost.

### Reputation System

On-chain credit scoring for agents/wallets, computed from escrow transaction history. The facilitator tracks both `sellerStats` and `buyerStats` on-chain (in `EscrowVault.sol`), and the server computes weighted reputation scores from this data.

**Architecture:**
- **On-chain**: `buyerStats[address]` and `sellerStats[address]` mappings in EscrowVault track totalEscrows, completedCount, disputedCount, refundedCount, resolvedCount, and amounts. Raw data is permissionless — anyone can read and compute their own scores.
- **Off-chain**: `reputationService.ts` computes weighted scores (0-100) with confidence levels, cached 60s in-memory.
- **Dynamic params**: Service types use `adjustParams()` to shorten/extend release windows based on counterparty reputation (e.g. high-trust pairs get 3-day instead of 7-day marketplace window).
- **Client integration**: Seller reputation is included in payment responses; clients can check via `onSellerReputation` callback before paying.

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
- `feeBps`, `flatFee`, and `feeRecipient` are global contract state, set by owner via `setFeeConfig()`
- Fee is computed at escrow creation: `fee = (amount * feeBps) / 10000 + flatFee`, stored in `Escrow.facilitatorFee`
- The percentage component (`feeBps`) covers facilitator profit/margin; the fixed component (`flatFee`) covers gas costs — similar to Stripe's `2.9% + $0.30` model
- Buyer pays exactly `orderPrice` — no amount inflation
- On release/autoRelease: seller gets `amount - fee`, feeRecipient gets `fee`
- On refund: buyer gets full `amount` back (facilitator absorbs cost)
- On dispute resolution: fee goes to feeRecipient, `buyerPct` split applies to `amount - fee`
- `MAX_FEE_BPS = 1000` (10% cap), `MAX_FLAT_FEE = 50_000_000` (50 USDC cap)
- Safety guards: `if (fee >= amount) revert InvalidFee()` prevents tiny escrows where fee exceeds deposit; `if (fee > 0 && feeRecipient != address(0))` prevents revert if feeRecipient changed to zero while escrows are active
- Stats track gross `amount` (not net) — reputation scoring uses transaction volume

**Config:** `FEE_BPS`, `FEE_FLAT_USDC`, and `FEE_RECIPIENT` env vars (see `.env.example`). Defaults: 0 (no fee).

### Service Types

Service types (`src/server/service-types/`) define escrow parameters per use case:
- **marketplace**: 7-day release window, manual delivery confirmation
- **agent-service**: 1-hour release window, auto-verify delivery

Each service type can implement `adjustParams(params, reputation)` to dynamically adjust escrow parameters (e.g. release window) based on counterparty reputation scores.

### x402 Integration Layer

HTTP transport for triggering escrow creation. The contracts can also be called directly.

1. Client POSTs to a payment-protected endpoint without `X-PAYMENT` header
2. Middleware returns **402** with `X-PAYMENT-REQUIRED` header (base64 JSON: amount, token, escrow address, order details)
3. Client signs ERC-3009 `ReceiveWithAuthorization` via EIP-712 (USDC gasless transfer to EscrowVault)
4. Client retries with `X-PAYMENT` header containing the signature
5. Server verifies signature off-chain (`facilitator/verifier.ts`), submits `createEscrowWithAuth` on-chain (`facilitator/settler.ts`)
6. Returns **200** with `X-PAYMENT-RESPONSE` header

## Web (`web/`)

Next.js 15 App Router frontend. Deployed on Vercel. Calls the Express facilitator API for all backend operations — no server-side code, no SQLite, no chain interaction.

### Structure

```
web/
  app/
    page.tsx                 # Landing page
    marketplace/page.tsx     # Interactive marketplace demo
    agent/page.tsx           # Auto-advancing agent service demo
  components/
    landing/                 # Hero, ProtocolFlow, DemoCards, HowItWorks, Footer
    marketplace/             # PaymentFlow, ProductGrid, StepTracker, SellerPanel
    agent/                   # AgentTerminal
    protocol-inspector/      # InspectorPanel + 4 tab components
    ui/                      # Badge, AddressDisplay, TxLink, UsdcAmount, JsonViewer, WalletSelector, ReputationBadge
    layout/                  # Navbar
  lib/
    api/client.ts                 # facilitatorFetch() + facilitatorUrl() — all API calls go through here
    api/payment-flow.ts           # Decomposed x402 client flow with inspector hooks
    wallet/WalletProvider.tsx     # Demo wallet (sessionStorage) + browser wallet (MetaMask)
    protocol-inspector/context.tsx # Inspector event bus + auto-tab-switching
    env/isMockChainClient.ts      # Client-side mock chain detection
    utils.ts                      # cn(), shortenAddress(), formatUsdc()
```

### Key Configuration

- **`next.config.ts`**: webpack alias (`@shared/` → `../src/shared/`), `extensionAlias` (`.js` → `.ts` for shared code), TS loader for `../src/shared`
- **`tsconfig.json`**: path alias `@shared/*` → `../src/shared/*`, `moduleResolution: bundler`
- **Environment**: `NEXT_PUBLIC_FACILITATOR_URL` (required for production, empty for same-origin dev)

### Web Technical Notes

- **API client**: All `fetch()` calls go through `lib/api/client.ts` which prepends `NEXT_PUBLIC_FACILITATOR_URL`. When empty (local dev), paths are relative.
- **`@shared/` imports**: Frontend imports types (`ReputationScore`) and pure functions (`buildReceiveAuthSigningParams`) from `src/shared/` via webpack alias. These have no server dependencies.
- **Wallet**: `WalletProvider` manages ephemeral demo wallets (`generatePrivateKey()` stored in `sessionStorage`) and browser wallets (`window.ethereum`). Both expose viem `WalletClient`.
- **Protocol Inspector**: React context + 4-tab panel showing HTTP traffic, EIP-712 signatures, on-chain transactions, and escrow state machine. Events emitted by `payment-flow.ts` during the x402 flow.
- **CORS**: Required since frontend and facilitator are on different origins. Express facilitator has `CORS_ORIGIN` env var (defaults to `*`).
- **Demo funding**: `POST /api/demo/fund` on the facilitator sends 10 USDC + 0.005 ETH from operator wallet. Rate-limited to 100 USDC/hr per IP+address. Requires `DEMO_MODE=true`.

## Key Technical Notes

- **`via_ir = true`** in `foundry.toml` is required — OpenZeppelin contracts cause "stack too deep" without it
- **`@types/express` v5**: `req.params` values are `string | string[]`, cast to `string` when needed
- **Foundry tests**: default `block.timestamp` is 1 (not 0); use explicit absolute timestamps with `vm.warp()` rather than relative offsets from captured `block.timestamp` (via_ir can change evaluation order)
- **ABI source of truth**: Foundry artifacts in `contracts/out/` → run `sync-abi` to regenerate `src/shared/abi.ts`
- **AutomationCompatibleInterface**: defined locally in `contracts/src/interfaces/` (Chainlink repo too large to install)
- **Workspaces**: root `package.json` has `"workspaces": ["packages/*", "web"]`; run `bun install` from root to link

## Environment

### Facilitator (`src/server/`)
Requires `.env` (see `.env.example`): `PRIVATE_KEY`, `ESCROW_VAULT_ADDRESS`, optionally `BASE_SEPOLIA_RPC`, `PORT`, `CORS_ORIGIN`, `DEMO_MODE`.

### Web (`web/`)
Requires `NEXT_PUBLIC_FACILITATOR_URL` pointing to the facilitator. For local dev, set to `http://localhost:3000` or leave empty if running on same origin.

### Docker
```bash
docker build -t xenga-facilitator .
docker run -p 8080:8080 --env-file .env xenga-facilitator
```

## Constants

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
