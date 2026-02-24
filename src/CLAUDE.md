# src

Express facilitator server (GCP Cloud Run), client SDK, and shared types/utilities. The facilitator handles all chain interaction: escrow settlement, event listening, reputation scoring, order management, and SQLite persistence. The client SDK provides the x402 payment flow for consumers. Shared code is frontend-safe.

## Build & Run

```bash
bun run dev          # Dev mode with watch (port 3000)
bun run start        # Production start

# Docker (facilitator only)
docker build -t xenga-facilitator .
docker run -p 8080:8080 --env-file .env xenga-facilitator
```

## Structure

```
src/
├── server/                          # Express facilitator
│   ├── index.ts                    # App bootstrap + route registration
│   ├── config.ts                   # Env var loading + validation
│   ├── db/
│   │   ├── index.ts               # better-sqlite3 init (singleton, WAL mode)
│   │   └── schema.ts              # CREATE TABLE IF NOT EXISTS (no migrations)
│   ├── routes/
│   │   ├── orders.ts              # CRUD + x402 payment flow
│   │   ├── escrows.ts             # On-chain escrow lookups
│   │   ├── disputes.ts            # File + resolve disputes
│   │   ├── reputation.ts          # GET /api/reputation/:address
│   │   ├── demo.ts                # /api/demo/fund faucet (DEMO_MODE)
│   │   ├── facilitator.ts         # Health + config endpoints
│   │   ├── metrics.ts             # Metrics
│   │   └── webhooks.ts            # Event webhook management
│   ├── services/
│   │   ├── eventListener.ts       # On-chain event watching + reconciliation
│   │   ├── reputationService.ts   # Score computation + LRU cache
│   │   ├── orderService.ts        # Order CRUD (uuid + keccak256 orderId)
│   │   ├── orderCleanup.ts        # Remove stuck orders (>30min)
│   │   ├── escrowService.ts       # Chain reads for escrow state
│   │   ├── walletMonitor.ts       # Operator ETH balance monitoring
│   │   ├── webhookService.ts      # Queue-based webhook dispatch
│   │   ├── metricsService.ts      # Metrics collection
│   │   ├── cacheAdapter.ts        # Cache abstraction
│   │   └── logger.ts              # Structured logging (LOG_LEVEL env)
│   ├── facilitator/
│   │   ├── verifier.ts            # Off-chain ERC-3009 signature verification
│   │   ├── settler.ts             # On-chain tx submission (operator pays gas)
│   │   └── dispatch.ts            # Local/remote facilitator delegation
│   ├── middleware/
│   │   └── paymentCore.ts         # Framework-independent x402 core
│   ├── schemes/                    # Payment scheme registry
│   └── service-types/
│       ├── marketplace.ts          # 7-day release, manual delivery
│       ├── agent-service.ts        # 1-hour release, auto-verify delivery
│       └── marketplace-seller.ts   # Seller-specific marketplace config
├── client/                          # Client SDK
│   ├── index.ts                    # createEscrowClient() factory
│   ├── escrowFetch.ts             # Universal x402 payment handler
│   └── escrowScheme.ts            # Escrow payment scheme definition
└── shared/                          # Frontend-safe types & utilities
    ├── types.ts                    # Type definitions (no server deps)
    ├── constants.ts                # Chain configs, USDC decimals, thresholds
    ├── eip712.ts                   # buildReceiveAuthSigningParams() for signing
    ├── abi.ts                      # Auto-generated — never edit, use sync-abi
    ├── errors.ts                   # Error class hierarchy
    ├── fees.ts                     # Fee computation logic
    └── schemes.ts                  # Scheme registry (server-only, not frontend-safe)
```

## Server Architecture (`server/index.ts`)

Bootstrap order:
1. `validateConfig()` — fails hard if env vars are missing/invalid
2. `registerServiceType()` — registers marketplace + agent-service
3. `getDb()` — creates/migrates SQLite
4. Express setup — JSON middleware (1mb limit), CORS (`CORS_ORIGIN`), rate limiters per endpoint
5. Route registration with middleware chains
6. Background services: `startEventListener()`, `startWalletMonitor()`, `startOrderCleanup()`
7. Graceful shutdown on SIGINT/SIGTERM (closes DB + server)

**Rate limiting** (separate limiters per endpoint):
- Payments: 20/min
- Reputation: 30/min
- Disputes: 10/min
- General: 60/min

## Database (`server/db/`)

**better-sqlite3** directly — no ORM. Raw SQL with parameterized queries.

```typescript
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");   // Write-Ahead Logging for concurrent access
db.pragma("foreign_keys = ON");
db.exec(SCHEMA);                   // CREATE TABLE IF NOT EXISTS (no migrations)
```

**Tables:**
- **orders**: id (PK), orderId (bytes32 hex), title, description, price (string for BigInt precision), serviceType, seller/buyer, status, escrowId, txHash, timestamps
- **disputes**: id, escrowId (FK), orderId, filed_by, reason, status, resolution, buyer_pct, timestamps
- **events**: event_name, escrowId (FK), block_number, tx_hash, log_index — UNIQUE(tx_hash, log_index) for deduplication
- **webhooks**: url, secret, event_types (JSON array)

**Key conventions:**
- Prices stored as strings to preserve BigInt precision (USDC 6-decimal)
- Timestamps are Unix seconds (not milliseconds)
- No explicit migrations — schema applied via `CREATE TABLE IF NOT EXISTS` on startup
- `DATABASE_PATH` env var (defaults to `x402-escrow.db`, `/tmp/` on Vercel)

## Service Patterns

No DI framework — services are singletons with lazy initialization via module-scope closures.

```typescript
// Pattern: lazy-initialized viem clients cached in module scope
let _publicClient: PublicClient;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain, transport: http(rpc) });
  }
  return _publicClient;
}
```

**Key services:**
| Service | Responsibility |
|---------|---------------|
| `orderService` | CRUD for orders. Uses `uuid()` + `keccak256(id)` for orderId |
| `escrowService` | Read-only escrow state from chain via viem |
| `reputationService` | Computes scores from on-chain stats. LRU cache (60s TTL, 100 max entries) |
| `eventListener` | Watches on-chain events, saves to DB, triggers webhooks, syncs orders |
| `orderCleanup` | Removes orders stuck in "created"/"pending_payment" for >30min |
| `walletMonitor` | Periodic operator wallet ETH balance checks |
| `webhookService` | Queue-based webhook dispatch (non-blocking) |
| `logger` | Structured logging with `LOG_LEVEL` env var (debug/info/warn/error) |

## Route Patterns (`server/routes/`)

Each file exports an Express Router, registered in `index.ts` with optional middleware chains.

**Middleware:**
- `apiKeyAuth()` — checks `X-API-KEY` header (optional if no `API_KEYS` configured)
- `walletAuth()` — checks `X-WALLET-ADDRESS`, `X-WALLET-SIGNATURE`, `X-WALLET-TIMESTAMP`; verifies signature with 5-minute replay protection
- `escrowPaymentMiddleware()` — full x402 payment flow (402 generation or signature verification + settlement)

**Error handling:** Per-route try/catch returning JSON. No global error middleware. On-chain calls wrapped with 500 + error message. DB queries return 404/400 as appropriate.

## Facilitator (`server/facilitator/`)

**`verifier.ts`** — Off-chain ERC-3009 signature verification:
- Uses viem's `verifyTypedData()` with USDC EIP-712 domain
- Checks signature validity, timing windows (`validAfter` < now < `validBefore`), target address
- Returns `{ valid: boolean; error?: string }`

**`settler.ts`** — On-chain transaction submission (operator pays gas):
- `settleEscrow(payload)` — submits `createEscrowWithAuth`, parses receipt for escrowId from `EscrowCreated` event
- `confirmDeliveryOnChain(escrowId)`, `resolveDisputeOnChain(escrowId, buyerPct)`, `refundOnChain(escrowId)`
- `fundWallet(address)` — sends 10 USDC + 0.005 ETH for demo mode
- Uses `privateKeyToAccount()` + lazy-initialized `walletClient`/`publicClient`

**`dispatch.ts`** — Delegation pattern for chaining facilitators (local scheme or external URL).

## Middleware (`server/middleware/`)

**`paymentCore.ts`** — Framework-independent x402 core function `processEscrowPayment()`. Can be reused in Next.js or other frameworks via adapter pattern. The Express-specific wrapper is `escrowPaymentMiddleware()`.

## Service Types (`server/service-types/`)

Plugin interface registered via global `Symbol.for` registry.

| Type | Release Window | Delivery |
|------|---------------|----------|
| `marketplace` | 7 days | Manual confirmation |
| `agent-service` | 1 hour | Auto-verify |

- `adjustParams(params, reputation)` — dynamically modify releaseWindow based on counterparty reputation (e.g., high-trust pairs get 3-day instead of 7-day)
- `verifyDelivery()` — async auto-verify, runs in background after `AUTO_VERIFY_DELAY_MS` (500ms)

**Adding a service type:** Implement `ServiceType` interface, register via `registerServiceType()` in `index.ts`.

## Event Listener (`server/services/eventListener.ts`)

Uses viem's `watchContractEvent()` (websocket-based, falls back to polling).

**Flow:**
1. Startup reconciliation — queries historical logs from last known block, handles downtime gaps
2. Watch each event type (EscrowCreated, DeliveryConfirmed, EscrowReleased, etc.)
3. Per event: save to DB (dedup via UNIQUE tx_hash+log_index) → emit webhook → sync order status → schedule auto-verify if applicable
4. Reconnect: exponential backoff on error (max 5 retries, max 32s backoff)
5. Block tracking: maintains `_lastProcessedBlock` for reconciliation

Watches are fire-and-forget — errors are logged but don't crash the server. Auto-verify failures are logged but don't update order status.

## Client SDK (`client/`)

**`escrowFetch(url, init, options)`** — Universal x402 payment handler:
1. First request to `url` without payment header
2. If 402: parse `PAYMENT-REQUIRED` header (base64 JSON), validate shape, optionally call `onSellerReputation()` callback (can abort if reputation too low), sign `ReceiveWithAuthorization` via EIP-712, retry with `X-PAYMENT` header
3. Returns `{ response, payment? }`

Handles both standard (`PAYMENT-REQUIRED`) and legacy (`X-PAYMENT-REQUIRED`) headers. Universal base64 encoding (Node Buffer + browser TextEncoder/atob).

**`createEscrowClient(config)`** — Factory returning buyer/seller client:
- `payForOrder(orderId)`, `getOrder(orderId)`, `getEscrow(escrowId)`
- `disputeEscrow(orderId, reason)`, `confirmDeliveryOnChain(escrowId)`
- `getReputation(addr)`, `getSellerStats(addr)`, `getBuyerStats(addr)`

**Error types:** `NetworkError` (retryable), `PaymentVerificationError` (user error), `ReputationAbortError` (reputation check failed), `SettlementError` (tx failed).

## Shared Code (`shared/`)

All files are frontend-safe (no server dependencies) **except** `schemes.ts` (ties to middleware, server-only).

| File | Contents | Frontend-safe |
|------|----------|:---:|
| `types.ts` | Type definitions | Yes |
| `constants.ts` | Chain configs, USDC decimals, thresholds | Yes |
| `eip712.ts` | `buildReceiveAuthSigningParams()` | Yes |
| `abi.ts` | Auto-generated contract ABIs | Yes |
| `errors.ts` | Error class hierarchy (X402Error base) | Yes |
| `fees.ts` | Fee computation logic | Yes |
| `schemes.ts` | Payment scheme registry | **No** |

Frontend imports via webpack alias `@shared/*` → `../src/shared/*` (configured in `web/next.config.ts`).

## Reputation Scoring

Computed from on-chain stats (`getBuyerStats()` / `getSellerStats()` on EscrowVault), not stored off-chain.

**Scoring formulas** (each component's max weight sums to 100):
- Seller: completionRate×40 + (1-disputeRate)×25 + (1-refundRate)×15 + resolutionFairness×10 + volumeBonus (0-10, log-scaled)
- Buyer: completionRate×45 + (1-disputeRate)×25 + (1-frivolousDisputeRate)×20 + volumeBonus (0-10, log-scaled)
- Scores clamped to [0, 100]. `resolutionFairness` defaults to 1.0 (clean record) when no resolved disputes.
- Overall: escrow-count-weighted average of seller + buyer scores (not simple average)
- Confidence: `"low"` (<3 escrows), `"medium"` (3-9), `"high"` (≥10)

**Key files:**
- `server/services/reputationService.ts` — `computeReputation()`, `computeReputationHistory()`
- `server/routes/reputation.ts` — `GET /api/reputation/:address`, `GET /api/reputation/:address/history`
- `shared/types.ts` — `ReputationScore`, `SellerReputation`, `BuyerReputation`

## Environment

Requires `.env` (see `.env.example`):

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `PRIVATE_KEY` | Yes | — | Operator wallet (0x + 64 hex chars) |
| `ESCROW_VAULT_ADDRESS` | Yes | — | Deployed EscrowVault contract address |
| `BASE_SEPOLIA_RPC` | No | chain default | RPC endpoint |
| `PORT` | No | 3000 | Server port |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin |
| `FEE_BPS` | No | 0 | Fee basis points (max 1000 = 10%) |
| `FEE_FLAT_USDC` | No | 0 | Flat fee in USDC units (max 50000000 = 50 USDC) |
| `FEE_RECIPIENT` | If fees > 0 | — | Address receiving fees |
| `API_KEYS` | No | — | Comma-separated API keys for auth |
| `LOG_LEVEL` | No | info | debug/info/warn/error |
| `CHAIN_ID` | No | 84532 | Base Sepolia (84532) or Base Mainnet (8453) |
| `DEMO_MODE` | No | false | Enables `/api/demo/fund` endpoint |
| `FACILITATOR_URL` | No | — | Delegate to external facilitator |
| `DATABASE_PATH` | No | `x402-escrow.db` | SQLite file path (`/tmp/` on Vercel) |

`validateConfig()` runs on startup — missing required vars cause a fatal error.

## How to Add Things

- **New route**: Create file in `routes/`, define Express Router, register in `index.ts` with appropriate middleware
- **New service type**: Implement `ServiceType` interface in `service-types/`, call `registerServiceType()` in `index.ts`
- **DB schema change**: Update `db/schema.ts` — no migrations, schema applied on boot via `CREATE TABLE IF NOT EXISTS`
- **New types**: Add to `shared/types.ts` — never import from `server/`
- **New config**: Add to `.env.example` AND `config.ts` with validation — don't use `process.env` directly elsewhere
- **New error**: Add class to `shared/errors.ts` extending `X402Error`

## Technical Notes

- **`@types/express` v5**: `req.params` values are `string | string[]` — cast to `string` when needed
- **Prices as strings**: SQLite stores prices as strings to preserve BigInt precision for USDC 6-decimal values
- **Timestamps**: Unix seconds, not milliseconds — watch the `/ 1000` conversions
- **Viem struct returns**: May be positional or named depending on ABI — code handles both via `result as Record<string | number, unknown>`
- **Event listener**: Watches are fire-and-forget (errors logged, don't crash server). Reconciliation runs once on startup; subsequent events come from watch.
- **`paymentCore.ts`**: Framework-independent x402 core (`processEscrowPayment`) — read this to understand the full 402 flow logic
- **Stats track gross `amount`** (not net after fees) — reputation scoring uses total transaction volume
