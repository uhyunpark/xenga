# API Reference

## Authentication

Endpoints marked with **Auth: API Key** require an `X-API-KEY` header matching one of the configured `API_KEYS`. If no `API_KEYS` are configured in the environment, these endpoints are open.

Endpoints marked with **Auth: Wallet** require wallet signature headers (`X-WALLET-ADDRESS`, `X-WALLET-SIGNATURE`, `X-WALLET-TIMESTAMP`).

Endpoints marked **Public** require no authentication.

---

## Orders

### `GET /api/orders` **Auth: API Key**

List orders with optional filters.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `created`, `pending_payment`, `escrowed`, `delivery_confirmed`, `completed`, `disputed`, `resolved`, `refunded` |
| `seller` | address | Filter by seller address |
| `limit` | number | Max results (1-200, default 50) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "orders": [{ "id": "...", "orderId": "0x...", "title": "...", "price": "5000000", "priceUsdc": 5.0, "status": "created", ... }],
  "pagination": { "total": 42, "limit": 50, "offset": 0 }
}
```

### `GET /api/orders/:id` **Public**

Get a single order by ID.

### `POST /api/orders` **Auth: API Key**

Create a new order.

**Body:**
```json
{
  "title": "Widget",
  "description": "A fine widget",
  "price": 5.0,
  "serviceType": "marketplace",
  "sellerAddress": "0x..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Max 200 chars |
| `description` | string | No | Max 2000 chars |
| `price` | number | Yes | USDC amount (e.g., 5.0). Max 1,000,000 |
| `serviceType` | string | Yes | `"marketplace"` or `"agent-service"` |
| `sellerAddress` | address | Yes | Valid Ethereum address |

**Response (201):**
```json
{
  "id": "uuid",
  "orderId": "0x...",
  "title": "Widget",
  "price": "5000000",
  "priceUsdc": 5.0,
  "status": "created",
  "serviceType": "marketplace",
  "sellerAddress": "0x...",
  "createdAt": 1700000000,
  "updatedAt": 1700000000
}
```

### `POST /api/orders/:id/pay` **Public (x402 flow)**

Pay for an order. This is the core x402 endpoint.

**Without payment header:** Returns `402` with payment requirements.

**402 Response headers:**
- `PAYMENT-REQUIRED` — base64 JSON array of payment requirements (x402 standard)
- `X-PAYMENT-REQUIRED` — base64 JSON single requirement (legacy)

**402 Response body:**
```json
{
  "error": "Payment required",
  "paymentRequired": {
    "scheme": "escrow",
    "network": "base-sepolia",
    "escrowContract": "0x...",
    "asset": "0x...",
    "amount": "5000000",
    "orderId": "0x...",
    "sellerAddress": "0x...",
    "releaseWindow": 604800,
    "serviceType": "marketplace",
    "facilitatorFee": "100000",
    "feeBps": 100,
    "flatFee": "50000"
  },
  "sellerReputation": { "score": 85, "confidence": "high", "disputeRate": 0.05 }
}
```

**With payment header:** Include signed ERC-3009 authorization in `PAYMENT-SIGNATURE` header (base64 JSON).

**200 Response:**
```json
{
  "message": "Payment successful — funds are now in escrow",
  "order": { ... },
  "payment": { "success": true, "txHash": "0x...", "escrowId": 1 }
}
```

---

## Escrows

### `GET /api/escrows/:escrowId` **Public**

Get on-chain escrow details.

**Response:**
```json
{
  "orderId": "0x...",
  "buyer": "0x...",
  "seller": "0x...",
  "amount": "5000000",
  "serviceType": "marketplace",
  "state": 1,
  "createdAt": "1700000000",
  "releaseWindow": "604800",
  "deliveryConfirmedAt": "0",
  "disputeWindow": "259200",
  "facilitatorFee": "100000"
}
```

**Escrow states:** 0=None, 1=Active, 2=DeliveryConfirmed, 3=Completed, 4=AutoReleased, 5=Disputed, 6=Resolved, 7=Refunded

---

## Disputes

### `POST /api/disputes/:orderId/dispute` **Public**

File a dispute for an order in `escrowed` or `delivery_confirmed` status.

**Body:**
```json
{ "reason": "Item not as described" }
```

### `GET /api/disputes` **Auth: API Key**

List all disputes.

### `POST /api/disputes/:disputeId/resolve` **Auth: Wallet (arbiter only)**

Resolve a dispute. Requires wallet signature from the arbiter address.

**Body:**
```json
{ "buyerPct": 70, "resolution": "Partial refund — item was damaged" }
```

---

## Reputation

### `GET /api/reputation/:address` **Public**

Get computed reputation score for an address.

**Response:**
```json
{
  "address": "0x...",
  "overall": 85,
  "confidence": "high",
  "seller": { "score": 85, "completionRate": 0.95, "disputeRate": 0.05, "refundRate": 0.02, ... },
  "buyer": { "score": 90, "disputeRate": 0.03, "completionRate": 0.97, ... },
  "updatedAt": 1700000000
}
```

### `GET /api/reputation/:address/history` **Public**

Get reputation history for an address.

---

## Webhooks

### `POST /api/webhooks` **Auth: API Key**

Register a webhook to receive event notifications.

**Body:**
```json
{
  "url": "https://yourserver.com/webhook",
  "secret": "whsec_your_secret_key_here",
  "eventTypes": ["escrow.created", "escrow.released", "escrow.disputed"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Valid HTTPS URL |
| `secret` | string | Yes | Min 16 chars, used for HMAC-SHA256 signing |
| `eventTypes` | string[] | No | Filter events. Default: all types |

**Event types:** `escrow.created`, `escrow.released`, `escrow.auto_released`, `escrow.disputed`, `escrow.resolved`, `escrow.refunded`, `delivery.confirmed`

**Webhook payload format:**
```json
{
  "type": "escrow.released",
  "escrowId": 1,
  "orderId": "0x...",
  "txHash": "0x...",
  "data": { ... },
  "timestamp": 1700000000
}
```

**Webhook headers:**
- `X-Webhook-Signature: sha256=<hmac>` — HMAC-SHA256 of the JSON payload using your secret
- `X-Webhook-Event: escrow.released` — event type
- `X-Webhook-Id: <webhook-id>` — your webhook registration ID

**Verifying webhooks:**
```typescript
import { createHmac } from "crypto";

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === `sha256=${expected}`;
}
```

### `GET /api/webhooks` **Auth: API Key**

List registered webhooks (secrets are not included).

### `DELETE /api/webhooks/:id` **Auth: API Key**

Delete a webhook registration.

---

## Health

### `GET /health` **Public**

Server health check.

**Response:**
```json
{
  "status": "ok",
  "chain": "base-sepolia",
  "chainId": 84532,
  "escrowContract": "0x...",
  "operator": { "address": "0x...", "ethBalance": "0.5", "isLow": false },
  "serviceTypes": [{ "name": "marketplace", "releaseWindow": 604800, ... }]
}
```

---

## Error responses

All errors follow the format:
```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (missing fields, invalid input) |
| 401 | Missing authentication (API key or wallet headers) |
| 402 | Payment required (x402 flow — not an error) |
| 403 | Invalid API key or unauthorized address |
| 404 | Resource not found |
| 409 | Payment already in progress or completed |
| 429 | Rate limited |
| 500 | Internal server error |

---

## x402 Header Reference

| Header | Direction | Format | Description |
|--------|-----------|--------|-------------|
| `PAYMENT-REQUIRED` | Response (402) | base64 JSON array | Payment requirements (x402 standard) |
| `X-PAYMENT-REQUIRED` | Response (402) | base64 JSON | Payment requirement (legacy) |
| `PAYMENT-SIGNATURE` | Request (retry) | base64 JSON | Signed ERC-3009 authorization (x402 standard) |
| `X-PAYMENT` | Request (retry) | base64 JSON | Signed authorization (legacy) |
| `PAYMENT-RESPONSE` | Response (200) | base64 JSON | Settlement result (x402 standard) |
| `X-PAYMENT-RESPONSE` | Response (200) | base64 JSON | Settlement result (legacy) |
