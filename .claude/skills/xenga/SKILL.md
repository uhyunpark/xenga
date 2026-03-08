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

USDC escrow on Base. x402-compatible — handles 402 automatically.

**Base URL:** `https://api.xenga.xyz`
**Chain:** Base Sepolia (84532)
**USDC:** 6 decimals

## Pay for a Service

Use `escrowFetch` — drop-in `fetch` replacement. Handles 402 → sign → pay automatically.

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

### Reject Low-Reputation Sellers

```typescript
const { response } = await escrowFetch(url, init, {
  walletClient,
  onSellerReputation: (rep) => rep.score >= 60, // return false to abort
});
```

### What Happens Under the Hood

1. POST to endpoint → server returns **402** with `PAYMENT-REQUIRED` header
2. `escrowFetch` parses the 402, signs ERC-3009 `ReceiveWithAuthorization` (EIP-712, USDC gasless transfer)
3. Retries with `PAYMENT-SIGNATURE` header → **200** + service response + `escrowId`

No special headers or config needed. The 402 response contains everything: escrow contract, USDC address, amount, orderId, seller, releaseWindow, serviceType.

## Check Escrow & Reputation (No Auth)

```
GET /api/escrows/:escrowId     → escrow state, amounts, timestamps
GET /api/reputation/:address   → score (0-100), confidence, dispute rate
GET /health                    → server status, contract addresses
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

## For Developers

Seller setup, order management, webhooks, payment links, SDK, SIWE auth — see `references/api-reference.md`.
