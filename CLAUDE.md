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

On-chain escrow and reputation system on Base Sepolia using USDC (ERC-3009 gasless transfers). The x402 protocol provides the HTTP integration layer.

**Four layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine + stats), SessionEscrow (session micropayments), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/server/`** — Facilitator server: settles escrows on-chain, computes reputation scores, serves API. Includes x402 payment middleware for HTTP-triggered escrow creation.
- **`src/client/`** — Client SDK: EIP-712 signing, reputation lookup (`getReputation()`), and x402 payment flow (`escrowFetch` with optional `onSellerReputation` callback)
- **`demo-web/`** — Next.js 15 App Router demo: interactive escrow lifecycle with Protocol Inspector

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`). Note: `getBuyerStats`/`buyerStats` ABI entries were manually added pending a `sync-abi` run after contract redeployment.

### Escrow Lifecycle (On-Chain)

```
None → Active → DeliveryConfirmed → Completed      (buyer releases)
         │             │              AutoReleased   (timeout, anyone triggers)
         │             └────────────→ Disputed ──→ Resolved (arbiter splits %)
         └───────────────────────────→ Refunded   (seller voluntary / arbiter)
```

- **Active**: escrow created, USDC locked. Buyer can release anytime, seller can confirm delivery or refund.
- **DeliveryConfirmed**: seller confirmed delivery, dispute window starts. Buyer can release or dispute.
- **AutoRelease timing**: From Active state, requires `releaseWindow + disputeWindow`. From DeliveryConfirmed, requires `releaseWindow` from creation AND `disputeWindow` from delivery confirmation.
- **Dispute timing**: From DeliveryConfirmed, within `disputeWindow` of confirmation. From Active, between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation.
- **disputeWindow**: Owner-settable global default (default: 3 days, bounds: 1 hour–30 days). Set via `EscrowVault.setDisputeWindow()`. Stored per-escrow at creation — existing escrows keep their original value.
- **Resolved**: arbiter splits funds by buyer percentage (0-100). Fee goes to feeRecipient, split applies to `amount - fee`.
- **Refunded**: buyer gets full deposit back including fee — facilitator absorbs cost.

### Reputation System

On-chain credit scoring for agents/wallets, computed from escrow transaction history. The facilitator tracks both `sellerStats` and `buyerStats` on-chain (in `EscrowVault.sol`), and the server computes weighted reputation scores from this data.

**Architecture:**
- **On-chain**: `buyerStats[address]` and `sellerStats[address]` mappings in EscrowVault track totalEscrows, completedCount, disputedCount, refundedCount, resolvedCount, and amounts. Raw data is permissionless — anyone can read and compute their own scores.
- **Off-chain**: `reputationService.ts` computes weighted scores (0-100) with confidence levels, cached 60s in-memory.
- **Dynamic params**: Service types use `adjustParams()` to shorten/extend release windows based on counterparty reputation (e.g. high-trust pairs get 3-day instead of 7-day marketplace window).
- **Client integration**: Seller reputation is included in payment responses; clients can check via `onSellerReputation` callback before paying.

**Scoring formulas** (each component's max weight sums to 100):
- Seller: completionRate×40 + (1-disputeRate)×25 + (1-refundRate)×15 + resolutionFairness×10 + volumeBonus (0-10, log-scaled)
- Buyer: completionRate×45 + (1-disputeRate)×25 + (1-frivolousDisputeRate)×20 + volumeBonus (0-10, log-scaled)
- Scores are clamped to [0, 100]. `resolutionFairness` defaults to 1.0 (clean record) when seller has no resolved disputes.
- Overall score: escrow-count-weighted average of seller + buyer scores (not simple average).
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

### Post-Deployment Configuration

All owner-callable setters. Ownership uses `Ownable2Step` — transfer requires a 2-step confirmation (e.g. `transferOwnership(gnosisSafeAddress)` then `acceptOwnership()` from new owner).

| Config | Contract | Setter | Default | Bounds |
|---|---|---|---|---|
| Arbiter address | EscrowVault | `setArbiter(address)` | deployer | — |
| Fee config | EscrowVault | `setFeeConfig(recipient, bps, flat)` | 0 | max 10% + 50 USDC |
| Dispute window | EscrowVault | `setDisputeWindow(uint256)` | 3 days | 1 hour – 30 days |
| Pause / unpause | EscrowVault, SessionEscrow | `pause()` / `unpause()` | unpaused | — |
| Facilitator address | SessionEscrow | `setFacilitator(address)` | — | — |
| Chainlink forwarder | AutoReleaseKeeper | `setForwarder(address)` | — | — |
| Max batch size | AutoReleaseKeeper | `setMaxBatchSize(uint256)` | 20 | 1 – 100 |

**Design note — why `releaseWindow` is per-escrow but `disputeWindow` is a global default:**
`releaseWindow` is a business timing parameter that must vary by service type (1h for agent-service, 7d for marketplace). It is computed by the server per-escrow from service types + reputation and stored in the escrow struct. `disputeWindow` is a consumer protection parameter — a uniform "cooling off period" — set globally by the owner so it cannot be manipulated by the facilitator on a per-escrow basis.

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
- **`disputeWindow` vs `releaseWindow`**: `releaseWindow` is per-escrow (set at creation from service type config). `disputeWindow` is a global owner-set default (applies to all new escrows, stored in each escrow struct at creation). Changing it post-deployment does not affect existing escrows.
- **AutomationCompatibleInterface**: defined locally in `contracts/src/interfaces/` (Chainlink repo too large to install)
- **Workspaces**: root `package.json` has `"workspaces": ["demo-web"]`; run `bun install` from root to link

## Environment

Requires `.env` (see `.env.example`): `PRIVATE_KEY`, `ESCROW_VAULT_ADDRESS`, optionally `BASE_SEPOLIA_RPC` and `PORT`.

For `demo-web/`, copy these same vars into `demo-web/.env` and add `DEMO_MODE=true`.

## Constants

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
