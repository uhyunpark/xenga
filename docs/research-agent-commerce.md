# Agent Commerce: How AI Agents Pay — A Deep Research Document

> Research compiled March 2026. Covers the agent commerce ecosystem, payment protocols, agent frameworks, and how Xenga fits in.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Two Worlds of Agent Payments](#two-worlds-of-agent-payments)
3. [The Protocol Stack](#the-protocol-stack)
4. [How Agents Are Built (The Wallet Problem)](#how-agents-are-built)
5. [The x402 Protocol (HTTP-Native Payments)](#the-x402-protocol)
6. [How Xenga Extends x402 (Escrow + Reputation)](#how-xenga-extends-x402)
7. [Agent-to-Agent Commerce (The Frontier)](#agent-to-agent-commerce)
8. [How to Build an Agent That Pays with Xenga](#how-to-build-an-agent-that-pays-with-xenga)
9. [Market Scale & Context](#market-scale--context)
10. [Protocol Comparison Matrix](#protocol-comparison-matrix)

---

## The Problem

AI agents (LLM-powered autonomous systems — Claude, GPT, Gemini) can browse the web, call APIs, write code, and reason — but until recently they **couldn't spend money**. Without payment capabilities, an agent that finds the perfect flight can't book it. An agent that needs premium API data can't buy access. Their autonomy hits a wall the moment a transaction is required.

Agent commerce solves this by giving agents **programmatic payment capabilities** — the ability to discover prices, evaluate trust, sign payments, and settle transactions without human intervention.

---

## Two Worlds of Agent Payments

Two parallel ecosystems are emerging:

### A) Traditional Rails (Visa, Mastercard, Stripe)

The incumbents are adapting card networks for agent use:

**Visa Intelligent Commerce & Trusted Agent Protocol**
- Uses tokenization to give AI agents scoped card credentials
- Agent gets a unique digital token (not the real card number) limited to a specific merchant, amount, or time window
- Hundreds of secure agent-initiated transactions completed with partners like Skyfire and Ramp

**Mastercard Agent Pay**
- Uses "agentic tokens" where AI agents must be registered and verified before initiating payments
- Already piloted in the UAE and expanding to Latin America
- Supports offline autonomous purchasing (e.g., "buy this if price drops below $50")

**OpenAI + Stripe (ACP — Agentic Commerce Protocol)**
- Live since September 2025 in ChatGPT
- When you ask ChatGPT to buy something, it searches merchant product feeds, shows a Buy button, and processes payment via Stripe — all in-chat
- OpenAI charges merchants 4% per transaction

| Aspect | Pros | Cons |
|--------|------|------|
| Familiarity | Existing consumer trust, established merchant networks | Requires accounts, KYC, onboarding |
| Regulation | Strong consumer protections, chargeback rights | Slower settlement, geographic restrictions |
| Autonomy | Works with known merchants | Requires human approval loops, not truly autonomous |

### B) Crypto-Native Rails (x402, Stablecoins, On-Chain Escrow)

The crypto approach treats payments as a **protocol primitive** — like HTTP itself:

**x402 Protocol (Coinbase)**
- Revives the HTTP 402 "Payment Required" status code (unused for 30 years)
- Agent hits an API, gets a 402 response with price info, signs a stablecoin payment, retries with a payment header
- No accounts, no sessions, no credit card forms
- Over **50M+ transactions** processed
- Supported by Coinbase, Cloudflare, Google, and Vercel

**Stablecoin Payments (USDC)**
- Agents pay in USDC (a dollar-pegged stablecoin) on cheap L2 chains like Base (< $0.01 per transaction)
- No currency conversion, instant settlement, programmable

**On-Chain Escrow (Xenga)**
- Funds are locked in a smart contract until service is delivered
- Neither party can cheat — automated release on timeout
- Reputation scoring for trust decisions

| Aspect | Pros | Cons |
|--------|------|------|
| Autonomy | Truly autonomous (no human in the loop), programmable, 24/7 | Requires crypto wallets, stablecoin liquidity |
| Settlement | Instant or configurable (escrow windows), global | Newer ecosystem, less merchant coverage |
| Cost | Sub-cent transaction fees on L2s | Requires initial USDC funding |

---

## The Protocol Stack

A layered architecture is emerging for agent commerce:

| Layer | Protocol | What It Does | Key Players |
|-------|----------|--------------|-------------|
| **Tool Access** | MCP (Anthropic) | How agents connect to external tools/APIs | Anthropic, community |
| **Agent Collaboration** | A2A (Google) | How agents talk to each other | Google, 50+ partners |
| **Payments** | AP2 (Google) / x402 (Coinbase) | How agents pay for things | Google, Coinbase, Visa, PayPal |
| **Commerce** | UCP (Google+Shopify+Walmart) / ACP (OpenAI+Stripe) | End-to-end shopping flows | OpenAI, Google, Shopify |
| **Identity** | KYA (Skyfire) / Visa Trusted Agent | Who is this agent? Can it be trusted? | Skyfire, Visa |

### Notable Protocols

**MCP (Model Context Protocol) — Anthropic**
- Standard for connecting LLMs to external tools and data sources
- Agent discovers available tools, calls them with structured input/output
- Foundation layer — agents need tools before they can pay

**A2A (Agent-to-Agent Protocol) — Google**
- Agents discover each other's capabilities via "Agent Cards" (JSON metadata)
- One agent can delegate subtasks (including payment) to another agent
- Supports long-running tasks, streaming, and multi-turn interactions

**AP2 (Agent Payments Protocol) — Google**
- Bridges both traditional and crypto rails — payment-agnostic
- Works as an extension of both A2A and MCP
- Over 60 organizations collaborating, including Adyen, American Express, Coinbase, Mastercard, PayPal, and Visa

**x402 — Coinbase**
- HTTP-native payment protocol using the 402 status code
- Agent signs a stablecoin transfer, server verifies and settles
- Standard headers: `PAYMENT-REQUIRED` (402), `PAYMENT-SIGNATURE` (request), `PAYMENT-RESPONSE` (settlement)

---

## How Agents Are Built

The key insight: **every agent that pays needs a wallet**. Here's how the major frameworks handle this:

### Coinbase AgentKit — "Every AI Agent Deserves a Wallet"

The most mature crypto-native agent framework.

```
Developer -> LLM (Claude/GPT/Llama) -> AgentKit -> Wallet -> Blockchain
```

- Gives any LLM-powered agent a **non-custodial wallet** secured in a Trusted Execution Environment (TEE)
- Pre-built "skills": Authenticate, Fund, Send, Trade, Earn
- Framework-agnostic (works with LangChain, Vercel AI SDK, MCP)
- Wallet-agnostic (CDP wallets, Privy, Viem)
- 50+ built-in blockchain actions in TypeScript, 30+ in Python

**How it works:**
1. Create a wallet via CDP API
2. Fund it with USDC
3. Give the agent tools (send payment, check balance, sign messages)
4. Let the LLM decide when to use them based on conversation

### Skyfire — "Payment Rails for AI"

A payment network specifically for agents:
- Businesses pre-load agent wallets with funds (via credit card, ACH, or USDC)
- Agents get a **KYA (Know Your Agent) identity** — a signed JWT proving who they are and what they're authorized to spend
- Granular spending controls (per-transaction limits, time periods, merchant restrictions)
- Already integrated with Apify, Coinbase, and various enterprise platforms

### Traditional Approach (Stripe/OpenAI)

For agents operating within existing platforms:
- Agent uses the user's stored payment credentials (tokenized card)
- Requires explicit user consent for each purchase (or pre-set spending rules)
- All happens within the chat interface — no redirect to merchant sites

### Safe (Gnosis) — "Smart Account for Agents"

Multi-sig wallets with agent-specific modules:
- Zodiac module limits agent permissions (max spend, allowed contracts)
- Requires N-of-M signatures for high-value transactions
- Used by DAOs and enterprises for autonomous treasury management

---

## The x402 Protocol

The HTTP-native approach to agent payments — and the foundation Xenga builds on.

### How It Works

```
Agent                         Server                      Blockchain
  |                              |                            |
  |-- GET /api/weather --------> |                            |
  |                              |                            |
  |<-- 402 Payment Required ---- |                            |
  |    Headers: price, token,    |                            |
  |    network, payTo address    |                            |
  |                              |                            |
  |-- Sign USDC transfer ------> |                            |
  |   (EIP-712 typed data)       |                            |
  |                              |                            |
  |-- GET /api/weather --------> |                            |
  |   + PAYMENT-SIGNATURE header |-- settle on-chain -------> |
  |   (signed payment payload)   |<-- tx confirmed ---------- |
  |                              |                            |
  |<-- 200 OK + weather data --- |                            |
```

### Why This Is Elegant

- Uses existing HTTP infrastructure (any `fetch()` client works)
- No accounts, API keys, or sessions needed
- Agent signs a **gasless** USDC transfer (ERC-3009) — the server pays the gas
- Payment verification and settlement happen in one round-trip
- Works for micropayments ($0.001 per API call) because L2 fees are < $0.01

### ERC-3009: The Gasless USDC Transfer Standard

The key enabler. ERC-3009 adds `ReceiveWithAuthorization` to USDC — a mechanism where:
1. The **payer signs** a message authorizing a transfer (off-chain, no gas needed)
2. A **third party submits** the signed message on-chain (they pay gas)
3. USDC is transferred directly from payer to recipient

This means agents **don't need ETH for gas** — they only need USDC.

### EIP-712 Typed Data Signing

The signature format used for ERC-3009:

**Domain:**
```json
{
  "name": "USDC",
  "version": "2",
  "chainId": 84532,
  "verifyingContract": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

**Type:**
```json
{
  "ReceiveWithAuthorization": [
    { "name": "from", "type": "address" },
    { "name": "to", "type": "address" },
    { "name": "value", "type": "uint256" },
    { "name": "validAfter", "type": "uint256" },
    { "name": "validBefore", "type": "uint256" },
    { "name": "nonce", "type": "bytes32" }
  ]
}
```

**Message:**
```json
{
  "from": "0xAgentWallet",
  "to": "0xEscrowVault",
  "value": "1000000",
  "validAfter": 0,
  "validBefore": 1234567890,
  "nonce": "0xRandomUniqueValue"
}
```

---

## How Xenga Extends x402

Standard x402 is a **direct payment** — once you pay, the money is gone. Xenga wraps it with **on-chain escrow**, **reputation scoring**, and **service-type-aware parameters**.

### Architecture

```
Vercel (web/)                    Fly.io (src/server/)
+--------------------+           +----------------------------+
| Next.js Frontend   |   fetch   | Express Facilitator        |
| Pages + Signing    |---------->| REST API + Chain + SQLite  |
+--------------------+   CORS    +----------------------------+
        |                                   |
        | signTypedData                     | PRIVATE_KEY (gas)
        v                                   v
   User's Browser                  EscrowVault (Base Sepolia)
```

### The Xenga Payment Flow

```
Agent                       Xenga Facilitator              EscrowVault (on-chain)
  |                              |                               |
  |-- POST /api/orders/123/pay ->|                               |
  |   (no auth headers)          |                               |
  |                              |                               |
  |<-- 402 + escrow details ---- |                               |
  |    + seller reputation score |                               |
  |    (score: 82, confidence:   |                               |
  |     high, disputeRate: 3%)   |                               |
  |                              |                               |
  |  Agent decides: score > 50   |                               |
  |  -> proceed with payment     |                               |
  |                              |                               |
  |-- Sign ERC-3009 transfer --> |                               |
  |                              |                               |
  |-- POST + PAYMENT-SIGNATURE ->|                               |
  |                              |-- createEscrowWithAuth() ---> |
  |                              |   USDC locked in escrow       |
  |                              |<-- escrowId + txHash -------- |
  |<-- 200 + settlement --------|                               |
  |                              |                               |
  |                              |   [Auto-release poller]       |
  |                              |   After 1hr: autoRelease() -> |
  |                              |   Seller gets USDC - fee      |
```

### What Xenga Adds Beyond Vanilla x402

**1. Escrow Protection**
Funds are locked in a smart contract, not sent directly to the seller. If the service isn't delivered, the buyer can dispute or get a refund.

Escrow state machine:
```
None -> Active -> DeliveryConfirmed -> Completed      (buyer releases)
          |             |              AutoReleased   (timeout, poller triggers)
          |             +------------> Disputed --> Resolved (arbiter splits %)
          +----------------------------> Refunded   (seller voluntary / arbiter)
```

**2. Reputation Scoring**
Every wallet gets a 0-100 trust score based on on-chain escrow history:

- **Seller score** = completionRate x 40 + (1-disputeRate) x 25 + (1-refundRate) x 15 + resolutionFairness x 10 + volumeBonus (0-10)
- **Buyer score** = completionRate x 45 + (1-disputeRate) x 25 + (1-frivolousDisputeRate) x 20 + volumeBonus (0-10)
- **Confidence**: "low" (<3 escrows), "medium" (3-9), "high" (>=10)

Agents can programmatically gate payments based on reputation:
```typescript
onSellerReputation: (rep) => {
  if (rep.score < 50 || rep.disputeRate > 0.2) return false; // don't pay
  return true;
}
```

**3. Service-Type-Aware Parameters**
Different use cases get different escrow parameters:

| Service Type | Release Window | Auto-Verify | Use Case |
|---|---|---|---|
| `marketplace` | 7 days | No | Human-to-human transactions |
| `agent-service` | 1 hour | Yes | Agent API queries |

Reputation further adjusts parameters:
- Both parties score >= 80 with high confidence -> shorten to 30 minutes
- Seller score < 40 with medium/high confidence -> extend to 4 hours

**4. Automated Settlement**
A built-in poller checks every 60 seconds and calls the permissionless `autoRelease()` when timing conditions are met. No external automation (Chainlink, cron) needed.

---

## Agent-to-Agent Commerce

The most exciting emerging pattern — **agents paying agents**:

```
Travel Agent --> Flight Search Agent --> Booking Agent --> Payment Agent
 (orchestrator)    (pays for API)        (pays for seat)   (settles USDC)
```

This is enabled by:
- **A2A Protocol** — Agents discover each other's capabilities via Agent Cards. One agent can delegate a subtask (including payment) to another.
- **x402 + A2A extension** — Google and Coinbase jointly launched a production-ready solution for agent-based crypto payments layering x402 on top of A2A.
- **MCP tools** — An agent can expose a "pay" tool via MCP that other agents call.

### Example: Orchestrator Agent Delegating Payment

```
Orchestrator Agent (Claude)
  |
  |-- [MCP] Discover "weather-service" agent
  |-- [A2A] Send task: "Get weather for SF"
  |
  |   Weather Agent
  |     |-- Needs premium data -> hits Data API
  |     |-- Gets 402 from Data API
  |     |-- Signs USDC payment (x402)
  |     |-- Gets data, returns to orchestrator
  |
  |<-- Receives weather data
```

Each agent in the chain has its own wallet, makes its own trust decisions, and pays independently.

---

## How to Build an Agent That Pays with Xenga

### Prerequisites

- A wallet with USDC on Base Sepolia (testnet faucet: `POST /api/demo/fund`)
- Node.js/Bun runtime
- `viem` library for wallet operations

### Example 1: Minimal — `escrowFetch()` (Automatic Flow)

The simplest path. Let `escrowFetch()` handle the entire 402 -> sign -> submit flow:

```typescript
import { escrowFetch } from "@xenga/client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
  account,
});

const result = await escrowFetch(
  "https://facilitator.example.com/api/orders/order123/pay",
  { method: "POST" },
  {
    walletClient,
    onSellerReputation: (rep) => {
      console.log(`Seller score: ${rep.score}/100`);
      return rep.score >= 50; // abort if untrusted
    },
  }
);

if (result.response.ok) {
  console.log("Payment successful!");
  console.log("Escrow ID:", result.payment?.escrowId);
  console.log("Tx Hash:", result.payment?.txHash);
}
```

### Example 2: Decomposed Flow (Step-by-Step Control)

For agents that need to handle each step separately:

```typescript
import { signEscrowPayment } from "@xenga/client";

// Step 1: Request payment (get 402)
const res1 = await fetch(`${SERVER}/api/orders/${orderId}/pay`, {
  method: "POST",
});

if (res1.status === 402) {
  const header = res1.headers.get("payment-required")
    || res1.headers.get("x-payment-required");
  const paymentRequired = JSON.parse(
    Buffer.from(header!, "base64").toString()
  );

  console.log(`Price: ${paymentRequired.amount} USDC (smallest unit)`);
  console.log(`Seller rep: ${paymentRequired.sellerReputation?.score}`);

  // Step 2: Sign ERC-3009 authorization
  const payload = await signEscrowPayment(walletClient, paymentRequired);

  // Step 3: Submit with signature
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  const res2 = await fetch(`${SERVER}/api/orders/${orderId}/pay`, {
    method: "POST",
    headers: {
      "PAYMENT-SIGNATURE": encoded,  // x402 standard
      "X-PAYMENT": encoded,          // legacy Xenga
    },
  });

  // Step 4: Parse settlement response
  const settlementHeader = res2.headers.get("payment-response")
    || res2.headers.get("x-payment-response");
  const settlement = JSON.parse(
    Buffer.from(settlementHeader!, "base64").toString()
  );
  console.log(`Escrow ID: ${settlement.escrowId}`);
  console.log(`Tx Hash: ${settlement.txHash}`);
}
```

### Example 3: Full Client SDK (Multi-Operation Agent)

For agents that need to perform multiple operations:

```typescript
import { createEscrowClient } from "@xenga/client";

const client = createEscrowClient({
  privateKey: process.env.PRIVATE_KEY!,
  serverUrl: "https://api.xenga.xyz",
  escrowVaultAddress: "0x...",
  chainId: 84532,
});

// Pay for order
const { order, payment } = await client.payForOrder("order-123");
console.log(`Escrow created: ${payment.escrowId}`);

// Check escrow state
const escrow = await client.getEscrow(payment.escrowId);
console.log(`State: ${escrow.state}`);

// Check seller reputation
const reputation = await client.getReputation(order.sellerAddress);
console.log(`Score: ${reputation.overall}/100`);

// Release funds (buyer action)
const releaseTx = await client.releaseOnChain(payment.escrowId);

// Dispute (buyer action)
const disputeTx = await client.disputeOnChain(payment.escrowId);
```

### 402 Response Format

**x402 standard header** (`PAYMENT-REQUIRED`, base64-encoded):
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "escrow",
      "network": "base-sepolia",
      "maxAmountRequired": "1000000",
      "payTo": "0xEscrowVaultAddress",
      "asset": "0xUSDCAddress",
      "extra": {
        "primaryType": "ReceiveWithAuthorization",
        "name": "USDC",
        "version": "2",
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

### Key Types

```typescript
// Payment requirements from 402 response
interface EscrowPaymentRequired {
  scheme: "escrow";
  network: string;            // "base-sepolia" or "base"
  escrowContract: Address;    // EscrowVault contract address
  asset: Address;             // USDC token address
  amount: string;             // USDC in smallest unit (6 decimals)
  orderId: Hash;              // bytes32 order ID
  sellerAddress: Address;
  releaseWindow: number;      // Seconds
  serviceType: string;        // "marketplace", "agent-service"
  facilitatorFee?: string;
}

// Signed payload sent to server
interface EscrowPaymentPayload {
  scheme: "escrow";
  network: string;
  from: Address;              // Buyer's address
  to: Address;                // EscrowVault contract
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hash;
  signature: { v: number; r: Hash; s: Hash };
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
}

// Settlement response
interface EscrowPaymentResponse {
  success: boolean;
  txHash: Hash;
  escrowId: number;
}

// Reputation score
interface ReputationScore {
  address: Address;
  overall: number;            // 0-100
  confidence: "low" | "medium" | "high";
  seller?: SellerReputation;
  buyer?: BuyerReputation;
  updatedAt: number;
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/orders` | POST | Create order |
| `/api/orders/:id/pay` | POST | Xenga payment flow (402 or 200) |
| `/api/orders/:id` | GET | Get order details |
| `/api/escrows/:escrowId` | GET | Get on-chain escrow state |
| `/api/reputation/:address` | GET | Get reputation score |
| `/api/reputation/:address/history` | GET | Get reputation history |
| `/api/demo/fund` | POST | Testnet faucet (10 USDC + 0.005 ETH) |

### Best Practices

1. **Always check reputation** before paying — gate on score >= 50
2. **Use agent-service type** for automated flows — 1-hour release window vs 7 days
3. **Handle both header formats** — `PAYMENT-REQUIRED` (x402) and `X-PAYMENT-REQUIRED` (legacy)
4. **Test on Base Sepolia** first — free faucet at `POST /api/demo/fund`
5. **Agent wallets only need USDC** — no ETH required (facilitator pays gas via ERC-3009)

---

## Market Scale & Context

This isn't theoretical — it's happening at scale:

- **47% of U.S. shoppers** already use AI tools for shopping tasks (CNBC, Dec 2025)
- **50M+ x402 transactions** processed across Solana and Base
- **$1T+ in e-commerce** projected to be influenced by agentic AI (PYMNTS, 2026)
- **McKinsey projects $3-5T globally by 2030** in agentic commerce impact
- **Visa predicts millions of consumers** will use AI agents to buy things by the 2026 holiday season
- **60+ organizations** collaborating on Google's AP2 payment protocol

---

## Protocol Comparison Matrix

| Feature | x402 (Coinbase) | ACP (OpenAI+Stripe) | AP2 (Google) | UCP (Google+Shopify) | Visa Trusted Agent |
|---|---|---|---|---|---|
| **Payment type** | Stablecoin (USDC) | Credit card (Stripe) | Agnostic (card + crypto) | Card + bank | Tokenized card |
| **Settlement** | Instant (on-chain) | 2-3 day (card network) | Varies by rail | Varies | 2-3 day |
| **Agent autonomy** | Full (sign & pay) | Limited (user approval) | Configurable | User-driven | Scoped tokens |
| **Accounts needed** | No (wallet only) | Stripe merchant account | Varies | Google Merchant | Visa enrollment |
| **Micropayments** | Yes ($0.001+) | No (min ~$0.50) | Depends on rail | No | No |
| **Escrow** | Via Xenga | No | No (direct payment) | No | No |
| **Reputation** | Via Xenga | Merchant reviews | No built-in | Google Shopping | Visa risk score |
| **KYC required** | No | Yes (merchants) | Yes | Yes | Yes |
| **Open standard** | Yes (MIT) | Proprietary | Open (multi-org) | Open (multi-org) | Proprietary |
| **Agent-to-agent** | Yes (any wallet) | No (human-gated) | Yes (A2A extension) | No | No |
| **Tx volume** | 50M+ | Not disclosed | New (2026) | New (2026) | Pilot stage |
| **Gas cost** | < $0.01 (L2) | N/A (off-chain) | Varies | N/A | N/A |

### When to Use What

- **x402 / Xenga**: Agent-to-agent payments, API micropayments, autonomous operations, developer-facing services
- **ACP (OpenAI+Stripe)**: Consumer shopping within ChatGPT, traditional merchant ecosystem
- **AP2 (Google)**: Enterprise agents needing both card and crypto rails, Google Cloud ecosystem
- **UCP**: Retail shopping agents (Shopify, Walmart inventory)
- **Visa/Mastercard**: Enterprise agents with compliance requirements, existing card infrastructure

---

## Key Files in Xenga Codebase

| Component | File | Purpose |
|---|---|---|
| Agent service type | `src/server/service-types/agent-service.ts` | 1-hour release, auto-verify config |
| Client x402 flow | `src/client/escrowFetch.ts` | 402 -> sign -> payment submission |
| EIP-712 signing | `src/client/escrowScheme.ts` | Sign `ReceiveWithAuthorization` |
| EIP-712 constants | `src/shared/eip712.ts` | Domain, types, builders |
| Server payment core | `src/server/middleware/paymentCore.ts` | 402 response, verification, settlement |
| Server adapter | `src/server/middleware/escrowPayment.ts` | Express middleware |
| On-chain settlement | `src/server/facilitator/settler.ts` | Submit `createEscrowWithAuth` tx |
| Reputation service | `src/server/services/reputationService.ts` | Compute weighted scores |
| Auto-release poller | `src/server/services/autoReleasePoller.ts` | Automatic escrow release |
| Agent demo | `web/components/agent/AgentTerminal.tsx` | Full autonomous flow visualization |
| Types | `src/shared/types.ts` | All payment, escrow, reputation types |
| Constants | `src/shared/constants.ts` | Service types, windows, thresholds |

---

## Sources

- [Coinbase AgentKit](https://github.com/coinbase/agentkit) — Agent wallet framework
- [Coinbase AgentKit Docs](https://docs.cdp.coinbase.com/agent-kit/welcome) — Official documentation
- [x402 Protocol](https://www.x402.org/) — HTTP-native payment protocol
- [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) — Purpose-built agent infrastructure
- [Google A2A Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) — Agent-to-agent interoperability
- [Google AP2 Protocol](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) — Agent payments protocol
- [AI Agent Economics Guide](https://academy.exmon.pro/ai-agent-economics-how-autonomous-crypto-wallets-work-2026-guide) — Autonomous wallet economics
- [Skyfire](https://skyfire.xyz/) — AI payment network with KYA identity
- [QuickNode AgentKit Guide](https://www.quicknode.com/guides/ai/create-a-web3-ai-agent-with-coinbase-agent-kit) — Step-by-step agent building tutorial
