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

x402 HTTP 402 escrow payment system on Base Sepolia using USDC (ERC-3009 gasless transfers).

**Four layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/server/`** — Express server: x402 middleware intercepts requests, returns 402 with payment requirements, verifies EIP-712 signatures, settles on-chain
- **`src/client/`** — SDK: `escrowFetch` wraps fetch to handle the 402 flow automatically, `escrowScheme` handles EIP-712 ReceiveWithAuthorization signing
- **`demo-web/`** — Next.js 15 App Router demo: interactive webpage showcasing the x402 escrow flow with Protocol Inspector

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`).

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
    explorer/page.tsx        # Escrow explorer (on-chain lookup)
    api/                     # Route Handlers (replace Express routes)
      health/                # GET — server status
      orders/                # GET/POST orders
      orders/[id]/pay/       # POST — core x402 payment flow
      orders/[id]/confirm-delivery/  # POST — demo delivery confirmation
      disputes/              # POST dispute, POST resolve
      escrows/[escrowId]/    # GET on-chain state
      demo/fund/             # POST — faucet for demo wallets
  components/
    landing/                 # Hero, ProtocolFlow, DemoCards, HowItWorks, ComparisonTable, DevSection, Footer
    marketplace/             # PaymentFlow, ProductGrid, StepTracker, SellerPanel
    agent/                   # AgentTerminal
    protocol-inspector/      # InspectorPanel + 4 tab components
    ui/                      # Badge, AddressDisplay, TxLink, UsdcAmount, JsonViewer, WalletSelector
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
