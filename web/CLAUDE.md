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

React context managing demo wallets. The UI exposes a single "Create Demo Wallet" button (no dropdown, no decision point).

**Demo Wallet**: `generatePrivateKey()` stored in `sessionStorage`. Auto-reconnects on refresh. Fund via facilitator's `/api/demo/fund` endpoint.

Browser wallet support (`connectBrowser`) is retained in `WalletProvider` for future production use but not exposed in the demo UI.

Exposes: `address`, `walletClient`, `publicClient`, `refreshBalances()`, `usdcBalance`, `ethBalance`.

## Protocol Inspector (`lib/protocol-inspector/context.tsx`)

React context + `useReducer` event bus that visualizes the xenga flow in real time. 4 tabs: HTTP, Signatures, On-Chain, State. Auto-switches tabs based on event type.

## Key Components

### `PaymentFlow` (marketplace)

State machine: `select → create_order → request_payment → sign → submit → escrowed → delivery → complete`. Each payment sub-step is a separate user click. State persists to `sessionStorage` for mid-flow refresh recovery.

### `AgentTerminal` (agent service)

Scripted auto-advancing terminal UI that plays through the agent-service flow automatically.

## Facilitator API Routes (called from frontend)

| Route | Method | Description |
|---|---|---|
| `/api/health` | GET | Server status + operator address |
| `/api/orders` | GET | List orders (filterable by `?status=`) |
| `/api/orders` | POST | Create order |
| `/api/orders/:id/pay` | POST | Xenga payment flow (402 or 200) |
| `/api/orders/:id/confirm-delivery` | POST | Confirm delivery on-chain |
| `/api/disputes/:orderId` | POST | File a dispute |
| `/api/disputes/:id/resolve` | POST | Resolve dispute (arbiter) |
| `/api/escrows/:escrowId` | GET | On-chain escrow state |
| `/api/reputation/:address` | GET | Reputation score |
| `/api/demo/fund` | POST | Faucet (10 USDC + 0.005 ETH) |

## Technical Notes

- **No server-side code**: The web app is a pure client. No `instrumentation.ts`, no `@server/` imports, no `better-sqlite3`.
- **`@shared/` is client-safe**: Only types and pure functions. Webpack alias + TS loader extension in `next.config.ts` make it work.
- **CORS required**: Frontend and facilitator are on different origins. The Express server has `CORS_ORIGIN` env var.
- **`isMockChainClient`**: `lib/env/isMockChainClient.ts` reads `NEXT_PUBLIC_MOCK_CHAIN` for UI branching (shows "Mock Chain" vs "Base Sepolia"). Defaults to `false` when unset.
- **Session persistence**: Wallet private key and marketplace flow state survive page refreshes via `sessionStorage`.
- **Workspaces**: `web` is a workspace in root `package.json`. Run `bun install` from root to link.
