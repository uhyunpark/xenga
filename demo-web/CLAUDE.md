# demo-web

Next.js 15 App Router app that demonstrates the escrow lifecycle and reputation system. Imports existing server logic from the parent `src/server/` via webpack aliases — no code duplication.

## Build & Run

```bash
bun run dev     # Dev mode on port 3000
bun run build   # Production build
bun run start   # Production start
```

### Environment Variables

Copy the root `.env.example` vars into `demo-web/.env`:

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes (real mode) | Operator wallet private key |
| `ESCROW_VAULT_ADDRESS` | Yes (real mode) | Deployed EscrowVault address |
| `BASE_SEPOLIA_RPC` | No | RPC URL (defaults to public endpoint) |
| `DEMO_MODE` | Yes | Set `true` to enable faucet endpoint |
| `MOCK_CHAIN` | No | Set `true` for offline dev without a real chain |

## How It Works

### Bootstrap (`instrumentation.ts`)

Next.js calls `register()` once on server start. It:

1. Dynamically imports server code (`@server/...`) — only in `nodejs` runtime, not edge
2. Validates config (skipped in mock mode)
3. Registers service types (marketplace, agent-service) and payment schemes (escrow)
4. Initializes SQLite via `getDb()`
5. Starts the chain event listener (no-op in mock mode)

### Webpack Alias Trick

The parent `src/server/` code is written for Node ESM with `.js` import extensions. `next.config.ts` makes this work in Next.js:

- **Path aliases**: `@server/` → `../src/server/`, `@shared/` → `../src/shared/`
- **Extension alias**: `.js` → `[.ts, .tsx, .js, .jsx]` so `import foo from "./bar.js"` resolves `bar.ts`
- **Include rule**: Extends Next.js's TypeScript loader to process files from `../src/`
- **viem dedup**: Forces a single copy of viem to prevent type conflicts
- **External packages**: `better-sqlite3` (native module) is excluded from bundling

## x402 Payment Flow (End-to-End)

The client flow lives in `lib/api/payment-flow.ts` as three composable functions. Each accepts an optional `emit` callback that feeds the Protocol Inspector.

| Step | Client (`payment-flow.ts`) | Server (`api/orders/[id]/pay/route.ts`) |
|---|---|---|
| 1. Request | `requestPayment(orderId)` — POSTs without `X-PAYMENT` header | Returns **402** with `X-PAYMENT-REQUIRED` header (base64 JSON: amount, token, escrow address) |
| 2. Sign | `signPayment(walletClient, paymentRequired)` — builds EIP-712 `ReceiveWithAuthorization` typed data, calls `walletClient.signTypedData()` | _(client-side only)_ |
| 3. Submit | `submitPayment(orderId, payload)` — retries POST with `X-PAYMENT` header (base64 payload) | Verifies signature off-chain → atomically claims order (`pending_payment`) → calls `chainAdapter.settleEscrow()` → returns **200** with `X-PAYMENT-RESPONSE` |

If the order was already paid, `requestPayment` throws `AlreadyPaidError` with the existing order data (idempotent).

## Chain Adapter

`lib/chain/` abstracts all on-chain operations behind a `ChainAdapter` interface, selected by `MOCK_CHAIN` env var.

### `RealChainAdapter` (default)

Delegates to the parent `src/server/` code: `settler.settleEscrow()`, `escrowService.getEscrow()`, `eventListener.startEventListener()`. Uses lazy singleton viem clients with the operator's private key. The `fundWallet()` method transfers 10 USDC + 0.005 ETH from the operator wallet. Interface methods: `settleEscrow`, `confirmDelivery`, `resolveDispute`, `getEscrow`, `isReleasable`, `fundWallet`, `startEventListener`.

### `MockChainAdapter` (`MOCK_CHAIN=true`)

In-memory escrow store (`mock-escrow-store.ts`). No RPC calls, no private key needed. Useful for:

- Frontend development without a testnet connection
- CI/testing
- Offline demos

Mock mode auto-verifies agent-service escrows after 5 seconds via `setTimeout`. Generates fake tx hashes. The client-side `WalletProvider` returns hardcoded balances (1 ETH, 1000 USDC) in mock mode.

## Wallet System (`lib/wallet/WalletProvider.tsx`)

React context providing two wallet modes:

### Demo Wallet

- Calls `generatePrivateKey()` from viem, stores in `sessionStorage` (key: `x402-demo-pk`)
- Same wallet persists across page refreshes within the tab
- Uses `createWalletClient` with HTTP transport to Base Sepolia
- Fund via `POST /api/demo/fund` (rate-limited: 100 USDC/hr per IP+address)

### Browser Wallet (MetaMask)

- Requests `eth_requestAccounts`, auto-switches to Base Sepolia (chain ID `0x14A34`)
- If chain not added, calls `wallet_addEthereumChain`
- Uses `createWalletClient` with `custom(window.ethereum)` transport

Both expose: `address`, `walletClient`, `publicClient`, `refreshBalances()`, `usdcBalance`, `ethBalance`.

## Protocol Inspector (`lib/protocol-inspector/context.tsx`)

React context + `useReducer` providing an event bus that visualizes the x402 flow in real time.

### Event Types

`http_request`, `http_response`, `eip712_sign`, `signature_result`, `tx_submitted`, `tx_confirmed`, `state_change`

### Auto-Tab Switching

When `addEvent` is called, the reducer automatically switches to the relevant tab:

- `http_*` → HTTP tab
- `eip712_sign` / `signature_result` → Signatures tab
- `tx_*` → On-Chain tab
- `state_change` → State tab (also updates `currentState`)

### How Events Flow

1. `PaymentFlow` component calls `requestPayment(orderId, inspector.addEvent)`
2. `payment-flow.ts` calls `emit?.({type: "http_request", ...})` at each step
3. `addEvent` dispatches to the reducer → event appended + tab switched
4. `InspectorPanel` renders events filtered by the active tab

## Key Components

### `PaymentFlow` (marketplace)

State machine driven by `useReducer`: `select → create_order → request_payment → sign → submit → escrowed → delivery → complete`.

**Multi-step user-driven flow**: Each payment sub-step is a separate user click:
1. **Request Payment** button → calls `requestPayment()`, stores `paymentRequired` in state
2. **Sign Authorization** button → shows 402 result inline (amount, escrow contract, release window), calls `signPayment()`, stores `paymentPayload` in state
3. **Submit Payment** button → shows signature inline (v, r, s), calls `submitPayment()`, transitions to escrowed

Each step displays meaningful protocol data after completion (not just spinners). Users control the pace and can read the Protocol Inspector between steps. Uses `Badge` and `AddressDisplay` components for inline data display. `formatReleaseWindow()` converts seconds to human-readable durations.

**State persistence**: Persists to `sessionStorage` (key: `x402-marketplace-state`) including `paymentRequired` and `paymentPayload` for mid-flow refresh recovery. On mount, validates the saved `orderId` against the server — if the order no longer exists (server restarted), clears stale state automatically.

After escrow creation, auto-triggers `confirm-delivery` and polls order status every 3s.

### `AgentTerminal` (agent service)

Scripted auto-advancing terminal UI that plays through the agent-service flow automatically.

### `InspectorPanel`

4-tab panel (HTTP, Signatures, On-Chain, State) with responsive layout — side panel on desktop, bottom drawer on mobile.

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/health` | GET | Server status |
| `/api/orders` | GET | List orders (filterable by `?status=`) |
| `/api/orders` | POST | Create order (title, price, serviceType, sellerAddress) |
| `/api/orders/[id]/pay` | POST | Core x402 flow — returns 402 or processes payment |
| `/api/orders/[id]/confirm-delivery` | POST | Seller confirms delivery (demo simulation) |
| `/api/disputes/[id]` | POST | File a dispute on an order |
| `/api/disputes/[id]/resolve` | POST | Arbiter resolves dispute (buyerPercentage) |
| `/api/escrows/[escrowId]` | GET | Read on-chain escrow state |
| `/api/reputation/[address]` | GET | Compute reputation score for any wallet address |
| `/api/reputation/[address]/history` | GET | Reputation history (query: `?days=90&bucket=7`) |
| `/api/demo/fund` | POST | Faucet — sends 10 USDC + 0.005 ETH (requires `DEMO_MODE=true`) |

## File Structure

```
demo-web/
  app/
    page.tsx                          # Landing page
    marketplace/page.tsx              # Interactive marketplace demo
    agent/page.tsx                    # Auto-advancing agent service demo
    api/                              # Route Handlers (replace Express routes)
  components/
    landing/                          # Hero, ProtocolFlow, DemoCards, HowItWorks, Footer
    marketplace/                      # PaymentFlow, ProductGrid, StepTracker, SellerPanel
    agent/                            # AgentTerminal
    protocol-inspector/               # InspectorPanel + 4 tab components
    ui/                               # Badge, AddressDisplay, TxLink, UsdcAmount, ReputationBadge, etc.
    layout/                           # Navbar
  lib/
    api/payment-flow.ts               # 3-step x402 client flow with inspector hooks
    chain/index.ts                    # ChainAdapter factory (real vs mock)
    chain/real-adapter.ts             # Delegates to src/server/ code
    chain/mock-adapter.ts             # In-memory mock for offline dev
    chain/mock-escrow-store.ts        # In-memory escrow state for mock mode
    wallet/WalletProvider.tsx          # Demo + browser wallet context
    protocol-inspector/context.tsx     # Inspector event bus + auto-tab switching
    utils.ts                          # cn(), shortenAddress(), formatUsdc()
  instrumentation.ts                  # Server bootstrap: service types, DB, event listener
  next.config.ts                      # Webpack aliases, extension alias, externals
```

## Technical Notes

- **Webpack config is load-bearing**: The alias and extension resolution in `next.config.ts` is what makes parent `src/` imports work. If you add new server imports, they should use `@server/` or `@shared/` prefixes.
- **Mock mode skips config validation**: No `PRIVATE_KEY` or `ESCROW_VAULT_ADDRESS` needed when `MOCK_CHAIN=true`.
- **Session persistence**: Both the wallet (private key) and marketplace flow state survive page refreshes via `sessionStorage`. Opening a new tab creates a fresh wallet. On mount, the marketplace validates the saved `orderId` against the server — stale state from a previous server session is automatically cleared.
- **`serverExternalPackages`**: `better-sqlite3` is a native Node module and must be excluded from webpack bundling.
- **No CORS needed**: API routes and pages are same-origin in Next.js.
- **Workspaces**: `demo-web` is a workspace in the root `package.json`. Run `bun install` from root to link dependencies.
- **`instrumentation.ts` has try-catch**: Bootstrap errors are logged to console. If routes return "Unknown service type", check the server console for `[instrumentation] Failed to initialize:` messages.
- **Disputes require `delivery_confirmed`**: The on-chain state machine requires `DeliveryConfirmed` before a dispute can be filed. The API enforces this — `escrowed` status is not disputable.
- **`@server/` and `@shared/` are server-only**: These webpack aliases resolve parent `src/` code that uses Node APIs. `"use client"` components cannot import from them — use API routes or pass data via props/context instead.
