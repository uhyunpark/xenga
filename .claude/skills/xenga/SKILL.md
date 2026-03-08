---
name: xenga
description: >
  On-chain escrow payments for AI agents using USDC on Base.
  Handles payment-protected endpoints, ERC-3009 gasless transfers,
  escrow settlement, delivery confirmation, disputes, and reputation scoring.
  Use when: integrating x402/escrow payments, creating payment-protected services,
  managing orders/escrows, checking wallet reputation, or building with the Xenga protocol.
---

# Xenga — Escrow Payments for Agents

On-chain escrow + reputation on Base using USDC. x402-compatible — any x402 agent can pay without any Xenga-specific code.

## For Agents / Buyers

**No SDK needed.** Xenga follows the x402 standard. When an agent hits a payment-protected endpoint:

1. Server returns **402** with `PAYMENT-REQUIRED` header (base64 JSON, standard x402 envelope)
2. Agent signs an ERC-3009 `ReceiveWithAuthorization` (EIP-712) using the details from the 402
3. Agent retries the same request with `PAYMENT-SIGNATURE` header
4. Server returns **200** with the service response + `PAYMENT-RESPONSE` header (txHash, escrowId)

Any x402-compatible client handles this out of the box. The 402 response contains everything needed: escrow contract address, USDC address, amount, orderId, seller, releaseWindow, serviceType.

### 402 Response Format

```
PAYMENT-REQUIRED header (base64-decoded):
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "escrow",
    "network": "base-sepolia",
    "maxAmountRequired": "5000000",
    "payTo": "0xEscrowVaultAddress",
    "asset": "0xUsdcAddress",
    "extra": {
      "orderId": "0x...",
      "sellerAddress": "0x...",
      "releaseWindow": 3600,
      "serviceType": "agent-service",
      "primaryType": "ReceiveWithAuthorization"
    }
  }]
}
```

### EIP-712 Signing

```
domain: { name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }
primaryType: "ReceiveWithAuthorization"
message: { from (buyer), to (escrowVault), value, validAfter: 0, validBefore, nonce }
```

### Payment Submission

```
PAYMENT-SIGNATURE header (base64-decoded):
{
  "x402Version": 1,
  "scheme": "escrow",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": { from, to, value, validAfter, validBefore, nonce }
  }
}
```

### After Payment

Once paid, agents can check escrow state or reputation without auth:

```
GET /api/escrows/:escrowId   → on-chain escrow state
GET /api/reputation/:address → score (0-100) + confidence
```

## For Sellers

Sellers register on Xenga, create orders or payment links, and manage escrow lifecycle. Two options: **dashboard UI** or **REST API + SDK**.

### REST API

Create orders, manage webhooks, confirm delivery — all via HTTP.

```bash
# Create an order (requires API key from dashboard)
curl -X POST https://api.xenga.xyz/api/orders \
  -H "X-API-KEY: xng_..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI Agent Task",
    "price": 5.0,
    "serviceType": "agent-service",
    "sellerAddress": "0xYourAddress"
  }'

# Confirm delivery (starts auto-release countdown)
curl -X POST https://api.xenga.xyz/api/orders/:id/confirm-delivery \
  -H "X-API-KEY: xng_..."

# Voluntary refund
curl -X POST https://api.xenga.xyz/api/orders/:id/refund \
  -H "X-API-KEY: xng_..."
```

Full endpoint reference: see `references/api-reference.md`

### SDK — Direct On-Chain Operations

For sellers who want to interact with the escrow contract directly (e.g. confirm delivery, refund, read stats):

```bash
npm install @xenga/client viem
```

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://...",           // the Xenga server handling your orders
  escrowVaultAddress: "0x...",        // needed for on-chain calls
});

// On-chain operations (require ETH for gas)
await client.confirmDeliveryOnChain(escrowId);
await client.refundOnChain(escrowId);

// Watch escrow state changes
const { stop } = client.watchEscrow(escrowId, (escrow) => {
  console.log(`State: ${escrow.state}`);
});

// Read operations (no gas)
const order = await client.getOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0xAddress");
const stats = await client.getSellerStats();
```

### Webhooks

Get notified when escrow events happen:

```bash
curl -X POST https://api.xenga.xyz/api/webhooks \
  -H "X-API-KEY: xng_..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-service.com/webhook",
    "secret": "your-secret-min-16-chars",
    "eventTypes": ["escrow.created", "escrow.released", "delivery.confirmed"]
  }'
```

Events: `escrow.created`, `escrow.released`, `escrow.auto_released`, `escrow.disputed`, `escrow.resolved`, `escrow.refunded`, `delivery.confirmed`

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

## Authentication

| Method | Header | Who |
|--------|--------|-----|
| API key | `X-API-KEY: xng_...` | Sellers (order CRUD, webhooks) |
| SIWE session | `Authorization: Bearer <jwt>` | Dashboard users (profile, API keys, payment links) |
| No auth | — | Reputation, escrow state, health |

## Reference

Full API specs, webhook delivery format, fee system, reputation scoring: see `references/api-reference.md`.
