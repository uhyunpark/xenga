# SDK Reference

Complete reference for the `@xenga/client` SDK. For a quick introduction, see the [Quickstart](./quickstart.md).

## Installation

```bash
npm install @xenga/client viem
# or
bun add @xenga/client viem
```

## `escrowFetch(url, init, options)`

Drop-in `fetch()` wrapper that handles the xenga 402 payment flow automatically.

```typescript
import { escrowFetch } from "@xenga/client";

const { response, payment } = await escrowFetch(
  "https://api.example.com/api/orders/ORDER_ID/pay",
  { method: "POST" },
  { walletClient }
);
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `url` | `string` | The endpoint URL (typically `/api/orders/:id/pay`) |
| `init` | `RequestInit \| undefined` | Standard fetch options (method, headers, body) |
| `options` | `EscrowFetchOptions` | Wallet and payment configuration |

### `EscrowFetchOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `walletClient` | `WalletClient` | **required** | viem WalletClient with an account for signing |
| `usdcAddress` | `Address` | Chain default | USDC contract address (for EIP-712 domain) |
| `onSellerReputation` | `(rep: SellerReputationInfo) => boolean` | — | Called with seller reputation from the 402 response. Return `false` to abort payment. |
| `timeoutMs` | `number` | `30000` | Request timeout in milliseconds |
| `retryOptions` | `RetryOptions` | 3 retries | Retry configuration for the payment submission step |

### Return value

```typescript
{
  response: Response;       // The final HTTP response
  payment?: EscrowPaymentResponse;  // Present if payment was made
}
```

### How it works

1. Sends the request to the server
2. If the server returns `402` with payment requirements in headers, signs an ERC-3009 `receiveWithAuthorization`
3. Retries the request with the `PAYMENT-SIGNATURE` header
4. Returns the final response with escrow details

### Example: abort on low reputation

```typescript
const { response, payment } = await escrowFetch(url, { method: "POST" }, {
  walletClient,
  onSellerReputation: (rep) => {
    if (rep.score < 50) return false; // abort — throws ReputationAbortError
    return true;
  },
});
```

---

## `createEscrowClient(config)`

Full-featured client for managing escrow payments, on-chain operations, and reputation queries.

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: "0xYOUR_PRIVATE_KEY",
  serverUrl: "https://api.example.com",
  escrowVaultAddress: "0xCONTRACT_ADDRESS",
});
```

### `EscrowClientConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `privateKey` | `Hex` | — | Private key for signing. Provide this **or** `walletClient`. |
| `walletClient` | `WalletClient` | — | Pre-configured viem WalletClient. Provide this **or** `privateKey`. |
| `serverUrl` | `string` | **required** | Facilitator server URL |
| `rpcUrl` | `string` | Chain default | Custom RPC endpoint |
| `usdcAddress` | `Address` | Chain default | USDC contract address |
| `escrowVaultAddress` | `Address` | — | EscrowVault contract address. Required for on-chain calls (`releaseOnChain`, `disputeOnChain`, etc.). |
| `chainId` | `number` | `84532` | Chain ID. Use `84532` for Base Sepolia, `8453` for Base Mainnet. |
| `retryOptions` | `RetryOptions` | 3 retries | Retry configuration for on-chain write operations |

### Return value

Returns an object with `address`, `walletClient`, and the methods documented below.

---

### Payment

#### `payForOrder(orderId)`

Pay for an order using the full xenga 402 flow.

```typescript
const { order, payment } = await client.payForOrder("order-123");
console.log("Escrow ID:", payment.escrowId);
console.log("TX Hash:", payment.txHash);
```

| Parameter | Type | Description |
|---|---|---|
| `orderId` | `string` | The order ID to pay for |

**Returns:** `Promise<{ order: OrderWithPrice; payment: EscrowPaymentResponse }>`

---

### Escrow lifecycle (on-chain)

These methods call the EscrowVault contract directly. All require `escrowVaultAddress` in the client config. Each pre-checks your ETH balance and retries on transient failures.

#### `releaseOnChain(escrowId, waitForReceipt?)`

Release escrowed funds to the seller. Called by the buyer to confirm they received the goods/service.

```typescript
const txHash = await client.releaseOnChain(123);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `escrowId` | `number` | **required** | On-chain escrow ID |
| `waitForReceipt` | `boolean` | `true` | Wait for on-chain confirmation before returning |

**Returns:** `Promise<Hash>` — transaction hash

#### `disputeOnChain(escrowId, waitForReceipt?)`

Dispute an escrow. Must be called within the dispute window.

```typescript
const txHash = await client.disputeOnChain(123);
```

**Parameters:** Same as `releaseOnChain`.

**Dispute timing:**
- From `DeliveryConfirmed` state: within `disputeWindow` of delivery confirmation
- From `Active` state: between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation

#### `confirmDeliveryOnChain(escrowId, waitForReceipt?)`

Confirm delivery of goods/service. Called by the seller to start the dispute window countdown.

```typescript
const txHash = await client.confirmDeliveryOnChain(123);
```

**Parameters:** Same as `releaseOnChain`.

#### `refundOnChain(escrowId, waitForReceipt?)`

Refund the buyer. Can be called by the seller (voluntary) or arbiter.

```typescript
const txHash = await client.refundOnChain(123);
```

**Parameters:** Same as `releaseOnChain`.

---

### Read-only helpers

#### `getOrder(orderId)`

Get order details from the facilitator server.

```typescript
const order = await client.getOrder("order-123");
console.log(order.status); // "escrowed"
```

**Returns:** `Promise<OrderWithPrice>`

#### `getEscrow(escrowId)`

Get on-chain escrow details.

```typescript
const escrow = await client.getEscrow(123);
console.log(EscrowState[escrow.state]); // "Active"
```

**Returns:** `Promise<OnChainEscrow>`

#### `getReputation(address)`

Get the computed reputation score for any address.

```typescript
const rep = await client.getReputation("0x...");
console.log(`Score: ${rep.overall}/100 (${rep.confidence})`);
```

**Returns:** `Promise<ReputationScore>`

#### `getSellerStats(address?)`

Get seller stats directly from the EscrowVault contract. Defaults to the client's own address.

```typescript
const stats = await client.getSellerStats();
console.log(`Completed: ${stats.completedCount}/${stats.totalEscrows}`);
```

**Returns:** `Promise<Stats>`

#### `getBuyerStats(address?)`

Get buyer stats directly from the contract. Defaults to the client's own address.

**Returns:** `Promise<Stats>`

#### `getBalance()`

Get the ETH balance of the connected wallet.

```typescript
const { eth, wei } = await client.getBalance();
console.log(`ETH: ${eth}`);
```

**Returns:** `Promise<{ eth: string; wei: bigint }>`

#### `watchEscrow(escrowId, callback, pollIntervalMs?)`

Poll for escrow state changes. Calls `callback` whenever the state changes.

```typescript
const { stop } = client.watchEscrow(123, (escrow) => {
  console.log("New state:", EscrowState[escrow.state]);
  if (escrow.state === EscrowState.Completed) stop();
});
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `escrowId` | `number` | **required** | Escrow to watch |
| `callback` | `(escrow: OnChainEscrow) => void` | **required** | Called on each state change |
| `pollIntervalMs` | `number` | `5000` | Polling interval |

**Returns:** `{ stop: () => void }` — call `stop()` to stop polling

---

## `signEscrowPayment(walletClient, paymentRequired, usdcAddress?)`

Low-level function to sign an ERC-3009 `receiveWithAuthorization` for escrow payment. Used internally by `escrowFetch`.

```typescript
import { signEscrowPayment } from "@xenga/client";

const payload = await signEscrowPayment(walletClient, paymentRequired);
// payload is ready for the X-PAYMENT header
```

| Parameter | Type | Description |
|---|---|---|
| `walletClient` | `WalletClient` | viem WalletClient with the buyer's account |
| `paymentRequired` | `EscrowPaymentRequired` | Payment details from the 402 response |
| `usdcAddress` | `Address` | USDC contract address (for EIP-712 domain) |

**Returns:** `Promise<EscrowPaymentPayload>`

---

## Agent helpers

Convenience functions for agent-to-agent commerce. Import from `@xenga/client/agent`.

```typescript
import { discoverServices, screenSeller, autoPayAndVerify } from "@xenga/client/agent";
```

### `discoverServices(facilitatorUrl)`

Discover available services and capabilities from a facilitator.

```typescript
const info = await discoverServices("https://facilitator.example.com");
console.log(info.serviceTypes); // [{ name: "agent-service", releaseWindow: 3600, ... }]
```

**Returns:** `Promise<DiscoverResult>`

```typescript
interface DiscoverResult {
  facilitatorUrl: string;
  chain: string;
  chainId: number;
  escrowContract: string;
  serviceTypes: ServiceInfo[];
}

interface ServiceInfo {
  name: string;
  releaseWindow: number;
  autoVerify: boolean;
  description: string;
}
```

### `screenSeller(facilitatorUrl, address, minScore?)`

Screen a seller's reputation before paying.

```typescript
const result = await screenSeller("https://facilitator.example.com", "0x...", 70);
if (!result.acceptable) {
  console.log(`Seller score ${result.score} below minimum 70`);
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `facilitatorUrl` | `string` | **required** | Facilitator server URL |
| `address` | `Address` | **required** | Seller's address |
| `minScore` | `number` | `50` | Minimum acceptable reputation score |

**Returns:** `Promise<ScreenResult>`

```typescript
interface ScreenResult {
  address: Address;
  score: number;
  confidence: "low" | "medium" | "high";
  acceptable: boolean;
  reputation: ReputationScore;
}
```

### `autoPayAndVerify(url, init, options)`

One-call payment + data retrieval for agent-to-agent commerce. Combines seller screening, `escrowFetch`, and response parsing.

```typescript
const result = await autoPayAndVerify(
  "https://api.example.com/inference",
  { method: "POST", body: JSON.stringify({ prompt: "hello" }) },
  { walletClient, minSellerReputation: 60 }
);

console.log(result.data);       // parsed response body
console.log(result.escrowId);   // on-chain escrow ID
console.log(result.txHash);     // settlement transaction hash
```

| Parameter | Type | Description |
|---|---|---|
| `url` | `string` | The endpoint URL |
| `init` | `RequestInit \| undefined` | Standard fetch options |
| `options` | `EscrowFetchOptions & { minSellerReputation?: number }` | All `escrowFetch` options plus minimum reputation threshold |

The `minSellerReputation` option (default: `0`, no check) pre-screens the seller via the reputation API before initiating payment.

**Returns:** `Promise<AutoPayResult>`

```typescript
interface AutoPayResult {
  response: Response;
  data: unknown;
  escrowId?: number;
  txHash?: string;
}
```

---

## Retry utilities

Built-in retry logic for transient blockchain and network errors.

```typescript
import { withRetry, isRetryableError } from "@xenga/client";
```

### `withRetry(fn, options?)`

Execute a function with exponential backoff retries on transient errors.

```typescript
const result = await withRetry(() => submitTransaction(), { maxRetries: 3 });
```

### `isRetryableError(error)`

Determine if an error is transient and worth retrying. Covers RPC timeouts, rate limits, nonce errors, and network failures.

### `RetryOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `baseDelayMs` | `number` | `2000` | Base delay (doubles each attempt) |
| `maxDelayMs` | `number` | `16000` | Maximum delay cap |
| `isRetryable` | `(error: unknown) => boolean` | `isRetryableError` | Custom predicate |

---

## Error types

All errors extend `X402Error` which has a `code` property for programmatic handling.

```typescript
import { NetworkError, ReputationAbortError } from "@xenga/client";

try {
  await escrowFetch(url, init, options);
} catch (err) {
  if (err instanceof ReputationAbortError) {
    console.log(`Aborted: seller score ${err.score} too low`);
  }
}
```

| Error | Code | Description |
|---|---|---|
| `InvalidPaymentHeaderError` | `INVALID_PAYMENT_HEADER` | Server returned 402 but the payment requirement is malformed |
| `UnsupportedSchemeError` | `UNSUPPORTED_SCHEME` | Payment scheme is not supported |
| `NetworkError` | `NETWORK_ERROR` | Network-level error (timeout, DNS, connection reset) — generally retryable |
| `ReputationAbortError` | `REPUTATION_ABORT` | Payment aborted because seller reputation check failed |
| `PaymentVerificationError` | `PAYMENT_VERIFICATION_ERROR` | ERC-3009 signature verification failed (server-side) |
| `SettlementError` | `SETTLEMENT_ERROR` | On-chain settlement failed (server-side) |

---

## Types

Key types used across the SDK. Import from `@xenga/client`.

### `EscrowPaymentRequired`

Payment requirements returned in the 402 response.

```typescript
interface EscrowPaymentRequired {
  scheme: "escrow";
  network: string;
  escrowContract: Address;
  asset: Address;
  amount: string;           // stringified bigint (USDC smallest unit)
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
  facilitatorFee?: string;  // informational
  feeBps?: number;          // basis points (100 = 1%)
  flatFee?: string;         // informational
}
```

### `EscrowPaymentResponse`

Returned after successful settlement.

```typescript
interface EscrowPaymentResponse {
  success: boolean;
  txHash: Hash;
  escrowId: number;
}
```

### `OnChainEscrow`

On-chain escrow state.

```typescript
interface OnChainEscrow {
  orderId: Hash;
  buyer: Address;
  seller: Address;
  amount: bigint;
  serviceType: string;
  state: EscrowState;
  createdAt: bigint;
  releaseWindow: bigint;
  deliveryConfirmedAt: bigint;
  disputeWindow: bigint;
  facilitatorFee: bigint;
}
```

### `EscrowState`

```typescript
enum EscrowState {
  None = 0,
  Active = 1,
  DeliveryConfirmed = 2,
  Completed = 3,
  AutoReleased = 4,
  Disputed = 5,
  Resolved = 6,
  Refunded = 7,
}
```

### `ReputationScore`

```typescript
interface ReputationScore {
  address: Address;
  overall: number;        // 0-100
  confidence: "low" | "medium" | "high";
  seller?: SellerReputation;
  buyer?: BuyerReputation;
  updatedAt: number;
}
```

### `Stats`

On-chain escrow statistics.

```typescript
interface Stats {
  totalEscrows: bigint;
  totalAmount: bigint;
  completedCount: bigint;
  completedAmount: bigint;
  disputedCount: bigint;
  disputedAmount: bigint;
  resolvedCount: bigint;
  refundedCount: bigint;
  refundedAmount: bigint;
}
```

## Next steps

- [Quickstart](./quickstart.md) — get started in 5 minutes
- [API Reference](./api-reference.md) — REST API endpoints, request/response schemas
- [Seller Guide](./seller-guide.md) — running the facilitator server, webhooks, fees
