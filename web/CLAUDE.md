# web

Next.js 15 App Router frontend for the Xenga escrow protocol. Deployed on **Vercel**. Pure frontend — no server-side logic, no SQLite, no chain interaction. All API calls go to the Express facilitator via `NEXT_PUBLIC_FACILITATOR_URL`.

## Build & Run

```bash
# Development (requires facilitator running on port 3000)
NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev

# Or set in .env.local:
# NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000
bun run dev

# Production build
bun run build
bun run start
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FACILITATOR_URL` | Yes (production) | URL of the Express facilitator (e.g. `https://facilitator.your-domain.com`). Empty for same-origin dev. |

## How It Works

### API Client (`lib/api/client.ts`)

All `fetch()` calls to the facilitator go through `facilitatorFetch()` or `facilitatorUrl()`. These prepend `NEXT_PUBLIC_FACILITATOR_URL` to the path. When the env var is empty (local dev), paths resolve to relative.

```typescript
import { facilitatorFetch, facilitatorUrl } from "@/lib/api/client";

// Simple JSON request
const res = await facilitatorFetch("/api/orders", { method: "POST", body: JSON.stringify(data) });

// When you need the full URL (e.g. custom headers)
const res = await fetch(facilitatorUrl(`/api/orders/${id}/pay`), { headers: { "X-PAYMENT": encoded } });
```

### `@shared/` Imports

The frontend imports types and pure functions from `src/shared/` via the `@shared/` webpack alias. These are client-safe — no server dependencies:

- `ReputationScore` type from `@shared/types`
- `buildReceiveAuthSigningParams()` from `@shared/eip712.js` — builds EIP-712 typed data for signing

### Xenga Payment Flow (`lib/api/payment-flow.ts`)

Three composable functions, each accepting an optional `emit` callback for the Protocol Inspector:

| Step | Function | What happens |
|---|---|---|
| 1. Request | `requestPayment(orderId)` | POSTs without payment header → gets 402 with payment requirements |
| 2. Sign | `signPayment(walletClient, paymentRequired)` | Builds EIP-712 typed data, calls `walletClient.signTypedData()` |
| 3. Submit | `submitPayment(orderId, payload)` | Retries with `X-PAYMENT` header → gets 200 with escrow confirmation |

## Wallet System (`lib/wallet/WalletProvider.tsx`)

React context providing two wallet modes:

**Demo Wallet**: `generatePrivateKey()` stored in `sessionStorage`. Fund via facilitator's `/api/demo/fund` endpoint.

**Browser Wallet (MetaMask)**: Requests `eth_requestAccounts`, auto-switches to Base Sepolia.

Both expose: `address`, `walletClient`, `publicClient`, `refreshBalances()`, `usdcBalance`, `ethBalance`.

## Protocol Inspector (`lib/protocol-inspector/context.tsx`)

React context + `useReducer` event bus that visualizes the xenga flow in real time. 4 tabs: HTTP, Signatures, On-Chain, State. Auto-switches tabs based on event type.

## Wallet Auth Client (`lib/api/wallet-auth.ts`)

For dashboard API calls that require wallet identity verification. Signs `xenga-auth:{path}:{timestamp}` and attaches auth headers.

```typescript
import { authenticatedFetch } from "@/lib/api/wallet-auth";

// Adds X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP headers
const res = await authenticatedFetch("/api/orders?seller=0x...", walletClient, address);

// With POST body
const res = await authenticatedFetch("/api/sellers", walletClient, address, {
  method: "POST",
  body: JSON.stringify({ name: "My Store" }),
});
```

**Note:** Only use `authenticatedFetch` for routes that require `walletAuth()` middleware. Public routes (reputation, health) should use `facilitatorFetch` directly to avoid unnecessary signature prompts for browser wallet users.

## Key Components

### `PaymentFlow` (marketplace)

State machine: `select → create_order → request_payment → sign → submit → escrowed → delivery → complete`. Each payment sub-step is a separate user click. State persists to `sessionStorage` for mid-flow refresh recovery.

### `AgentTerminal` (agent service)

Scripted auto-advancing terminal UI that plays through the agent-service flow automatically.

### Seller Dashboard (`app/dashboard/`)

Self-service dashboard with sidebar layout and wallet gate. Pages:
- **Overview** (`page.tsx`): Stats row (active escrows, pending release, total revenue, reputation), activity feed, quick action cards
- **Orders** (`orders/page.tsx`): Filter tabs (All/Active/Completed/Disputed), expandable rows with escrow details, on-chain Confirm Delivery + Refund buttons via `walletClient.writeContract`
- **Settings** (`settings/page.tsx`): Seller profile registration/update (display name + payout address)
- **API Keys** (`api-keys/page.tsx`): Create, list, revoke API keys. Raw key shown once on creation

Key components in `components/dashboard/`:
- `WalletGate` — renders connect prompt when no wallet connected
- `DashboardSidebar` — responsive sidebar with mobile hamburger overlay
- `OrderActions` — fetches escrow vault address from `/api/health`, calls `confirmDelivery`/`refund` directly on-chain
- `OrderTable` — reusable table with filter tabs and `actionSlot` render prop

## Facilitator API Routes (called from frontend)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | GET | — | Server status + escrow contract address |
| `/api/orders` | GET | apiKey or wallet† | List orders (`?seller=` for dashboard, `?status=` for filtering) |
| `/api/orders` | POST | apiKey | Create order |
| `/api/orders/:id/pay` | POST | escrow | Xenga payment flow (402 or 200) |
| `/api/orders/:id/confirm-delivery` | POST | apiKey or wallet | Confirm delivery on-chain (wallet: seller only) |
| `/api/disputes/:orderId` | POST | wallet | File a dispute |
| `/api/disputes/:id/resolve` | POST | wallet | Resolve dispute (arbiter) |
| `/api/escrows/:escrowId` | GET | — | On-chain escrow state |
| `/api/reputation/:address` | GET | — | Reputation score |
| `/api/sellers` | POST | wallet | Register/update seller profile (upsert) |
| `/api/sellers/:address` | GET | — | Get seller profile |
| `/api/seller-api-keys` | POST | wallet | Create API key |
| `/api/seller-api-keys` | GET | wallet | List active API keys |
| `/api/seller-api-keys/:id` | DELETE | wallet | Revoke API key |
| `/api/demo/fund` | POST | — | Faucet (10 USDC + 0.005 ETH) |

†`GET /api/orders?seller=` with wallet headers verifies signer matches the seller param. Without wallet headers, allowed in open mode (no API keys configured).

## Technical Notes

- **No server-side code**: The web app is a pure client. No `instrumentation.ts`, no `@server/` imports, no `better-sqlite3`.
- **`@shared/` is client-safe**: Only types and pure functions. Webpack alias + TS loader extension in `next.config.ts` make it work.
- **CORS required**: Frontend and facilitator are on different origins. The Express server has `CORS_ORIGIN` env var.
- **`isMockChainClient`**: `lib/env/isMockChainClient.ts` reads `NEXT_PUBLIC_MOCK_CHAIN` for UI branching (shows "Mock Chain" vs "Base Sepolia"). Defaults to `false` when unset.
- **Session persistence**: Wallet private key and marketplace flow state survive page refreshes via `sessionStorage`.
- **Workspaces**: `web` is a workspace in root `package.json`. Run `bun install` from root to link.
