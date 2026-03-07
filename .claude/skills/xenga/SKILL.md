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

On-chain escrow + reputation on Base using USDC. x402-compatible — any x402 agent can pay for any escrow-protected endpoint without Xenga-specific code.

## Install

```bash
npm install @xenga/client viem
```

## Agent: Pay for Any x402 Endpoint

Use `escrowFetch` as a drop-in replacement for `fetch`. If the endpoint returns 402, it automatically signs an ERC-3009 authorization and retries with payment. No configuration needed — the 402 response contains everything.

```typescript
import { escrowFetch } from "@xenga/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount("0x..."),
});

// Just fetch. If it's x402-protected, payment happens automatically.
const { response, payment } = await escrowFetch(
  "https://some-ai-service.com/api/inference",
  { method: "POST", body: JSON.stringify({ prompt: "hello" }) },
  { walletClient }
);

const data = await response.json();
// payment?.escrowId, payment?.txHash available if payment occurred
```

### Check Seller Reputation Before Paying

```typescript
const { response, payment } = await escrowFetch(url, init, {
  walletClient,
  onSellerReputation: (rep) => rep.score >= 60, // return false to abort
});
```

### One-Call Agent Helper

```typescript
import { autoPayAndVerify } from "@xenga/client";

const result = await autoPayAndVerify(
  "https://some-ai-service.com/api/task",
  { method: "POST", body: JSON.stringify({ task: "analyze data" }) },
  { walletClient, minSellerReputation: 60 }
);

console.log(result.data);       // service response
console.log(result.escrowId);   // on-chain escrow ID
```

### Discover & Screen

```typescript
import { discoverServices, screenSeller } from "@xenga/client";

// What services does this endpoint support?
const info = await discoverServices("https://some-ai-service.com");
// info.serviceTypes: [{ name: "agent-service", releaseWindow: 3600, ... }]

// Is this seller trustworthy?
const result = await screenSeller("https://some-ai-service.com", "0xSellerAddr", 50);
if (!result.acceptable) console.log(`Score ${result.score} too low`);
```

## Buyer: Manage Escrows After Payment

After paying, buyers can release funds, dispute, or watch state.

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://the-service-you-paid.com", // the service you transacted with
  escrowVaultAddress: "0x...", // from the 402 response or health endpoint
});

await client.releaseOnChain(escrowId);    // release funds to seller
await client.disputeOnChain(escrowId);    // dispute within window

const { stop } = client.watchEscrow(escrowId, (escrow) => {
  console.log(`State: ${escrow.state}`);
});

// Read-only (no gas)
const order = await client.getOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0xAddress");
```

## Seller: Protect Endpoints & Manage Orders

Sellers add Xenga's x402 middleware to their endpoints. Any agent that hits a protected endpoint gets a 402 with payment instructions — their `escrowFetch` handles the rest.

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://your-own-service.com",
  escrowVaultAddress: "0x...",
});

await client.confirmDeliveryOnChain(escrowId); // triggers auto-release countdown
await client.refundOnChain(escrowId);          // voluntary refund
```

Full API reference for order creation, webhooks, API keys, and payment links: see `references/api-reference.md`.

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

## x402 Protocol Details

For custom implementations (SDK handles this automatically):

```
1. POST any-protected-endpoint (no payment header)
   ← 402 + PAYMENT-REQUIRED header (base64 JSON x402 envelope)
   Contains: escrow contract, USDC address, amount, orderId, seller, releaseWindow

2. Client signs ERC-3009 ReceiveWithAuthorization (EIP-712)
   domain: { name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }
   message: { from, to (escrowVault), value, validAfter: 0, validBefore, nonce }

3. Retry same endpoint + PAYMENT-SIGNATURE header (base64 JSON)
   → 200 + response data + PAYMENT-RESPONSE header (txHash, escrowId)
```

## Reference

Full API specs, webhook format, fee system, reputation scoring: see `references/api-reference.md`.
