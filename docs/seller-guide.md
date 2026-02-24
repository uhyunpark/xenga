# Seller Integration Guide

This guide covers everything a seller needs to integrate xenga escrow payments into an existing system.

## Architecture overview

```
Buyer                    Facilitator Server              Blockchain
  │                           │                             │
  ├─ POST /orders/:id/pay ──→│                             │
  │←── 402 + requirements ───┤                             │
  ├─ sign ERC-3009 ─────────→│                             │
  │                           ├─ verify signature          │
  │                           ├─ createEscrowWithAuth() ──→│
  │                           │←── txHash + escrowId ──────┤
  │←── 200 + payment ────────┤                             │
  │                           │                             │
  │  [Seller delivers]        │                             │
  │                           │                             │
  ├─ confirmDelivery() ──────────────────────────────────→│
  │  [Dispute window runs]    │                             │
  ├─ releaseFunds() ─────────────────────────────────────→│
  │  [or autoRelease after timeout]                        │
```

The **facilitator server** is the intermediary that:
- Manages orders in a database
- Handles the xenga HTTP flow (402 → verify → settle)
- Pays gas for `createEscrowWithAuth` on behalf of buyers
- Syncs on-chain events to local state
- Dispatches webhooks on escrow lifecycle changes

## Setting up the facilitator server

### 1. Environment variables

Copy `.env.example` and configure:

```bash
# Required
PRIVATE_KEY=0x...              # Operator wallet (pays gas, acts as arbiter)
ESCROW_VAULT_ADDRESS=0x...     # Deployed EscrowVault contract address

# Chain (optional, default: Base Sepolia)
CHAIN_ID=84532                 # 84532=Base Sepolia, 8453=Base Mainnet

# RPC (optional, default: public RPC for selected chain)
BASE_SEPOLIA_RPC=https://sepolia.base.org

# API authentication (recommended for production)
API_KEYS=sk_live_abc123,sk_live_def456

# Fee configuration (optional)
FEE_BPS=100                    # 1% facilitator fee
FEE_FLAT_USDC=50000            # + $0.05 flat fee (covers gas)
FEE_RECIPIENT=0x...            # Address to receive fees
```

### 2. Start the server

```bash
bun install
bun run dev    # development with watch
bun run start  # production
```

The server will:
- Validate configuration on startup
- Initialize SQLite database
- Start watching on-chain events
- Monitor operator wallet balance
- Clean up stuck `pending_payment` orders every 5 minutes

### 3. Fund the operator wallet

The operator wallet (`PRIVATE_KEY`) pays gas for:
- `createEscrowWithAuth` — every payment
- `resolveDispute` — when arbiter resolves disputes
- `refund` — when arbiter-initiated

Fund it with ETH on your target chain. The server logs warnings when balance drops below 0.01 ETH.

## Creating orders

```bash
curl -X POST https://your-server/api/orders \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: sk_live_abc123" \
  -d '{
    "title": "Premium Widget",
    "description": "A high-quality widget",
    "price": 25.00,
    "serviceType": "marketplace",
    "sellerAddress": "0xYOUR_SELLER_ADDRESS"
  }'
```

The `sellerAddress` is where USDC will be sent when the escrow is released.

## Service types

| Type | Release window | Dispute window | Auto-verify |
|------|---------------|----------------|-------------|
| `marketplace` | 7 days (adjustable by reputation) | 3 days | No |
| `agent-service` | 1 hour | 3 days | Yes (5s delay) |

### Custom service types

Register your own service type:

```typescript
import { registerServiceType } from "@xenga/server";

registerServiceType({
  name: "saas-subscription",
  releaseWindow: 24 * 60 * 60,  // 1 day
  autoVerify: true,
  description: "SaaS with 1-day release window",
  adjustParams(params, reputation) {
    // Trusted sellers get shorter window
    if (reputation.sellerScore >= 80 && reputation.sellerConfidence === "high") {
      return { ...params, releaseWindow: 12 * 60 * 60 }; // 12 hours
    }
    return params;
  },
});
```

## Seller actions (on-chain)

After a buyer pays and the escrow is active, the seller can:

### Confirm delivery

Signals that the service/goods have been delivered. Starts the dispute window countdown.

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0xSELLER_PRIVATE_KEY",
  serverUrl: "https://your-server",
  escrowVaultAddress: "0xCONTRACT",
  chainId: 84532,
});

await client.confirmDeliveryOnChain(escrowId);
```

### Voluntary refund

The seller can refund the buyer at any time while the escrow is active. The buyer receives the full amount (including facilitator fee — the facilitator absorbs the cost).

```typescript
await client.refundOnChain(escrowId);
```

### Check stats

```typescript
const stats = await client.getSellerStats();
console.log(`Total escrows: ${stats.totalEscrows}`);
console.log(`Completed: ${stats.completedCount}`);
console.log(`Disputed: ${stats.disputedCount}`);
```

## Webhooks

Register webhooks to receive real-time notifications when escrow state changes.

### Register

```bash
curl -X POST https://your-server/api/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: sk_live_abc123" \
  -d '{
    "url": "https://yourapp.com/webhooks/xenga",
    "secret": "whsec_your_secret_here_min16chars",
    "eventTypes": ["escrow.created", "escrow.released", "escrow.disputed", "escrow.refunded"]
  }'
```

### Handle

```typescript
app.post("/webhooks/xenga", (req, res) => {
  // Verify signature
  const signature = req.headers["x-webhook-signature"];
  const expected = createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (signature !== `sha256=${expected}`) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;
  switch (event.type) {
    case "escrow.created":
      // Start fulfillment
      break;
    case "escrow.released":
      // Mark order as complete, reconcile payment
      break;
    case "escrow.disputed":
      // Alert seller, prepare evidence
      break;
    case "escrow.refunded":
      // Update order status
      break;
  }

  res.sendStatus(200);
});
```

### Event types

| Event | When |
|-------|------|
| `escrow.created` | Buyer's payment is locked in escrow |
| `delivery.confirmed` | Seller confirmed delivery (dispute window starts) |
| `escrow.released` | Buyer released funds to seller |
| `escrow.auto_released` | Auto-release triggered after timeout |
| `escrow.disputed` | Buyer filed a dispute |
| `escrow.resolved` | Arbiter resolved the dispute |
| `escrow.refunded` | Escrow refunded to buyer |

## Fee configuration

The facilitator fee is deducted from the seller's payout at settlement. The buyer always pays exactly the order price.

```
Buyer pays:    $25.00 (order price)
Seller gets:   $25.00 - fee
Fee:           ($25.00 * 1%) + $0.05 = $0.30
Seller net:    $24.70
```

On refund, the buyer gets the full $25.00 back. The facilitator absorbs the fee loss.

Configure via environment:
- `FEE_BPS` — percentage in basis points (100 = 1%, max 1000 = 10%)
- `FEE_FLAT_USDC` — flat fee in USDC smallest unit (50000 = $0.05)
- `FEE_RECIPIENT` — address to receive fees (required when fees > 0)

## Escrow lifecycle

```
None → Active → DeliveryConfirmed → Completed      (buyer releases)
         │             │              AutoReleased   (timeout)
         │             └────────────→ Disputed ──→ Resolved (arbiter)
         └───────────────────────────→ Refunded   (seller/arbiter)
```

**Timing:**
- **Auto-release from Active:** after `releaseWindow + disputeWindow`
- **Auto-release from DeliveryConfirmed:** after `releaseWindow` from creation AND `disputeWindow` from delivery confirmation
- **Dispute from DeliveryConfirmed:** within `disputeWindow` of delivery confirmation
- **Dispute from Active:** between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow`

## Custom database integration

The server uses SQLite by default, but the `PaymentDeps` interface allows you to plug in any database. You need to implement:

- `getOrderById(id)` — fetch an order
- `updateOrderStatus(id, update)` — update order after settlement
- `claimOrder(id)` — atomically transition `created` → `pending_payment`
- `revertOrderClaim(id)` — revert on settlement failure

See `src/server/middleware/types.ts` for the full `PaymentDeps` interface.

## Security considerations

- **Operator wallet**: The `PRIVATE_KEY` is a hot wallet. In production, consider KMS/HSM solutions.
- **Arbiter trust**: By default, the operator is also the dispute arbiter. Configure `ARBITER_ADDRESS` separately if needed.
- **API keys**: Always set `API_KEYS` in production to prevent unauthorized order creation.
- **Fee absorption**: On refund, the facilitator absorbs the fee. Factor this into pricing.
