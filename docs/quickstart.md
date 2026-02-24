# Quickstart

Get up and running with x402 escrow payments in 5 minutes.

## Install

```bash
npm install @x402/client viem
# or
bun add @x402/client viem
```

## 1. Pay for an order with `escrowFetch`

The simplest integration. `escrowFetch` wraps `fetch()` and handles the entire x402 payment flow automatically:

```typescript
import { escrowFetch } from "@x402/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account,
});

// Just like fetch(), but handles 402 payment flow automatically
const { response, payment } = await escrowFetch(
  "https://api.example.com/api/orders/ORDER_ID/pay",
  { method: "POST" },
  { walletClient }
);

console.log("Escrow ID:", payment?.escrowId);
console.log("TX Hash:", payment?.txHash);
```

**What happens under the hood:**
1. Client sends POST without payment header
2. Server returns `402` with payment requirements in headers
3. Client signs an ERC-3009 `receiveWithAuthorization` (USDC gasless transfer)
4. Client retries with `PAYMENT-SIGNATURE` header
5. Server verifies signature, creates escrow on-chain, returns `200`

## 2. Using the full client SDK

For more control, use `createEscrowClient`:

```typescript
import { createEscrowClient } from "@x402/client";

const client = createEscrowClient({
  privateKey: "0xYOUR_PRIVATE_KEY",
  serverUrl: "https://api.example.com",
  escrowVaultAddress: "0xCONTRACT_ADDRESS", // for on-chain calls
  chainId: 84532, // Base Sepolia (default). Use 8453 for Base Mainnet.
});

// Pay for an order (handles full x402 flow)
const { order, payment } = await client.payForOrder("ORDER_ID");

// Release funds (buyer confirms receipt)
const txHash = await client.releaseOnChain(payment.escrowId);

// Or dispute (within dispute window)
const txHash2 = await client.disputeOnChain(payment.escrowId);
```

### Seller operations

```typescript
// Confirm delivery (starts dispute window countdown)
await client.confirmDeliveryOnChain(escrowId);

// Voluntary refund
await client.refundOnChain(escrowId);

// Check on-chain stats
const stats = await client.getSellerStats();
console.log(`Completed: ${stats.completedCount}/${stats.totalEscrows}`);

// Check ETH balance before transacting
const { eth } = await client.getBalance();
console.log(`ETH balance: ${eth}`);
```

## 3. Check seller reputation before paying

```typescript
const { response, payment } = await escrowFetch(
  url,
  { method: "POST" },
  {
    walletClient,
    onSellerReputation: (rep) => {
      if (rep.score < 50) {
        console.log("Low reputation seller, aborting");
        return false; // abort payment
      }
      return true; // proceed
    },
  }
);
```

## 4. Server-side: protect an endpoint with escrow payment

### Express

```typescript
import { escrowPaymentMiddleware } from "@x402/server/express";

router.post("/:id/pay", escrowPaymentMiddleware(), (req, res) => {
  // Only reaches here after successful payment
  res.json({
    message: "Payment successful",
    order: req.order,
    payment: req.escrowPayment,
  });
});
```

### Next.js App Router

```typescript
import { handleEscrowPayment, toNextResponse } from "@x402/server/nextjs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleEscrowPayment(request, { id }, deps);
  return toNextResponse(result);
}
```

Both adapters delegate to the same framework-independent `processEscrowPayment()` core. You provide dependencies via the `PaymentDeps` interface — see [API Reference](./api-reference.md) for details.

## Next steps

- [API Reference](./api-reference.md) — all endpoints, request/response schemas, error codes
- [Seller Guide](./seller-guide.md) — running the facilitator server, webhooks, fee configuration
