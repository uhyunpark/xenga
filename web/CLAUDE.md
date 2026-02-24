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
| `NEXT_PUBLIC_MOCK_CHAIN` | No | Set to `"true"` to enable mock mode: hardcoded balances (1.0 ETH, 1000 USDC), no RPC calls, "simulated settlement" in UI. Defaults to `false`. |
| `NEXT_PUBLIC_BASE_URL` | No | Base URL for metadata/OpenGraph. Defaults to `https://xenga.xyz`. |

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

### x402 Payment Flow (`lib/api/payment-flow.ts`)

Three composable functions, each accepting an optional `emit` callback for the Protocol Inspector:

| Step | Function | What happens |
|---|---|---|
| 1. Request | `requestPayment(orderId)` | POSTs without payment header → gets 402 with payment requirements |
| 2. Sign | `signPayment(walletClient, paymentRequired)` | Builds EIP-712 typed data, calls `walletClient.signTypedData()` |
| 3. Submit | `submitPayment(orderId, payload)` | Retries with `X-PAYMENT` header → gets 200 with escrow confirmation |

## Wallet System (`lib/wallet/WalletProvider.tsx`)

React context providing two wallet modes:

**Demo Wallet**: `generatePrivateKey()` stored in `sessionStorage` (key: `x402-demo-pk`). Fund via facilitator's `/api/demo/fund` endpoint. Balance refresh reads USDC contract directly via `publicClient.readContract()` with inline ABI.

**Browser Wallet (MetaMask)**: Requests `eth_requestAccounts`, auto-switches to Base Sepolia (adds chain if missing via `wallet_addEthereumChain`). Uses `window.ethereum` custom transport.

Both expose: `address`, `walletClient`, `publicClient`, `refreshBalances()`, `usdcBalance`, `ethBalance`.

## Protocol Inspector (`lib/protocol-inspector/context.tsx`)

React context + `useReducer` event bus that visualizes the x402 flow in real time. 4 tabs: HTTP, Signatures, On-Chain, State. Auto-switches tabs based on event type (HTTP event → "http" tab, signature → "signatures" tab, etc.). Event IDs generated via `crypto.randomUUID()`.

## Styling

**Tailwind CSS 4** with `@tailwindcss/postcss`.

**Custom theme variables** defined in `globals.css` via `@theme` block:
- Colors: `--color-bg-primary`, `--color-border-default`, `--color-accent`, `--color-success`, `--color-error`, `--color-warning`, `--color-violet`
- Typography: `--font-sans` (Inter), `--font-mono` (IBM Plex Mono)
- Custom animations: `pulse-glow`, `inspector-flash`

**Reusable global classes:**
- `.panel-surface` — panel styling (border, shadow, rounded)
- `.code-block` — monospace display
- `.gradient-text`, `.glow-blue`, `.glow-purple` — decorative effects
- `.bg-grid` — background grid pattern

**`class-variance-authority` (CVA)** for type-safe component variants (e.g., `Badge` with `success | warning | error | info | default` variants).

Respects `prefers-reduced-motion` for accessibility. Custom scrollbar styling (webkit, 6px, subtle).

## Custom Hooks (`lib/hooks/`)

- **`useAutoScroll(ref, deps)`** — Auto-scrolls container to bottom when dependencies change. Suppresses when user manually scrolls up.
- **`useOperatorAddress()`** — Fetches and caches operator address from `/api/health`. Uses module-level cache to avoid duplicate fetches across components.

## State Management Patterns

**`PaymentFlow`** uses `useReducer` with rich action types:
- State includes: `step`, `product`, `orderId`, `escrowId`, `txHash`, `error`, `loading`, `paymentRequired`, `paymentPayload`, `completionReputation`, `disputeFiled`, `deliveryConfirmed`
- Session storage persistence (key: `x402-marketplace-state`) — saved on state changes, restored on mount
- Server-side order status is source of truth — client state syncs to server

**Polling pattern:** 3-second interval for delivery confirmation detection, max 60 attempts (~3 min). Uses `useRef` for interval tracking and cleanup.

**`AlreadyPaidError`** custom error class captures response data when order is already escrowed.

## Animation

**Framer Motion** for step transitions:
- `AnimatePresence` with `mode="wait"` prevents overlapping animations
- Common pattern: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}`
- Completion screen: `initial={{ opacity: 0, scale: 0.95 }}`

**CSS animations** in `globals.css`: `pulse-glow`, `inspector-flash` (600ms ease-out). Spinner: `animate-spin rounded-full border-2 border-white border-t-transparent`.

## Key Components

### `PaymentFlow` (marketplace)

State machine: `select → create_order → request_payment → sign → submit → escrowed → delivery → complete`. Each payment sub-step is a separate user click. State persists to `sessionStorage` for mid-flow refresh recovery.

### `AgentTerminal` (agent service)

Scripted auto-advancing terminal UI that plays through the agent-service flow automatically. Multi-scenario support: `happy | dispute | reputation | screening`. Terminal output with delay-based animation.

### UI Components (`components/ui/`)

- **`Badge`** — CVA-based variant component (success/warning/error/info/default)
- **`ReputationBadge`** — Async badge that fetches reputation via `facilitatorFetch`, displays score + confidence
- **`AddressDisplay`** — Shortened Ethereum address display
- **`TxLink`** — Block explorer link for transaction hashes
- **`JsonViewer`** — Formatted JSON display
- **`WalletSelector`** — Wallet connection UI (demo vs browser)
- **`UsdcAmount`** — Formatted USDC amount display

### Client-Side Reputation Scoring (`lib/reputation/client-scoring.ts`)

Pure functions mirroring server reputation logic for demo/trust-building scenarios:
- `computeSellerScoreRaw()`, `computeBuyerScoreRaw()`, `getConfidence()`, `simulateRounds()`
- Pre-computed agent profiles in `SCREENING_AGENTS`
- Trust-building rounds in `TRUST_BUILDING_ROUNDS`

## Facilitator API Routes (called from frontend)

| Route | Method | Description |
|---|---|---|
| `/api/health` | GET | Server status + operator address |
| `/api/orders` | GET | List orders (filterable by `?status=`) |
| `/api/orders` | POST | Create order |
| `/api/orders/:id/pay` | POST | x402 payment flow (402 or 200) |
| `/api/orders/:id/confirm-delivery` | POST | Confirm delivery on-chain |
| `/api/disputes/:orderId` | POST | File a dispute |
| `/api/disputes/:id/resolve` | POST | Resolve dispute (arbiter) |
| `/api/escrows/:escrowId` | GET | On-chain escrow state |
| `/api/reputation/:address` | GET | Reputation score |
| `/api/demo/fund` | POST | Faucet (10 USDC + 0.005 ETH) |

## Responsive Layout

- Desktop: `grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]` for two-column (main + sidebar)
- Step tracker sidebar: `hidden lg:block` (desktop only), mobile shows progress bar with `lg:hidden`
- Breakpoint-aware component swaps at `lg` breakpoint

## Technical Notes

- **No server-side code**: The web app is a pure client. No `instrumentation.ts`, no `@server/` imports, no `better-sqlite3`.
- **`@shared/` is client-safe**: Only types and pure functions. Webpack alias + TS loader extension in `next.config.ts` make it work.
- **CORS required**: Frontend and facilitator are on different origins. The Express server has `CORS_ORIGIN` env var.
- **`isMockChainClient`**: `lib/env/isMockChainClient.ts` reads `NEXT_PUBLIC_MOCK_CHAIN` for UI branching (shows "Mock Chain" vs "Base Sepolia"). In mock mode: hardcoded balances, no RPC, simulated settlement, tx links disabled.
- **Session persistence**: Wallet private key (`x402-demo-pk`) and marketplace flow state (`x402-marketplace-state`) survive page refreshes via `sessionStorage`.
- **Workspaces**: `web` is a workspace in root `package.json`. Run `bun install` from root to link.
- **No test suite**: No Jest/Vitest setup. Uses `next lint` (ESLint) only.
- **`@vercel/analytics`**: Integrated in root layout for Vercel analytics.
- **Error handling**: Per-component error display via motion divs. Network errors in background operations (reputation fetch, polling) are silently caught.
