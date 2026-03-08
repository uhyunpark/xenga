# Agent Guide

Xenga implements the [x402 protocol](https://www.x402.org/). If your agent already speaks x402, it works with Xenga out of the box — no SDK, no custom code, no integration work.

Any x402-compatible agent (Coinbase AgentKit, Circle, Crossmint, or your own) can pay for Xenga-protected services using the standard HTTP 402 flow. Xenga adds on-chain escrow, reputation scoring, and service-type-aware release windows — all exposed through standard x402 fields.

## How it works

```
Agent                          Xenga Facilitator              Base (on-chain)
  │                                  │                             │
  ├─ POST /api/orders/:id/pay ────→ │                             │
  │  (no payment header)             │                             │
  │                                  │                             │
  │←── 402 + PAYMENT-REQUIRED ──────┤                             │
  │    (x402 envelope)               │                             │
  │                                  │                             │
  ├─ sign ReceiveWithAuthorization   │                             │
  │  (EIP-712, off-chain)            │                             │
  │                                  │                             │
  ├─ POST /api/orders/:id/pay ────→ │                             │
  │  + PAYMENT-SIGNATURE header      │                             │
  │                                  ├─ verify signature           │
  │                                  ├─ createEscrowWithAuth() ──→│
  │                                  │←── txHash + escrowId ──────┤
  │←── 200 + PAYMENT-RESPONSE ─────┤                             │
  │                                  │                             │
  │  [Service delivered]             │                             │
  │  [Auto-release after timeout]    │                             │
```

Three steps:
1. **Request** — agent POSTs without payment header, gets `402` with requirements
2. **Sign** — agent signs an ERC-3009 `ReceiveWithAuthorization` (gasless USDC transfer to escrow)
3. **Pay** — agent retries with `PAYMENT-SIGNATURE` header, gets `200` with settlement confirmation

This is the standard x402 flow. Nothing Xenga-specific.

## x402 headers

All headers are base64-encoded JSON. CORS exposes all of them via `Access-Control-Expose-Headers`.

### 402 response: `PAYMENT-REQUIRED`

```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "escrow",
      "network": "base-sepolia",
      "maxAmountRequired": "5000000",
      "resource": "/api/orders/ORDER_ID/pay",
      "description": "Escrow payment for order",
      "mimeType": "application/json",
      "outputSchema": null,
      "payTo": "0xEscrowVaultAddress",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2",
        "primaryType": "ReceiveWithAuthorization",
        "orderId": "0x...",
        "sellerAddress": "0x...",
        "releaseWindow": 3600,
        "serviceType": "agent-service",
        "facilitatorFee": "0",
        "sellerReputation": {
          "score": 82,
          "confidence": "high",
          "disputeRate": 0.03
        }
      }
    }
  ]
}
```

Standard x402 fields (`scheme`, `network`, `maxAmountRequired`, `payTo`, `asset`) tell the agent what to pay. Xenga-specific data lives in `extra` — generic x402 clients can ignore it.

Key `extra` fields:
- `primaryType: "ReceiveWithAuthorization"` — tells the agent which EIP-712 type to sign
- `name` / `version` — EIP-712 domain for the USDC contract
- `sellerReputation` — agent can gate payment on seller trust score
- `releaseWindow` — already adjusted by reputation (the agent doesn't need to compute this)

### Payment submission: `PAYMENT-SIGNATURE`

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
      "validBefore": "1709337600",
      "nonce": "0x..."
    }
  }
}
```

### Settlement response: `PAYMENT-RESPONSE`

```json
{
  "success": true,
  "transaction": "0xTxHash",
  "network": "base-sepolia",
  "payer": "0xBuyerAddress",
  "escrowId": 42
}
```

### Header summary

| Header | Direction | When |
|---|---|---|
| `PAYMENT-REQUIRED` | Server → Client | 402 response (no payment header sent) |
| `PAYMENT-SIGNATURE` | Client → Server | Retry with signed authorization |
| `PAYMENT-RESPONSE` | Server → Client | 200 response (settlement confirmed) |

## What Xenga adds to x402

Standard x402 does direct payment. Xenga uses x402 as the transport but settles into **on-chain escrow** instead:

| Standard x402 | Xenga x402 |
|---|---|
| Funds go directly to seller | Funds go to EscrowVault contract |
| Payment is final | Payment is escrowed — released after timeout or buyer confirmation |
| No trust layer | Seller reputation included in 402 response |
| Fixed terms | Release window dynamically adjusted by reputation |

All of this is transparent to the agent. The agent signs the same `ReceiveWithAuthorization` — the difference is that `payTo` points to the EscrowVault contract instead of a seller wallet. The escrow lifecycle happens automatically after payment.

### Content hash (tamper-proof terms)

When an order includes `terms`, the facilitator computes `contentHash = keccak256(terms)` and stores it on-chain in the escrow. This provides immutable evidence of the agreed-upon terms:

- The `contentHash` is emitted in the `EscrowCreated` event and readable via `GET /api/escrows/:escrowId`.
- During a dispute, the arbiter can verify that the original terms match the on-chain hash.
- Agents can verify the `contentHash` after payment by comparing `keccak256(terms)` against the on-chain value.
- If no terms were provided, `contentHash` is `bytes32(0)`.

## After payment: escrow lifecycle

The agent doesn't need to do anything for the happy path. After payment:

```
Active → DeliveryConfirmed → AutoReleased
```

1. **Active** — USDC locked in escrow. Seller delivers the service.
2. **DeliveryConfirmed** — Seller confirms delivery (auto-confirmed for `agent-service` and `tool-call` types). Dispute window starts.
3. **AutoReleased** — After `releaseWindow + disputeWindow` expires, the facilitator's poller auto-releases funds to the seller. No action needed from the agent.

The agent can check escrow status:

```
GET /api/escrows/{escrowId}
```

Returns state (`Active`, `DeliveryConfirmed`, `Completed`, `AutoReleased`, `Disputed`, `Resolved`, `Refunded`), timing info, `isReleasable` flag, and `contentHash` (the keccak256 hash of the order terms, if provided). The agent can verify `contentHash` matches the expected terms to confirm the escrow was created with the correct agreement.

### Dispute path

If service quality fails, the agent (buyer) can dispute:

```
POST /api/disputes/{orderId}
{ "reason": "Service did not deliver expected output" }
```

An arbiter reviews and splits funds by percentage. The agent gets `buyerPct` of `(amount - fee)`.

**Timing constraints:**
- From `DeliveryConfirmed`: dispute within `disputeWindow` (default 3 days) of confirmation
- From `Active`: dispute between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow`

## Service types

The `serviceType` in the 402 response determines escrow behavior. The agent doesn't choose this — it's set by the seller when creating the order.

| Service Type | Release Window | Auto-verify | Use Case |
|---|---|---|---|
| `tool-call` | 1 minute | Yes | Single API call (search, translate, compute) |
| `inference` | 5 minutes | Yes | LLM inference, pay-per-call AI |
| `agent-service` | 1 hour | Yes | Multi-step agent workflows |
| `data-pipeline` | 1 hour | No | Batch processing, ETL |
| `marketplace` | 7 days | No | Physical goods, human services |

### Reputation-adjusted windows

Release windows are dynamically adjusted before the 402 is sent. The agent sees the final value — no computation needed.

| Condition | Effect |
|---|---|
| Both parties score >= 80, high confidence | Window shortened (e.g. 1h → 30min for agent-service) |
| Seller score < 40, medium/high confidence | Window extended (e.g. 1h → 4h for agent-service) |
| New seller (low confidence) | Default window |

## Reputation

Seller reputation is included in the 402 response at `extra.sellerReputation`:

```json
{
  "score": 82,
  "confidence": "high",
  "disputeRate": 0.03
}
```

An agent can use this to decide whether to proceed with payment. For example, reject sellers with `score < 50` or `disputeRate > 0.2`.

The agent can also query reputation directly:

```
GET /api/reputation/{address}
```

Returns full reputation breakdown (overall score, confidence, completion rate, dispute rate, volume, buyer/seller stats).

### Building reputation

Completed transactions build both buyer and seller reputation scores:
- **Confidence levels**: `"low"` (< 3 escrows), `"medium"` (3-9), `"high"` (>= 10)
- Higher reputation → shorter release windows → faster settlement
- Clean completion history improves score; disputes and refunds lower it

## Optional: `@xenga/client` SDK

For TypeScript agents that want a convenience wrapper, the `@xenga/client` package wraps the x402 flow:

```typescript
import { escrowFetch } from "@xenga/client";

const { response, payment } = await escrowFetch(
  "https://api.xenga.xyz/api/orders/ORDER_ID/pay",
  { method: "POST" },
  { walletClient }
);
```

This is purely optional. It handles header parsing, EIP-712 signing, retries, and reputation callbacks — but the underlying protocol is the same x402 flow any agent can implement directly.

See the [SDK Reference](./sdk-reference.md) for full API documentation.

## Next steps

- [SDK Reference](./sdk-reference.md) — `@xenga/client` API reference (optional convenience wrapper)
- [API Reference](./api-reference.md) — all REST endpoints, request/response schemas
- [Seller Guide](./seller-guide.md) — if you're building the service side
