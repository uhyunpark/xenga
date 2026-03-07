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

On-chain escrow + reputation on Base using USDC. Three roles:

- **Agent/Buyer** — pays for services, funds held in escrow until delivery
- **Seller** — provides services, gets paid when buyer releases or auto-release triggers
- **Arbiter** — resolves disputes by splitting funds

## Install

```bash
npm install @xenga/client viem
```

## Agent: Pay for Services

Agents use `escrowFetch` or `autoPayAndVerify` to pay for any x402-protected endpoint. The payment flow is automatic: send request → get 402 → sign ERC-3009 → retry with signature → done.

### Quick Start

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: process.env.WALLET_PRIVATE_KEY as `0x${string}`,
  serverUrl: process.env.XENGA_SERVER_URL!, // Xenga API endpoint
  chainId: 84532, // Base Sepolia (default) or 8453 (Base Mainnet)
});

// Pay for an order (handles 402 → sign → settle automatically)
const { order, payment } = await client.payForOrder(orderId);
console.log(`Paid! escrowId=${payment.escrowId} tx=${payment.txHash}`);
```

### escrowFetch — Drop-in for any URL

```typescript
import { escrowFetch } from "@xenga/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`),
});

// Works like fetch() — handles 402 payment flow transparently
const { response, payment } = await escrowFetch(
  "https://ai-service.example.com/api/inference",
  { method: "POST", body: JSON.stringify({ prompt: "hello" }) },
  {
    walletClient,
    onSellerReputation: (rep) => rep.score >= 60, // abort if seller rep too low
  }
);

const data = await response.json();
```

### autoPayAndVerify — One-call for agents

```typescript
import { autoPayAndVerify } from "@xenga/client";

const result = await autoPayAndVerify(
  "https://ai-service.example.com/api/task",
  { method: "POST", body: JSON.stringify({ task: "analyze data" }) },
  {
    walletClient,
    minSellerReputation: 60, // skip sellers with low rep
  }
);

console.log(result.data);       // service response
console.log(result.escrowId);   // on-chain escrow ID
console.log(result.txHash);     // settlement transaction
```

### Check Reputation Before Paying

```typescript
import { screenSeller } from "@xenga/client";

const result = await screenSeller(serverUrl, "0xSellerAddress", 50);
if (!result.acceptable) {
  console.log(`Seller score ${result.score} (${result.confidence}) — skipping`);
}
```

### Discover Available Services

```typescript
import { discoverServices } from "@xenga/client";

const info = await discoverServices(serverUrl);
console.log(info.chain);         // "base-sepolia"
console.log(info.serviceTypes);  // [{ name: "agent-service", releaseWindow: 3600, ... }]
```

## Buyer: Manage Escrows

After paying, buyers can release funds, dispute, or monitor escrow state.

```typescript
const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "...",
  escrowVaultAddress: "0x...", // needed for on-chain calls
});

// Release funds to seller (marks as completed)
await client.releaseOnChain(escrowId);

// Dispute an escrow (within dispute window)
await client.disputeOnChain(escrowId);

// Monitor escrow state changes
const { stop } = client.watchEscrow(escrowId, (escrow) => {
  console.log(`State: ${escrow.state}`); // Active, DeliveryConfirmed, Completed, etc.
});

// Read operations (no gas needed)
const order = await client.getOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0xAddress");
```

## Seller: Accept Payments

Sellers create orders and get paid through escrow. Two options: use the dashboard UI or integrate via API.

### Via API

```typescript
const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "...",
  escrowVaultAddress: "0x...",
});

// Confirm delivery (starts auto-release countdown)
await client.confirmDeliveryOnChain(escrowId);

// Voluntary refund
await client.refundOnChain(escrowId);
```

### Protect Your Endpoints (x402 Middleware)

Make any endpoint payment-protected. When an agent hits it without paying, they get a 402 with payment instructions. The agent's `escrowFetch` handles the rest.

See `references/api-reference.md` for full endpoint specs for creating orders, managing webhooks, API keys, and payment links.

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

- **Active**: USDC locked. Buyer can release, seller can confirm delivery or refund.
- **DeliveryConfirmed**: Dispute window starts. Buyer can release or dispute.
- **AutoRelease**: Automatic when release window expires — no action needed.
- **Disputed**: Arbiter resolves with `buyerPct` (0–100). Split applies to `amount - fee`.
- **Refunded**: Buyer gets full deposit back including fee.

## Authentication

| Method | Header | Who uses it |
|--------|--------|-------------|
| API key | `X-API-KEY: xng_...` | Sellers creating orders, managing webhooks |
| SIWE session | `Authorization: Bearer <jwt>` | Dashboard users (profile, API keys, payment links) |
| No auth | — | Reputation lookup, escrow state, health |

## x402 Payment Flow (Protocol Details)

For SDK users this is handled automatically. For custom implementations:

```
1. POST /api/orders/:id/pay (no payment header)
   ← 402 + PAYMENT-REQUIRED header (base64 JSON x402 envelope)

2. Client signs ERC-3009 ReceiveWithAuthorization (EIP-712)
   domain: { name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }
   message: { from, to (escrowVault), value, validAfter: 0, validBefore, nonce }

3. POST /api/orders/:id/pay + PAYMENT-SIGNATURE header (base64 JSON)
   → 200: { order, payment: { success, txHash, escrowId } }
```

## Reference

Full API endpoint specs, webhook format, fee system, reputation scoring, and error codes: see `references/api-reference.md`.
