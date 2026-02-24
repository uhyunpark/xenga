# @xenga/client

Client SDK for xenga escrow payments — handles the full xenga protocol flow, ERC-3009 signing, and on-chain escrow operations.

## Install

```bash
npm install @xenga/client viem
```

## Quick start

### Pay for a resource with `escrowFetch()`

Drop-in replacement for `fetch()` that handles the xenga payment protocol automatically:

```ts
import { escrowFetch } from "@xenga/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount("0x..."),
});

// 1. Request hits server → gets 402 → signs USDC authorization → retries with payment
const { response, payment } = await escrowFetch(
  "https://api.example.com/premium-endpoint",
  { method: "POST", body: JSON.stringify({ query: "data" }) },
  {
    walletClient,
    onSellerReputation: (rep) => rep.score > 50,  // abort if seller rep is low
  }
);

console.log(payment?.escrowId);  // on-chain escrow ID
const data = await response.json();
```

### Full client with buyer/seller operations

```ts
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://facilitator.example.com",
  escrowVaultAddress: "0x...",
  chainId: 84532,  // Base Sepolia (default)
});

// Buyer: pay for an order
const { order, payment } = await client.payForOrder("order-uuid");

// Buyer: release funds (with automatic retry + receipt confirmation)
await client.releaseOnChain(payment.escrowId);

// Seller: confirm delivery
await client.confirmDeliveryOnChain(payment.escrowId);

// Check reputation
const rep = await client.getReputation("0xSellerAddress");
console.log(rep.overall.score, rep.overall.confidence);

// Watch for state changes
const { stop } = client.watchEscrow(payment.escrowId, (escrow) => {
  console.log("State changed:", escrow.state);
  if (escrow.state === 3) stop(); // Completed
});
```

## Features

- **`escrowFetch()`** — Wraps `fetch()` to handle 402 → sign → retry automatically
- **`createEscrowClient()`** — Full buyer + seller operations (pay, release, dispute, confirm delivery, refund)
- **Retry with backoff** — All on-chain writes retry on transient failures (RPC timeout, nonce errors)
- **Receipt confirmation** — On-chain calls wait for transaction confirmation by default
- **`watchEscrow()`** — Poll for escrow state changes with callback
- **Reputation gating** — `onSellerReputation` callback to abort payment if seller score is too low

## API

### `escrowFetch(url, init, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `walletClient` | `WalletClient` | required | viem wallet client with account |
| `usdcAddress` | `Address` | chain default | USDC token address |
| `onSellerReputation` | `(rep) => boolean` | — | Return false to abort payment |
| `timeoutMs` | `number` | 30000 | Request timeout |
| `retryOptions` | `RetryOptions` | 3 retries | Retry config for payment submission |

### `createEscrowClient(config)`

| Config | Type | Default | Description |
|--------|------|---------|-------------|
| `privateKey` | `Hex` | — | Private key (or provide `walletClient`) |
| `walletClient` | `WalletClient` | — | Pre-configured wallet client |
| `serverUrl` | `string` | required | Facilitator API URL |
| `escrowVaultAddress` | `Address` | — | Required for on-chain calls |
| `chainId` | `number` | 84532 | Base Sepolia (84532) or Base Mainnet (8453) |
| `retryOptions` | `RetryOptions` | 3 retries | Retry config for on-chain writes |

## Peer dependencies

- `viem` ^2.21.0
