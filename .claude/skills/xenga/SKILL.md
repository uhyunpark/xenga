---
name: xenga
description: >
  On-chain escrow payments for AI agents using USDC on Base.
  Handles payment-protected endpoints, ERC-3009 gasless transfers,
  escrow settlement, delivery confirmation, disputes, and reputation scoring.
  Use when: integrating x402/escrow payments, creating payment-protected services,
  managing orders/escrows, checking wallet reputation, or building with the Xenga protocol.
---

# Xenga Protocol

On-chain escrow + reputation system on Base (Sepolia/Mainnet) using USDC. x402-compatible — any x402 agent can pay without Xenga-specific code. Two roles: **seller** (creates orders, confirms delivery) and **buyer** (pays, can dispute).

## Quick Reference

```
Base URL:  $XENGA_URL (your Xenga server)
Auth:      X-API-KEY: xng_...  (seller/operator)
           Authorization: Bearer <jwt>  (SIWE session)
Chain:     Base Sepolia (84532) | Base Mainnet (8453)
USDC:      6 decimals
```

### Endpoints

| Category | Method | Path | Auth | Description |
|----------|--------|------|------|-------------|
| **Orders** | POST | `/api/orders` | API key | Create order |
| | GET | `/api/orders/:id` | — | Get order details |
| | POST | `/api/orders/:id/pay` | escrow flow | x402 payment (402 -> sign -> settle) |
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

Full endpoint reference: see `references/api-reference.md`

## Seller Setup

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

# 4. Create API key (key shown ONCE)
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

The core integration for buyers/agents paying for services.

```
Step 1: POST /api/orders/:id/pay (no payment header)
  <- 402 with PAYMENT-REQUIRED header (base64 JSON)
  <- Body: { scheme, amount, orderId, sellerAddress, releaseWindow,
             serviceType, sellerReputation }

Step 2: Sign ERC-3009 ReceiveWithAuthorization (EIP-712)
  domain: { name: "USDC", version: "2", chainId, verifyingContract: usdcAddress }
  message: { from, to (escrowVault), value, validAfter: 0, validBefore, nonce }
  -> walletClient.signTypedData()

Step 3: POST /api/orders/:id/pay with PAYMENT-SIGNATURE header (base64 JSON)
  payload: { x402Version: 1, scheme: "escrow", network, payload: {
    signature: "0x...",
    authorization: { from, to, value, validAfter, validBefore, nonce }
  }}
  -> 200: { order, payment: { success, txHash, escrowId } }
```

## Client SDK

```typescript
import { createEscrowClient, escrowFetch } from "@xenga/client";

// Option 1: Full client (buyer + seller operations)
const client = createEscrowClient({
  privateKey: "0x...",
  serverUrl: "https://your-xenga-server.com",
  escrowVaultAddress: "0x...", // needed for on-chain calls
  chainId: 84532, // Base Sepolia (default) or 8453 (Base Mainnet)
});

// Pay for an order (handles 402 -> sign -> settle automatically)
const { order, payment } = await client.payForOrder(orderId);

// Read operations
const order = await client.getOrder(orderId);
const escrow = await client.getEscrow(escrowId);
const rep = await client.getReputation("0x...");

// On-chain operations (require escrowVaultAddress + ETH for gas)
await client.releaseOnChain(escrowId);       // buyer releases funds
await client.disputeOnChain(escrowId);       // buyer disputes
await client.confirmDeliveryOnChain(escrowId); // seller confirms
await client.refundOnChain(escrowId);        // seller refunds

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

## Authentication Types

| Method | Header | Used for |
|--------|--------|----------|
| API key | `X-API-KEY: xng_...` | Order CRUD, webhooks (seller/operator) |
| SIWE session | `Authorization: Bearer <jwt>` | Profile, API keys, payment links (dashboard) |
| No auth | — | Reputation, escrow state, health, payment link details |

## Advanced

For full endpoint specs with request/response examples, webhook delivery format, fee system details, reputation scoring formulas, and error codes, see `references/api-reference.md`.
