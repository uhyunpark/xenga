# Agent Skills: Xenga Escrow Payments

On-chain USDC escrow and reputation on Base. x402-compatible — any x402 agent can pay without Xenga-specific code.

## Quick Reference

```
Base URL:  https://api.xenga.xyz
Chain:     Base Sepolia (84532)
USDC:      6 decimals
```

## Pay for a Service

### Option 1: escrowFetch (Recommended)

Drop-in `fetch` replacement. Handles 402 → sign → pay automatically.

```typescript
import { escrowFetch } from "@xenga/client";

const { response, payment } = await escrowFetch(
  "https://api.xenga.xyz/api/orders/ORDER_ID/pay",
  { method: "POST" },
  { walletClient }  // viem WalletClient with account
);

const data = await response.json();
// payment.txHash, payment.escrowId available after successful payment
```

Reject low-reputation sellers:

```typescript
const { response } = await escrowFetch(url, init, {
  walletClient,
  onSellerReputation: (rep) => rep.score >= 60, // return false to abort
});
```

### Option 2: Manual x402 Flow

1. `POST /api/orders/:id/pay` (no headers) → **402** with `PAYMENT-REQUIRED` header (base64 JSON)
2. Parse requirements: escrow contract, USDC address, amount, orderId, seller, releaseWindow
3. Sign ERC-3009 `ReceiveWithAuthorization` via EIP-712:
   - domain: `{ name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }`
   - message: `{ from, to (escrowVault), value, validAfter: 0, validBefore, nonce }`
4. Retry same URL with `PAYMENT-SIGNATURE` header (base64 JSON) → **200** + service response

### Option 3: Full Client

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://api.xenga.xyz",
  escrowVaultAddress: "0x...",
});

const { order, payment } = await client.payForOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0x...");
```

## Check Escrow & Reputation (No Auth)

```
GET /api/escrows/:escrowId       → escrow state, buyer, seller, amounts, timestamps
GET /api/reputation/:address     → score (0-100), confidence, dispute rate
GET /api/reputation/:address/history?days=90  → time-windowed history
GET /health                      → server status, contract addresses
```

## Service Types

| Type | Release Window | Auto-verify | Use Case |
|------|----------------|-------------|----------|
| `agent-service` | 1 hour | Yes | AI agent task execution |
| `inference` | 5 minutes | Yes | LLM inference calls |
| `tool-call` | 1 minute | Yes | Single tool/API calls |
| `marketplace` | 7 days | No | Goods with manual confirmation |
| `data-pipeline` | 1 hour | No | Data processing jobs |

Release windows adjust dynamically based on counterparty reputation.

## Escrow Lifecycle

```
Active → DeliveryConfirmed → Completed      (buyer releases)
                              AutoReleased   (timeout, automatic)
           → Disputed → Resolved            (arbiter splits %)
Active → Refunded                            (seller voluntary)
```

- **Active**: USDC locked in escrow. Buyer can release, seller can confirm delivery or refund.
- **DeliveryConfirmed**: Dispute window starts. Buyer can release or dispute.
- **AutoRelease**: Triggered when release + dispute windows expire.
- **Disputed**: Arbiter resolves with `buyerPct` (0-100). Split applies to `amount - fee`.
- **Refunded**: Buyer gets full deposit back including fee.

## For Sellers & Developers

### Create an Order

```bash
curl -X POST https://api.xenga.xyz/api/orders \
  -H "X-API-KEY: xng_..." \
  -H "Content-Type: application/json" \
  -d '{"title":"AI Task","price":5.0,"serviceType":"agent-service","sellerAddress":"0x..."}'
```

### Manage Escrow Lifecycle

```bash
# Confirm delivery (starts auto-release countdown)
curl -X POST https://api.xenga.xyz/api/orders/:id/confirm-delivery \
  -H "X-API-KEY: xng_..."

# Voluntary refund
curl -X POST https://api.xenga.xyz/api/orders/:id/refund \
  -H "X-API-KEY: xng_..."
```

### Authentication

| Method | Header | Used for |
|--------|--------|----------|
| API key | `X-API-KEY: xng_...` | Order CRUD, webhooks (seller/operator) |
| SIWE session | `Authorization: Bearer <jwt>` | Profile, API keys, payment links (dashboard) |
| No auth | — | Reputation, escrow state, health |

Full API reference — all endpoints, webhooks, payment links, SIWE auth, fee system: see [API Reference](api-reference.md).

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request (missing fields, invalid values) |
| 401 | Unauthorized (invalid/missing API key or JWT) |
| 402 | Payment required (x402 flow — sign and retry) |
| 403 | Forbidden (wallet address mismatch) |
| 404 | Not found |
| 409 | Conflict (duplicate action) |
| 429 | Rate limited |
| 500 | Internal server error |

Error format: `{ "error": "Human-readable message" }`
