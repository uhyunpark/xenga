# API Reference

Base URL: `https://api.xenga.xyz`

## Authentication

| Method | Header | Used for |
|--------|--------|----------|
| API key | `X-API-KEY: xng_...` | Order CRUD, webhooks (seller/operator) |
| SIWE session | `Authorization: Bearer <jwt>` | Profile, API keys, payment links (dashboard) |
| Wallet signature | `X-WALLET-ADDRESS` + `X-WALLET-SIGNATURE` + `X-WALLET-TIMESTAMP` | Dispute resolution (arbiter) |
| No auth | — | Reputation, escrow state, health, payment link details |

---

## Orders

### Create Order

```
POST /api/orders
Auth: X-API-KEY
```

**Request:**
```json
{
  "title": "AI Agent Task",
  "description": "Process data using GPT-4",
  "price": 5.0,
  "serviceType": "agent-service",
  "sellerAddress": "0x1234...abcd"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Order title (max 200 chars) |
| `description` | string | No | Order description (max 2000 chars) |
| `price` | number | Yes | USDC amount (e.g. 5.0, max 1,000,000) |
| `serviceType` | string | Yes | Service type: `marketplace`, `agent-service`, `inference`, `tool-call`, `data-pipeline` |
| `sellerAddress` | address | Yes | Seller's Ethereum address |
| `terms` | string | No | Free-text terms. Hashed to `contentHash` (keccak256) and stored on-chain for dispute evidence. |

**Response (201):**
```json
{
  "id": "uuid",
  "orderId": "0xbytes32...",
  "title": "AI Agent Task",
  "description": "Process data using GPT-4",
  "price": "5000000",
  "priceUsdc": 5.0,
  "serviceType": "agent-service",
  "sellerAddress": "0x1234...abcd",
  "status": "created",
  "contentHash": "0x...",
  "createdAt": 1710000000,
  "updatedAt": 1710000000
}
```

### List Orders

```
GET /api/orders?seller=0x...&status=escrowed&limit=20&offset=0
Auth: X-API-KEY (full list) or Bearer JWT with ?seller= (filtered)
```

**Response:**
```json
{
  "orders": [{ ...order }],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

Valid statuses: `created`, `pending_payment`, `escrowed`, `delivery_confirmed`, `completed`, `disputed`, `resolved`, `refunded`

### Get Order

```
GET /api/orders/:id
Auth: none
```

### Pay for Order (x402 Flow)

```
POST /api/orders/:id/pay
```

**Step 1 — No payment header:**

Response (402):
```
Headers:
  PAYMENT-REQUIRED: <base64 JSON>
  X-PAYMENT-REQUIRED: <base64 JSON>

Body:
{
  "paymentRequirements": {
    "x402Version": 1,
    "accepts": [{
      "scheme": "escrow",
      "network": "base-sepolia",
      "maxAmountRequired": "5000000",
      "resource": "/api/orders/:id/pay",
      "description": "Order title",
      "payTo": "0xEscrowVaultAddress",
      "asset": "0xUsdcAddress",
      "maxTimeoutSeconds": 3600,
      "extra": {
        "orderId": "0xbytes32...",
        "sellerAddress": "0x...",
        "releaseWindow": 3600,
        "serviceType": "agent-service",
        "primaryType": "ReceiveWithAuthorization"
      }
    }]
  },
  "sellerReputation": {
    "score": 85,
    "confidence": "high",
    "disputeRate": 0.02
  }
}
```

**Step 2 — With payment signature:**

```
Headers:
  PAYMENT-SIGNATURE: <base64 JSON>
  X-PAYMENT: <base64 JSON>
```

Payment signature payload (x402 format):
```json
{
  "x402Version": 1,
  "scheme": "escrow",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0xBuyerAddress",
      "to": "0xEscrowVaultAddress",
      "value": "5000000",
      "validAfter": "0",
      "validBefore": "1710086400",
      "nonce": "0xrandom..."
    }
  }
}
```

Response (200):
```json
{
  "message": "Payment successful — funds are now in escrow",
  "order": { ...order },
  "payment": {
    "success": true,
    "txHash": "0x...",
    "escrowId": 42
  }
}
```

Response headers:
```
PAYMENT-RESPONSE: <base64 JSON>
X-PAYMENT-RESPONSE: <base64 JSON>
```

### Confirm Delivery

```
POST /api/orders/:id/confirm-delivery
Auth: X-API-KEY or Bearer JWT (seller only)
```

**Response:**
```json
{
  "message": "Delivery confirmed on-chain",
  "txHash": "0x..."
}
```

### Refund

```
POST /api/orders/:id/refund
Auth: X-API-KEY or Bearer JWT (seller only)
```

**Response:**
```json
{
  "message": "Refund processed on-chain",
  "txHash": "0x..."
}
```

---

## Escrows

### Get Escrow State

```
GET /api/escrows/:escrowId
Auth: none
```

**Response:**
```json
{
  "escrowId": 42,
  "orderId": "0xbytes32...",
  "buyer": "0x...",
  "seller": "0x...",
  "amount": "5000000",
  "serviceType": "agent-service",
  "state": "Active",
  "stateNum": 1,
  "createdAt": 1710000000,
  "releaseWindow": 3600,
  "deliveryConfirmedAt": 0,
  "disputeWindow": 259200,
  "facilitatorFee": "150000",
  "contentHash": "0x...",
  "isReleasable": false
}
```

States: `None` (0), `Active` (1), `DeliveryConfirmed` (2), `Completed` (3), `AutoReleased` (4), `Disputed` (5), `Resolved` (6), `Refunded` (7)

---

## Disputes

### File Dispute

```
POST /api/disputes/:orderId
Auth: X-API-KEY
```

**Request:**
```json
{ "reason": "Service not delivered as described" }
```

**Response (201):**
```json
{
  "message": "Dispute filed",
  "disputeId": "uuid"
}
```

Order must be in `escrowed` or `delivery_confirmed` state.

### List Disputes

```
GET /api/disputes
Auth: X-API-KEY
```

### Resolve Dispute

```
POST /api/disputes/:disputeId/resolve
Auth: Wallet signature (arbiter only)
```

**Request:**
```json
{
  "buyerPct": 70,
  "resolution": "Partial delivery confirmed, 70% refund to buyer"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `buyerPct` | number | 0-100. Percentage of (amount - fee) returned to buyer |
| `resolution` | string | Resolution description |

**Response:**
```json
{
  "message": "Dispute resolved",
  "txHash": "0x...",
  "buyerPct": 70,
  "sellerPct": 30
}
```

---

## Reputation

### Get Reputation

```
GET /api/reputation/:address
Auth: none
```

**Response:**
```json
{
  "address": "0x...",
  "overall": 85,
  "confidence": "high",
  "seller": {
    "score": 88,
    "completionRate": 0.95,
    "disputeRate": 0.02,
    "refundRate": 0.03,
    "resolutionFairness": 1.0,
    "totalVolume": "50000000000",
    "totalEscrows": 42,
    "firstSeen": 1700000000
  },
  "buyer": {
    "score": 82,
    "disputeRate": 0.05,
    "frivolousDisputeRate": 0.0,
    "completionRate": 0.93,
    "totalVolume": "25000000000",
    "totalEscrows": 15,
    "firstSeen": 1705000000
  },
  "updatedAt": 1710000000
}
```

**Scoring:**
- Scores range 0-100 (higher is better), based on completion rate, dispute rate, and volume
- Confidence: `low` (<3 escrows), `medium` (3-9), `high` (>=10)

### Get Reputation History

```
GET /api/reputation/:address/history?days=90&bucket=7
Auth: none
```

| Param | Default | Bounds | Description |
|-------|---------|--------|-------------|
| `days` | 90 | 1-365 | Lookback period |
| `bucket` | 7 | 1-30 | Bucket size in days |

---

## Sellers

### Register/Update Seller

```
POST /api/sellers
Auth: Bearer JWT (SIWE session)
```

**Request:**
```json
{
  "name": "My AI Service",
  "payoutAddress": "0x..."
}
```

First call creates the profile, subsequent calls update it.

### Get Seller

```
GET /api/sellers/:address
Auth: none
```

### List Sellers

```
GET /api/sellers
Auth: none
```

---

## API Keys

### Create API Key

```
POST /api/seller-api-keys
Auth: Bearer JWT (SIWE session)
```

**Request:**
```json
{ "name": "production" }
```

**Response:**
```json
{
  "id": "uuid",
  "key": "xng_a1b2c3d4e5f6g7h8...",
  "keyPrefix": "xng_a1b2c3d4",
  "name": "production",
  "createdAt": 1710000000
}
```

The `key` field is shown **once** at creation. Store it securely.

### List API Keys

```
GET /api/seller-api-keys
Auth: Bearer JWT
```

### Revoke API Key

```
DELETE /api/seller-api-keys/:id
Auth: Bearer JWT
```

---

## Webhooks

### Register Webhook

```
POST /api/webhooks
Auth: X-API-KEY or Bearer JWT
```

**Request:**
```json
{
  "url": "https://your-service.com/webhook",
  "secret": "your-secret-min-16-chars",
  "eventTypes": ["escrow.created", "escrow.released", "delivery.confirmed"]
}
```

If `eventTypes` is omitted, all event types are subscribed.

**Event types:** `escrow.created`, `escrow.released`, `escrow.auto_released`, `escrow.disputed`, `escrow.resolved`, `escrow.refunded`, `delivery.confirmed`

### Webhook Delivery Format

```
POST https://your-service.com/webhook
Headers:
  Content-Type: application/json
  X-Webhook-Signature: sha256=<hmac-sha256 of body with secret>
  X-Webhook-Event: escrow.released
  X-Webhook-Id: <webhook-id>
```

**Body:**
```json
{
  "type": "escrow.released",
  "escrowId": 42,
  "orderId": "uuid",
  "sellerAddress": "0x...",
  "txHash": "0x...",
  "data": { ...event-specific data },
  "timestamp": 1710000000
}
```

**Signature verification:**
```typescript
import crypto from "crypto";

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

**Retry policy:** 3 attempts with exponential backoff (1s, 5s, 25s).

### List Webhooks

```
GET /api/webhooks
Auth: X-API-KEY or Bearer JWT
```

### Delete Webhook

```
DELETE /api/webhooks/:id
Auth: X-API-KEY or Bearer JWT
```

---

## Payment Links

### Create Payment Link

```
POST /api/payment-links
Auth: Bearer JWT
```

**Request:**
```json
{
  "title": "Premium AI Analysis",
  "description": "Deep analysis of your dataset",
  "price": 25.0,
  "serviceType": "agent-service",
  "terms": "Results delivered within 1 hour. Refund if accuracy below 90%."
}
```

The optional `terms` field is hashed (`keccak256`) and stored on-chain as `contentHash` in the escrow when a buyer checks out.

### Get Payment Link Details (Public)

```
GET /api/payment-links/:id/details
Auth: none
```

Returns public-safe fields only. Returns 410 if deactivated.

### Checkout from Payment Link (Public)

```
POST /api/payment-links/:id/checkout
Auth: none (rate limited: 5/min)
```

Creates an order from the payment link data. Returns orderId for the x402 payment flow.

**Response (201):**
```json
{
  "orderId": "uuid",
  "orderHash": "0xbytes32...",
  "price": "25000000",
  "priceUsdc": 25.0,
  "sellerAddress": "0x...",
  "serviceType": "agent-service"
}
```

### List Payment Links

```
GET /api/payment-links
Auth: Bearer JWT
```

### Deactivate Payment Link

```
POST /api/payment-links/:id/deactivate
Auth: Bearer JWT
```

---

## Auth

### Get Nonce

```
GET /api/auth/nonce
Auth: none
```

**Response:**
```json
{ "nonce": "a1b2c3d4e5f6..." }
```

Nonce expires after 5 minutes, single-use.

### SIWE Login

```
POST /api/auth/siwe
Auth: none
```

**Request:**
```json
{
  "message": "xenga.xyz wants you to sign in with your Ethereum account: 0x...\n\nSign in to Xenga\n\nURI: https://xenga.xyz\nVersion: 1\nChain ID: 84532\nNonce: a1b2c3d4e5f6...\nIssued At: 2024-03-10T00:00:00.000Z",
  "signature": "0x..."
}
```

**Response:**
```json
{ "token": "eyJhbGciOi..." }
```

JWT expires after 24 hours. Use as `Authorization: Bearer <token>`.

---

## Demo

### Fund Wallet (Testnet Only)

```
POST /api/demo/fund
Auth: none (rate limited: 100 USDC/hr per IP+address)
```

**Request:**
```json
{ "address": "0x..." }
```

Sends 10 USDC + 0.005 ETH from operator wallet. Only available on testnets.

---

## Health

```
GET /health
Auth: none
```

**Response:**
```json
{
  "status": "ok",
  "escrowVault": "0x...",
  "serviceTypes": ["marketplace", "agent-service", "inference", "tool-call", "data-pipeline"],
  "chain": "base-sepolia",
  "chainId": 84532
}
```

---

## Fee System

Fee is computed at escrow creation: `fee = (amount * feeBps) / 10000 + flatFee`

- **Seller pays**: deducted from seller's payout at settlement
- **Buyer pays exact price**: no amount inflation
- On release/autoRelease: seller gets `amount - fee`
- On refund: buyer gets full `amount` back (Xenga absorbs cost)
- On dispute resolution: `buyerPct` split applies to `amount - fee`
- Fee caps: max 10% + 50 USDC

---

## Header Reference

| Header | Direction | Format | Description |
|--------|-----------|--------|-------------|
| `PAYMENT-REQUIRED` | Response (402) | base64 JSON | x402 envelope (`{ x402Version, accepts }`) |
| `X-PAYMENT-REQUIRED` | Response (402) | base64 JSON | Legacy Xenga format (single requirement) |
| `PAYMENT-SIGNATURE` | Request (retry) | base64 JSON | x402 signed ERC-3009 authorization |
| `X-PAYMENT` | Request (retry) | base64 JSON | Legacy Xenga signed authorization |
| `PAYMENT-RESPONSE` | Response (200) | base64 JSON | x402 settlement result (`{ transaction, network, payer }`) |
| `X-PAYMENT-RESPONSE` | Response (200) | base64 JSON | Legacy Xenga settlement result (`{ txHash, escrowId }`) |

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request (missing fields, invalid values) |
| 401 | Unauthorized (invalid/missing API key or JWT) |
| 402 | Payment required (x402 flow — sign and retry) |
| 403 | Forbidden (wallet address mismatch, not arbiter) |
| 404 | Not found (order, escrow, dispute, webhook) |
| 409 | Conflict (duplicate action, already confirmed) |
| 410 | Gone (deactivated payment link) |
| 429 | Rate limited |
| 500 | Internal server error |

Error response format:
```json
{ "error": "Human-readable error message" }
```

Some 500 errors include a `details` field with additional context.
