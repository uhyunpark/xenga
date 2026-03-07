# Agent Skills: Integrate Xenga Escrow Payments

Xenga provides on-chain escrow and reputation for AI agents using USDC on Base. This guide covers everything you need to integrate escrow-protected payments into your agent or service — from seller setup to the x402 payment flow and full API reference.

## Quick Reference

```
Base URL:  https://your-facilitator.example.com
Auth:      X-API-KEY: xng_...  (seller/operator)
           Authorization: Bearer <jwt>  (SIWE session)
Chain:     Base Sepolia (84532) | Base Mainnet (8453)
USDC:      6 decimals
```

### Endpoints at a Glance

| Category | Method | Path | Auth | Description |
|----------|--------|------|------|-------------|
| **Orders** | POST | `/api/orders` | API key | Create order |
| | GET | `/api/orders/:id` | — | Get order details |
| | POST | `/api/orders/:id/pay` | escrow flow | x402 payment (402 → sign → settle) |
| | POST | `/api/orders/:id/confirm-delivery` | API key or session | Confirm delivery |
| | POST | `/api/orders/:id/refund` | API key or session | Refund buyer |
| **Escrows** | GET | `/api/escrows/:escrowId` | — | On-chain escrow state |
| **Disputes** | POST | `/api/disputes/:orderId` | API key | File dispute |
| | POST | `/api/disputes/:disputeId/resolve` | wallet (arbiter) | Resolve dispute (buyerPct 0-100) |
| **Reputation** | GET | `/api/reputation/:address` | — | Score (0-100) + confidence |
| | GET | `/api/reputation/:address/history` | — | Time-windowed history |
| **Sellers** | POST | `/api/sellers` | session | Register/update profile |
| | GET | `/api/sellers/:address` | — | Get seller profile |
| **API Keys** | POST | `/api/seller-api-keys` | session | Create API key (shown once) |
| | GET | `/api/seller-api-keys` | session | List active keys |
| | DELETE | `/api/seller-api-keys/:id` | session | Revoke key |
| **Webhooks** | POST | `/api/webhooks` | API key or session | Register webhook |
| | GET | `/api/webhooks` | API key or session | List webhooks |
| | DELETE | `/api/webhooks/:id` | API key or session | Delete webhook |
| **Payment Links** | POST | `/api/payment-links` | session | Create payment link |
| | GET | `/api/payment-links` | session | List links |
| | POST | `/api/payment-links/:id/deactivate` | session | Deactivate link |
| | GET | `/api/payment-links/:id/details` | — | Public link details |
| | POST | `/api/payment-links/:id/checkout` | — (rate limited) | Create order from link |
| **Auth** | GET | `/api/auth/nonce` | — | Get SIWE nonce |
| | POST | `/api/auth/siwe` | — | Verify SIWE, get JWT |
| **Demo** | POST | `/api/demo/fund` | — | Faucet: 10 USDC + 0.005 ETH (testnet) |
| **Health** | GET | `/health` | — | Server status, contract address |

Webhook events: `escrow.created`, `escrow.released`, `escrow.auto_released`, `escrow.disputed`, `escrow.resolved`, `escrow.refunded`, `delivery.confirmed`

## Seller Setup

Register as a seller, create an API key, and start accepting payments.

```bash
# 1. Get SIWE nonce
NONCE=$(curl -s $BASE_URL/api/auth/nonce | jq -r '.nonce')

# 2. Sign SIWE message with your wallet, POST to get JWT
TOKEN=$(curl -s -X POST $BASE_URL/api/auth/siwe \
  -H "Content-Type: application/json" \
  -d '{"message":"...","signature":"0x..."}' | jq -r '.token')

# 3. Register seller profile
curl -X POST $BASE_URL/api/sellers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Store","payoutAddress":"0x..."}'

# 4. Create API key (key shown ONCE — save it)
API_KEY=$(curl -s -X POST $BASE_URL/api/seller-api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"production"}' | jq -r '.key')
# API_KEY = "xng_a1b2c3d4..."

# 5. Create orders using API key
curl -X POST $BASE_URL/api/orders \
  -H "X-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI Agent Task",
    "description": "Process data using GPT-4",
    "price": 5.0,
    "serviceType": "agent-service",
    "sellerAddress": "0xYourAddress"
  }'
```

## x402 Payment Flow

The core integration for buyers and agents paying for services. x402-compatible — any x402 agent can pay without Xenga-specific code.

### Step 1: Request Payment Requirements

```
POST /api/orders/:id/pay
(no payment header)
```

Response (402):

```
Headers:
  PAYMENT-REQUIRED: <base64 JSON>
  X-PAYMENT-REQUIRED: <base64 JSON>
```

```json
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

### Step 2: Sign ERC-3009 Authorization

Sign `ReceiveWithAuthorization` via EIP-712:

```
domain: { name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }
message: { from, to (escrowVault), value, validAfter: 0, validBefore, nonce }
```

### Step 3: Submit Payment

```
POST /api/orders/:id/pay
Headers:
  PAYMENT-SIGNATURE: <base64 JSON>
  X-PAYMENT: <base64 JSON>
```

Payload:

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
  "order": { "..." : "..." },
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

## Client SDK

Use `createEscrowClient` for a batteries-included client, or `escrowFetch` for fetch-style usage.

```typescript
import { createEscrowClient, escrowFetch } from "@xenga/client";

// Option 1: Full client (buyer + seller operations)
const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://api.example.com",
  escrowVaultAddress: "0x...",
  chainId: 84532, // Base Sepolia (default) or 8453 (Base Mainnet)
});

// Pay for an order (handles 402 -> sign -> settle automatically)
const { order, payment } = await client.payForOrder(orderId);

// Read operations
const order = await client.getOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0x...");

// On-chain operations (require escrowVaultAddress + ETH for gas)
await client.releaseOnChain(escrowId);
await client.disputeOnChain(escrowId);
await client.confirmDeliveryOnChain(escrowId);
await client.refundOnChain(escrowId);

// Watch for state changes
const { stop } = client.watchEscrow(escrowId, (escrow) => {
  console.log(`State: ${escrow.state}`);
});

// Option 2: escrowFetch() for any URL
const { response, payment } = await escrowFetch(url, init, {
  walletClient,
  onSellerReputation: (rep) => rep.score >= 60, // abort if low rep
});
```

## Service Types

| Type | Release Window | Auto-verify | Description |
|------|----------------|-------------|-------------|
| `marketplace` | 7 days | No | Physical/digital goods with manual confirmation |
| `agent-service` | 1 hour | Yes | AI agent task execution |
| `inference` | 5 minutes | Yes | LLM inference calls |
| `tool-call` | 1 minute | Yes | Single tool/API calls |
| `data-pipeline` | 1 hour | No | Data processing jobs |

Release windows are dynamically adjusted based on counterparty reputation.

## Escrow Lifecycle

```
Active -> DeliveryConfirmed -> Completed      (buyer releases)
                               AutoReleased   (timeout)
            -> Disputed -> Resolved           (arbiter splits %)
Active -> Refunded                            (seller voluntary)
```

- **Active**: USDC locked in escrow. Buyer can release, seller can confirm delivery or refund.
- **DeliveryConfirmed**: Dispute window starts. Buyer can release or dispute.
- **AutoRelease**: Triggered automatically when the release window expires.
- **Disputed**: Arbiter resolves with `buyerPct` (0-100). Split applies to `amount - fee`.
- **Refunded**: Buyer gets full deposit back including fee.

## Authentication

| Method | Header | Used for |
|--------|--------|----------|
| API key | `X-API-KEY: xng_...` | Order CRUD, webhooks (seller/operator) |
| SIWE session | `Authorization: Bearer <jwt>` | Profile, API keys, payment links (dashboard) |
| No auth | — | Reputation, escrow state, health, payment link details |

### SIWE Authentication Flow

```
GET /api/auth/nonce → { "nonce": "a1b2c3d4..." }
```

Sign the nonce with your wallet as a SIWE message, then:

```
POST /api/auth/siwe
Body: { "message": "...", "signature": "0x..." }
→ { "token": "eyJhbGciOi..." }
```

JWT expires after 24 hours. Use as `Authorization: Bearer <token>`.

## API Reference

### Orders

#### Create Order

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
| `serviceType` | string | Yes | `marketplace`, `agent-service`, `inference`, `tool-call`, `data-pipeline` |
| `sellerAddress` | address | Yes | Seller's Ethereum address |

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
  "createdAt": 1710000000,
  "updatedAt": 1710000000
}
```

#### List Orders

```
GET /api/orders?seller=0x...&status=escrowed&limit=20&offset=0
Auth: X-API-KEY (full list) or Bearer JWT with ?seller= (filtered)
```

**Response:**

```json
{
  "orders": [{ "..." : "..." }],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

Valid statuses: `created`, `pending_payment`, `escrowed`, `delivery_confirmed`, `completed`, `disputed`, `resolved`, `refunded`

#### Get Order

```
GET /api/orders/:id
Auth: none
```

#### Confirm Delivery

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

#### Refund

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

### Escrows

#### Get Escrow State

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
  "isReleasable": false
}
```

States: `None` (0), `Active` (1), `DeliveryConfirmed` (2), `Completed` (3), `AutoReleased` (4), `Disputed` (5), `Resolved` (6), `Refunded` (7)

### Disputes

#### File Dispute

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

#### Resolve Dispute

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

### Reputation

#### Get Reputation

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

Scores range 0-100 (higher is better). Confidence: `low` (<3 escrows), `medium` (3-9), `high` (>=10).

#### Get Reputation History

```
GET /api/reputation/:address/history?days=90&bucket=7
Auth: none
```

| Param | Default | Bounds | Description |
|-------|---------|--------|-------------|
| `days` | 90 | 1-365 | Lookback period |
| `bucket` | 7 | 1-30 | Bucket size in days |

### Sellers

#### Register/Update Seller

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

#### Get Seller

```
GET /api/sellers/:address
Auth: none
```

#### List Sellers

```
GET /api/sellers
Auth: none
```

### API Keys

#### Create API Key

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

#### List API Keys

```
GET /api/seller-api-keys
Auth: Bearer JWT
```

#### Revoke API Key

```
DELETE /api/seller-api-keys/:id
Auth: Bearer JWT
```

### Webhooks

#### Register Webhook

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

#### Webhook Delivery Format

```
POST https://your-service.com/webhook
Headers:
  Content-Type: application/json
  X-Webhook-Signature: sha256=<hmac-sha256 of body with secret>
```

**Body:**

```json
{
  "type": "escrow.released",
  "escrowId": 42,
  "orderId": "uuid",
  "sellerAddress": "0x...",
  "txHash": "0x...",
  "data": { "..." : "..." },
  "timestamp": 1710000000
}
```

**Signature verification:**

```typescript
import crypto from "crypto";

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

Retry policy: 3 attempts with exponential backoff (1s, 5s, 25s).

#### List Webhooks

```
GET /api/webhooks
Auth: X-API-KEY or Bearer JWT
```

#### Delete Webhook

```
DELETE /api/webhooks/:id
Auth: X-API-KEY or Bearer JWT
```

### Payment Links

#### Create Payment Link

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
  "serviceType": "agent-service"
}
```

#### Get Payment Link Details (Public)

```
GET /api/payment-links/:id/details
Auth: none
```

Returns public-safe fields only. Returns 410 if deactivated.

#### Checkout from Payment Link (Public)

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

#### List Payment Links

```
GET /api/payment-links
Auth: Bearer JWT
```

#### Deactivate Payment Link

```
POST /api/payment-links/:id/deactivate
Auth: Bearer JWT
```

### Demo

#### Fund Wallet (Testnet Only)

```
POST /api/demo/fund
Auth: none (rate limited: 100 USDC/hr per IP+address)
```

**Request:**

```json
{ "address": "0x..." }
```

Sends 10 USDC + 0.005 ETH from operator wallet. Only available on testnets.

### Health

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

## Fee System

Fee is computed at escrow creation: `fee = (amount * feeBps) / 10000 + flatFee`

- **Seller pays**: deducted from seller's payout at settlement
- **Buyer pays exact price**: no amount inflation
- On release/autoRelease: seller gets `amount - fee`
- On refund: buyer gets full `amount` back (facilitator absorbs cost)
- On dispute resolution: `buyerPct` split applies to `amount - fee`
- Fee caps: max 10% + 50 USDC

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
