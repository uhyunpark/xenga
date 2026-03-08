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
| `NEXT_PUBLIC_FACILITATOR_URL` | Yes (production) | URL of the Express facilitator (e.g. `https://api.xenga.xyz`). Empty for same-origin dev. |

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

React context managing demo wallets. The UI exposes a single "Create Demo Wallet" button (no dropdown, no decision point).

**Demo Wallet**: `generatePrivateKey()` stored in `sessionStorage`. Auto-reconnects on refresh. Fund via facilitator's `/api/demo/fund` endpoint.

Browser wallet support (`connectBrowser`) is retained in `WalletProvider` for future production use but not exposed in the demo UI.

Exposes: `address`, `walletClient`, `publicClient`, `refreshBalances()`, `usdcBalance`, `ethBalance`.

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

### Playground (`app/playground/`)

Demo hub at `/playground` with cards linking to two demos. Old URLs (`/agent`, `/marketplace`) redirect here.
- `/playground/agent` — Agent service demo (auto-advancing terminal)
- `/playground/marketplace` — Human escrow demo (interactive step-by-step)

Demo pages use demo wallets internally (no wallet UI in the header). Browser wallets are only used in the dashboard.

### `PaymentFlow` (marketplace)

State machine: `select → create_order → request_payment → sign → submit → escrowed → delivery → complete`. Each payment sub-step is a separate user click. State persists to `sessionStorage` for mid-flow refresh recovery.

### `AgentTerminal` (agent service)

Scripted auto-advancing terminal UI that plays through the agent-service flow automatically.

### Seller Dashboard (`app/dashboard/`)

Self-service dashboard with sidebar layout and wallet gate. Pages:
- **Overview** (`page.tsx`): Stats row (active escrows, pending release, total revenue, reputation), activity feed, quick action cards
- **Orders** (`orders/page.tsx`): Filter tabs (All/Active/Completed/Disputed), expandable rows with escrow details, on-chain Confirm Delivery + Refund buttons via `walletClient.writeContract`
- **Settings** (`settings/page.tsx`): Seller profile registration/update (display name + editable payout address)
- **API Keys** (`api-keys/page.tsx`): Create, list, revoke API keys. Raw key shown once on creation. Keys are validated in `apiKeyAuth()` middleware.
- **Webhooks** (`webhooks/page.tsx`): Register, list, delete webhook endpoints. Event type selection, editable secret with Generate button.
- **Payment Links** (`payment-links/page.tsx`): Create, list, deactivate payment links. Copy URL to share with buyers.

### Payment Link Checkout (`app/pay/[id]/`)

Public standalone checkout page for payment links. Uses `WalletProvider mode="demo"` — buyers get an ephemeral demo wallet, funded automatically, and pay through the standard xenga flow. No dashboard layout, no wallet gate. Component: `PaymentLinkCheckout`.

Key components in `components/dashboard/`:
- `WalletGate` — renders connect prompt when no wallet connected
- `DashboardSidebar` — responsive sidebar with mobile hamburger overlay
- `OrderActions` — calls facilitator API for `confirmDelivery`/`refund` (gas-free for sellers, uses session JWT auth)
- `OrderTable` — reusable table with filter tabs and `actionSlot` render prop
- `WebhookManager` — CRUD for webhook endpoints with event type checkboxes
- `PaymentLinkManager` — CRUD for payment links with copy URL and deactivate

## Facilitator API Routes (called from frontend)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | GET | — | Server status + escrow contract address |
| `/api/orders` | GET | apiKey or wallet† | List orders (`?seller=` for dashboard, `?status=` for filtering) |
| `/api/orders` | POST | apiKey | Create order |
| `/api/orders/:id/pay` | POST | escrow | Xenga payment flow (402 or 200) |
| `/api/orders/:id/confirm-delivery` | POST | apiKey or session | Confirm delivery on-chain (session: seller only) |
| `/api/orders/:id/refund` | POST | apiKey or session | Refund buyer on-chain (session: seller only) |
| `/api/disputes/:orderId` | POST | wallet | File a dispute |
| `/api/disputes/:id/resolve` | POST | wallet | Resolve dispute (arbiter) |
| `/api/escrows/:escrowId` | GET | — | On-chain escrow state |
| `/api/reputation/:address` | GET | — | Reputation score |
| `/api/sellers` | POST | wallet | Register/update seller profile (upsert) |
| `/api/sellers/:address` | GET | — | Get seller profile |
| `/api/seller-api-keys` | POST | wallet | Create API key |
| `/api/seller-api-keys` | GET | wallet | List active API keys |
| `/api/seller-api-keys/:id` | DELETE | wallet | Revoke API key |
| `/api/webhooks` | POST | apiKey or session | Register webhook endpoint |
| `/api/webhooks` | GET | apiKey or session | List seller's webhooks |
| `/api/webhooks/:id` | DELETE | apiKey or session | Delete webhook |
| `/api/payment-links` | POST | session | Create payment link |
| `/api/payment-links` | GET | session | List seller's payment links |
| `/api/payment-links/:id/deactivate` | POST | session | Deactivate payment link |
| `/api/payment-links/:id/details` | GET | — | Public payment link details |
| `/api/payment-links/:id/checkout` | POST | — (rate limited) | Create order from payment link |
| `/api/demo/fund` | POST | — | Faucet (10 USDC + 0.005 ETH) |

†`GET /api/orders?seller=` with wallet headers verifies signer matches the seller param. Without wallet headers, allowed in open mode (no API keys configured).

## Technical Notes

- **No server-side code**: The web app is a pure client. No `instrumentation.ts`, no `@server/` imports, no `better-sqlite3`.
- **`@shared/` is client-safe**: Only types and pure functions. Webpack alias + TS loader extension in `next.config.ts` make it work.
- **CORS required**: Frontend and facilitator are on different origins. The Express server has `CORS_ORIGIN` env var.
- **`isMockChainClient`**: `lib/env/isMockChainClient.ts` reads `NEXT_PUBLIC_MOCK_CHAIN` for UI branching (shows "Mock Chain" vs "Base Sepolia"). Defaults to `false` when unset.
- **Session persistence**: Wallet private key and marketplace flow state survive page refreshes via `sessionStorage`.
- **Workspaces**: `web` is a workspace in root `package.json`. Run `bun install` from root to link.
