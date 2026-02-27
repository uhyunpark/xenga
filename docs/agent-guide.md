# Agent Guide

Build AI agents that pay for services using on-chain escrow. This guide walks through real scenarios — from a 10-line quick integration to production flows with reputation screening, dispute handling, and x402 interoperability.

## Who this is for

- **LLM agents** paying for inference, tool calls, or data APIs
- **Autonomous bots** consuming services without human intervention
- **Multi-agent systems** where agents transact with each other

Agent payments differ from human payments: there's no one to click "confirm" — your agent needs to evaluate trust programmatically, handle failures gracefully, and manage escrow lifecycle automatically.

## Scenario 1: Quick pay

The fastest integration. One function call handles discovery, signing, settlement, and response parsing:

```typescript
import { autoPayAndVerify } from "@xenga/client/agent";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount("0xYOUR_PRIVATE_KEY"),
});

const result = await autoPayAndVerify(
  "https://api.example.com/api/orders/ORDER_ID/pay",
  { method: "POST" },
  { walletClient, minSellerReputation: 60 }
);

console.log(result.data);       // parsed API response
console.log(result.escrowId);   // on-chain escrow ID
console.log(result.txHash);     // settlement transaction
```

**What happens under the hood:**
1. Agent sends POST without payment header
2. Server returns `402` with escrow requirements + seller reputation
3. SDK checks seller reputation against `minSellerReputation` threshold
4. SDK signs ERC-3009 `receiveWithAuthorization` (gasless USDC transfer)
5. SDK retries with `PAYMENT-SIGNATURE` header
6. Server verifies signature, creates escrow on-chain, returns `200`
7. `autoPayAndVerify` parses the response body and returns structured data

## Scenario 2: Production agent flow

For production agents, break the flow into explicit steps — discover services, screen sellers, then pay with a reputation callback:

### Step 1: Discover available services

```typescript
import { discoverServices, screenSeller } from "@xenga/client/agent";
import { escrowFetch } from "@xenga/client";

const FACILITATOR = "https://api.example.com";

const info = await discoverServices(FACILITATOR);
console.log(`Chain: ${info.chain} (${info.chainId})`);
console.log(`Escrow contract: ${info.escrowContract}`);
console.log(`Services: ${info.serviceTypes.map(s => s.name).join(", ")}`);

// Find the right service type for your use case
const agentService = info.serviceTypes.find(s => s.name === "agent-service");
if (!agentService) throw new Error("agent-service not available");
```

### Step 2: Screen the seller

```typescript
const screen = await screenSeller(FACILITATOR, "0xSELLER_ADDRESS", 70);

if (!screen.acceptable) {
  console.log(`Seller rejected: score ${screen.score}, confidence ${screen.confidence}`);
  // Find alternative seller or abort
  process.exit(1);
}

console.log(`Seller approved: score ${screen.score}/100 (${screen.confidence})`);
```

`screenSeller` uses a sensible default: sellers with `"low"` confidence (fewer than 3 transactions) are accepted regardless of score — new sellers aren't penalized for having no history.

### Step 3: Pay with reputation callback

```typescript
const { response, payment } = await escrowFetch(
  `${FACILITATOR}/api/orders/${orderId}/pay`,
  { method: "POST" },
  {
    walletClient,
    onSellerReputation: (rep) => {
      // Real-time check at payment time (reputation may have changed)
      if (rep.score < 50) {
        console.log(`Seller reputation dropped to ${rep.score}, aborting`);
        return false; // throws ReputationAbortError
      }
      if (rep.disputeRate > 0.2) {
        console.log(`High dispute rate: ${rep.disputeRate}, aborting`);
        return false;
      }
      return true;
    },
  }
);

console.log(`Paid! Escrow #${payment?.escrowId}, tx: ${payment?.txHash}`);
```

### Decision tree: when to reject sellers

| Scenario | Recommendation |
|----------|---------------|
| Score < 40, confidence `"medium"` or `"high"` | Reject — established bad actor |
| Score < 40, confidence `"low"` | Accept — new seller, insufficient data |
| Score 40-70 | Accept with caution — monitor closely |
| Score > 70, confidence `"high"` | Accept — trusted seller, may get shorter release windows |
| Dispute rate > 20% | Reject regardless of score |

## Scenario 3: Handling disputes

When service quality falls below expectations, your agent can dispute the escrow. This requires the full client SDK:

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0xAGENT_PRIVATE_KEY",
  serverUrl: "https://api.example.com",
  escrowVaultAddress: "0xESCROW_CONTRACT",
  chainId: 84532,
});

// Pay for the service
const { payment } = await client.payForOrder(orderId);
const escrowId = payment.escrowId;
```

### Monitor escrow state

```typescript
const { stop } = client.watchEscrow(escrowId, async (escrow) => {
  console.log(`Escrow #${escrowId} state: ${escrow.state}`);

  if (escrow.state === 2) { // DeliveryConfirmed
    // Seller confirmed delivery — verify the output quality
    const qualityOk = await checkServiceQuality(orderId);

    if (!qualityOk) {
      console.log("Quality check failed, filing dispute");
      await client.disputeOnChain(escrowId);
    } else {
      console.log("Quality verified, releasing funds");
      await client.releaseOnChain(escrowId);
    }
    stop();
  }
});
```

### Dispute timing

Disputes must be filed within the dispute window:

- **From `DeliveryConfirmed`**: within `disputeWindow` (default 3 days) of delivery confirmation
- **From `Active`**: between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation

For `agent-service` with a 1-hour release window and 3-day dispute window, your agent has a wide window to dispute. For `tool-call` with a 1-minute release window, auto-release happens fast — run quality checks immediately.

### Quality check pattern

```typescript
async function checkServiceQuality(orderId: string): Promise<boolean> {
  const order = await client.getOrder(orderId);

  // Example: verify inference response
  if (!order.response) return false;
  if (order.response.length < 10) return false;       // empty response
  if (order.responseTime > 30000) return false;        // SLA violation

  return true;
}
```

## Scenario 4: x402 generic agent (no Xenga SDK)

Any x402-compatible agent can pay for Xenga-protected services using raw HTTP — no `@xenga/client` required. This works with Coinbase AgentKit, Circle, or any agent that implements the [x402 protocol](https://www.x402.org/).

### The 402 handshake

```typescript
import { createWalletClient, http, encodePacked, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount("0xYOUR_KEY");
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account,
});

// Step 1: Request the resource (no payment header)
const first = await fetch("https://api.example.com/api/orders/ORDER_ID/pay", {
  method: "POST",
});

if (first.status !== 402) {
  console.log("No payment required");
  process.exit(0);
}

// Step 2: Parse the x402 PAYMENT-REQUIRED header
const b64 = first.headers.get("payment-required");
const envelope = JSON.parse(atob(b64));
// envelope = { x402Version: 1, accepts: [{ scheme: "escrow", ... }] }

const req = envelope.accepts.find(a => a.scheme === "escrow");
const extra = req.extra;

// Step 3: Sign ERC-3009 ReceiveWithAuthorization
const nonce = keccak256(encodePacked(["uint256"], [BigInt(Date.now())]));
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h

const signature = await walletClient.signTypedData({
  domain: {
    name: extra.name,     // "USDC" on Base Sepolia
    version: extra.version, // "2"
    chainId: baseSepolia.id,
    verifyingContract: req.asset,
  },
  primaryType: "ReceiveWithAuthorization",
  types: {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  message: {
    from: account.address,
    to: req.payTo,                  // EscrowVault address
    value: BigInt(req.maxAmountRequired),
    validAfter: 0n,
    validBefore,
    nonce,
  },
});

// Step 4: Retry with PAYMENT-SIGNATURE header
const payload = {
  x402Version: 1,
  scheme: "escrow",
  network: req.network,
  payload: {
    signature,
    authorization: {
      from: account.address,
      to: req.payTo,
      value: req.maxAmountRequired,
      validAfter: "0",
      validBefore: validBefore.toString(),
      nonce,
    },
  },
};

const result = await fetch("https://api.example.com/api/orders/ORDER_ID/pay", {
  method: "POST",
  headers: {
    "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload)),
    "Content-Type": "application/json",
  },
});

// Step 5: Parse PAYMENT-RESPONSE header
const respB64 = result.headers.get("payment-response");
const settlement = JSON.parse(atob(respB64));
console.log(`TX: ${settlement.transaction}, Escrow: ${settlement.escrowId}`);
```

### When to use this approach

- You already have an x402-compatible agent and don't want another SDK dependency
- You're integrating with a framework (Coinbase AgentKit) that handles x402 natively
- You want full control over the signing and retry logic

For most new integrations, the `@xenga/client` SDK is simpler — it handles header parsing, format detection (x402 + legacy), retries with backoff, and reputation callbacks automatically.

## Service types for agents

Choose the service type that matches your use case:

| Service Type | Release Window | Auto-verify | Best For |
|---|---|---|---|
| `tool-call` | 1 minute | Yes | Single API calls (search, translate, compute) |
| `inference` | 5 minutes | Yes | LLM inference, pay-per-call AI endpoints |
| `agent-service` | 1 hour | Yes | Multi-step agent workflows, session-based services |
| `data-pipeline` | 1 hour | No | Batch processing, ETL jobs, data enrichment |
| `marketplace` | 7 days | No | Physical goods, human-delivered services |

### How reputation adjusts parameters

Release windows are dynamically adjusted based on both parties' reputation:

| Both parties score >= 80 (high confidence) | Seller score < 40 (non-low confidence) | Default |
|---|---|---|
| `tool-call`: 30s | `tool-call`: 5min | `tool-call`: 1min |
| `inference`: 1min | `inference`: 30min | `inference`: 5min |
| `agent-service`: 30min | `agent-service`: 4h | `agent-service`: 1h |
| `data-pipeline`: 30min | `data-pipeline`: 4h | `data-pipeline`: 1h |
| `marketplace`: 3d | `marketplace`: 14d | `marketplace`: 7d |

Higher reputation = shorter escrow hold times = faster access to funds for sellers.

## Building reputation

Reputation is computed from on-chain escrow history. Every completed transaction improves your score.

### How scores work

- **Score range**: 0-100
- **Buyer score weights**: completion rate (45%), low dispute rate (25%), low frivolous disputes (20%), volume bonus (10%)
- **Confidence levels**: `"low"` (< 3 escrows), `"medium"` (3-9), `"high"` (>= 10)

### Strategy for new agents

1. **Start small**: Use `tool-call` or `inference` service types with small amounts
2. **Complete transactions cleanly**: Release funds promptly after receiving service — this builds your completion rate
3. **Avoid frivolous disputes**: Only dispute when quality genuinely fails — frivolous disputes hurt your score
4. **Build volume**: After 10+ clean transactions, you reach `"high"` confidence — unlocking shorter release windows

### Check your reputation

```typescript
const rep = await client.getReputation(client.address);
console.log(`Score: ${rep.overall}/100 (${rep.confidence})`);
console.log(`Buyer completion: ${rep.buyer?.completionRate}`);
console.log(`Buyer disputes: ${rep.buyer?.disputeRate}`);
```

## Error handling

### Common errors

| Error | Code | Cause | Recovery |
|---|---|---|---|
| `ReputationAbortError` | `REPUTATION_ABORT` | Seller score below threshold | Find a different seller |
| `NetworkError` | `NETWORK_ERROR` | RPC timeout, DNS failure | Automatic retry with backoff |
| `InvalidPaymentHeaderError` | `INVALID_PAYMENT_HEADER` | Malformed 402 response | Check facilitator URL/version |
| `SettlementError` | `SETTLEMENT_FAILED` | On-chain tx reverted | Check USDC balance, allowance |
| `PaymentVerificationError` | `VERIFICATION_FAILED` | Bad signature | Check wallet/signing config |

### Retry pattern

The SDK retries transient failures automatically. For custom logic:

```typescript
import { withRetry, isRetryableError } from "@xenga/client";

const result = await withRetry(
  () => client.payForOrder(orderId),
  {
    maxRetries: 3,
    baseDelayMs: 2000,  // 2s, 4s, 8s
    maxDelayMs: 16000,
  }
);
```

### Structured error handling

```typescript
import {
  ReputationAbortError,
  NetworkError,
  SettlementError,
} from "@xenga/client";

try {
  const result = await autoPayAndVerify(url, init, options);
} catch (err) {
  if (err instanceof ReputationAbortError) {
    console.log(`Seller score ${err.score} too low — trying backup`);
    // Retry with a different seller
  } else if (err instanceof NetworkError) {
    console.log(`Network issue: ${err.message}`);
    // Already retried — escalate or queue for later
  } else if (err instanceof SettlementError) {
    console.log(`Settlement failed: ${err.message}`);
    // Check USDC balance, gas, or contract state
  }
}
```

## Next steps

- [SDK Reference](./sdk-reference.md) — complete API reference for all client methods
- [API Reference](./api-reference.md) — REST endpoints, request/response schemas
- [Seller Guide](./seller-guide.md) — if you're also building the service side
