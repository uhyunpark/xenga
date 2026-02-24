# Xenga vs ERC-8004: Comparative Architecture Analysis

## Core Difference

**ERC-8004 answers "who is this agent and should I trust it?" — Xenga answers "how do we safely exchange value?"**

ERC-8004 is an identity + trust signaling infrastructure layer (three lightweight on-chain registries). Xenga is a full settlement protocol (escrow state machine, fund custody, dispute resolution, fees, and reputation derived from real transactions).

These are **complementary, not competing** protocols — they operate at different layers of the agent commerce stack.

---

## 1. Scope & Layer

| Dimension | ERC-8004 | Xenga |
|-----------|----------|-------|
| **Primary concern** | Agent discovery + trust signaling | Value custody + settlement |
| **On-chain footprint** | 3 registries (Identity, Reputation, Validation) | EscrowVault + SessionEscrow |
| **Payment handling** | Explicitly out of scope | Core function — full escrow lifecycle with USDC |
| **Transport layer** | Not prescribed (complements A2A, MCP, Xenga) | Xenga HTTP 402 flow built in |
| **Target user** | Any agent framework / protocol | Buyers, sellers, and facilitators in commerce |

---

## 2. Reputation

### ERC-8004: Subjective Feedback Signals

ERC-8004's `ReputationRegistry` stores subjective feedback via `giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`:

- **Subjective** — any client can post any `int128` value with arbitrary tag semantics (e.g., `starred=87/100`, `uptime=99.77%`, `responseTime=560ms`)
- **Unstructured** — tags like `starred`, `reachable`, `ownerVerified`, `successRate` are conventions, not enforced schemas
- **Aggregation-agnostic** — `getSummary()` returns count and sum; sophisticated scoring happens off-chain
- **Per-agent** — feedback is per-agent NFT ID, not per-address, enabling agent-level reputation
- **Sybil mitigation** — `getSummary` requires non-empty `clientAddresses` array so consumers filter by trusted raters
- **Revocable** — `revokeFeedback()` lets authors retract; agents can `appendResponse()` to contest

### Xenga: Objective Transaction Outcome Scoring

Xenga derives reputation from on-chain escrow outcomes stored in `sellerStats[address]` and `buyerStats[address]` mappings in `EscrowVault.sol`. The `Stats` struct tracks:

```solidity
struct Stats {
    uint256 totalEscrows;
    uint256 totalAmount;
    uint256 completedCount;    // releaseFunds + autoRelease
    uint256 completedAmount;
    uint256 disputedCount;
    uint256 disputedAmount;
    uint256 resolvedCount;
    uint256 refundedCount;
    uint256 refundedAmount;
}
```

The off-chain `reputationService.ts` computes deterministic weighted scores:

- **Seller score** = `completionRate × 40 + (1 - disputeRate) × 25 + (1 - refundRate) × 15 + resolutionFairness × 10 + volumeBonus` (max 100)
- **Buyer score** = `completionRate × 45 + (1 - disputeRate) × 25 + (1 - frivolousDisputeRate) × 20 + volumeBonus` (max 100)
- **Overall** = escrow-count-weighted average of seller + buyer scores
- **Confidence bands**: low (<3 escrows), medium (3-9), high (≥10)

**Key difference**: Xenga reputation is non-gameable by fake reviews because every data point corresponds to a real escrow with real USDC locked. ERC-8004 feedback can be submitted by anyone who is not the agent owner, making it vulnerable to coordinated fake feedback from Sybil identities.

### Comparison

| Aspect | ERC-8004 | Xenga |
|--------|----------|-------|
| Data source | Subjective client feedback | Objective escrow outcomes |
| Scoring location | On-chain raw signals + off-chain aggregation | On-chain raw stats + off-chain weighted formula |
| Granularity | Per-agent (NFT ID) | Per-address (seller + buyer roles) |
| Anti-gaming | Filter by known client addresses | Every data point requires real USDC at stake |
| Tag system | Arbitrary tags (starred, uptime, responseTime) | Fixed metrics (completionRate, disputeRate, refundRate) |
| Revocability | Feedback is revocable | Stats are immutable (derived from escrow state transitions) |
| Response mechanism | `appendResponse()` for agents to contest | Dispute resolution system (arbiter splits %) |
| Confidence | Not built in (consumer decides) | Built-in: low/medium/high thresholds |
| Dynamic effects | Not built in | `adjustParams()` shortens/extends release windows based on reputation |

---

## 3. Payment and Escrow

### ERC-8004: Payment Explicitly Excluded

Payment rails are "explicitly out of scope." The registration file includes an optional `x402Support: true/false` field and `proofOfPayment` in feedback files, but ERC-8004 does not handle custody, settlement, or disputes.

### Xenga: Full Escrow State Machine

Xenga's core is `EscrowVault.sol` — implementing a complete escrow lifecycle:

```
None → Active → DeliveryConfirmed → Completed      (buyer releases)
         │             │              AutoReleased   (timeout, anyone triggers)
         │             └────────────→ Disputed ──→ Resolved (arbiter splits %)
         └───────────────────────────→ Refunded   (seller voluntary / arbiter)
```

Additionally, `SessionEscrow.sol` provides micropayment session support: one-time deposit authorization, multiple captures by the facilitator, and settlement with refund of unused balance.

---

## 4. Identity

### ERC-8004: NFT-Based Agent Identity

- `register(agentURI)` mints an ERC-721 NFT, returns `agentId`
- Agent identifier: `{namespace}:{chainId}:{identityRegistry}` + `agentId` (CAIP-10 compatible)
- `agentURI` resolves to a JSON registration file with name, description, image, services (A2A, MCP endpoints), x402 support flag
- `setMetadata(agentId, key, value)` — on-chain key-value storage
- Reserved `agentWallet` key with EIP-712 signature verification for wallet binding
- Domain verification via `.well-known/agent-registration.json`
- NFT transferable — enables marketplace trading of agent identities
- On transfer, `agentWallet` automatically clears (security feature)
- Deployed on 25+ chains (Ethereum mainnet, Base, Optimism, Arbitrum, etc.)

### Xenga: Raw Addresses

Xenga identifies participants solely by Ethereum addresses. No registry, no metadata, no discovery mechanism. The `Escrow` struct stores `buyer` and `seller` as plain `address` fields. This is a deliberate trade-off: Xenga optimizes for simplicity and composability at the settlement layer.

---

## 5. Validation

### ERC-8004: Pluggable Validation Registry

- `requestValidation(agentId, validationURI, validationHash)` — clients request verification
- `submitValidation(agentId, clientAddress, validationIndex, isValid, responseURI, responseHash)` — validators respond
- Supports multiple trust tiers: social reputation (low-value), crypto-economic staking (medium-value), zkML proofs or TEE attestations (high-value)
- Validators are external — could be re-execution stakers, zkML verifiers, TEE oracles, or trusted judges

### Xenga: Validation Through Escrow Outcomes

- **Delivery confirmation**: seller calls `confirmDelivery()`, starting the dispute window
- **Auto-verification**: the `agent-service` service type implements `verifyDelivery()` for machine-to-machine auto-verification
- **Dispute resolution**: buyer can dispute within the dispute window; arbiter resolves with percentage split
- **Auto-release**: permissionless `autoRelease()` on EscrowVault releases funds after timeout

---

## 6. Sybil Resistance

### ERC-8004

- Filter by known clients (`getSummary()` requires a non-empty `clientAddresses` array)
- Anti-self-feedback (cannot submit feedback for agents you own)
- No inherent economic cost — posting feedback costs only gas
- The spec acknowledges Sybil/spam attacks as a security consideration and delegates mitigation to consumers

### Xenga

- **Economic Sybil resistance**: every reputation data point requires real USDC locked in escrow
- **Facilitator-gated**: the facilitator submits all on-chain transactions, acting as a gatekeeper
- **Fee-based deterrent**: `fee = (amount × feeBps) / 10000 + flatFee` means every escrow has a cost
- **Dispute arbiter**: a single arbiter resolves disputes, preventing collusion to inflate completion rates

---

## 7. What Xenga Provides That ERC-8004 Does Not

| Capability | Xenga Implementation |
|------------|---------------------|
| **Fund custody** | `EscrowVault.sol` locks USDC on-chain with state machine |
| **Dispute resolution** | Arbiter resolves with buyer percentage split (0-100) |
| **Auto-release** | Permissionless `autoRelease()` on EscrowVault — facilitator server or anyone can trigger |
| **Fee system** | `feeBps + flatFee`, MAX_FEE_BPS=1000 (10%), seller-pays model |
| **Gasless transfers** | ERC-3009 `receiveWithAuthorization` |
| **Micropayment sessions** | `SessionEscrow.sol` — sign once, multiple captures |
| **Xenga HTTP protocol** | Full client-server flow with on-chain settlement |
| **Service type parameterization** | Pluggable `ServiceType` interface with `adjustParams()` |
| **Client SDK** | `escrowFetch()`, `signEscrowPayment()`, `createEscrowClient()` |
| **Deterministic reputation formula** | Fixed weighted scoring with confidence bands |
| **Reputation-driven UX** | `onSellerReputation` callback to abort if seller score too low |

---

## 8. What ERC-8004 Provides That Xenga Does Not

| Capability | ERC-8004 Implementation |
|------------|------------------------|
| **Agent discovery** | Identity Registry with `agentURI`, registration files, service endpoints |
| **Cross-chain identity** | CAIP-10 compatible, deployed on 25+ chains |
| **NFT-based identity** | ERC-721 tokens — transferable, indexable |
| **Agent metadata** | `setMetadata(agentId, key, value)` on-chain key-value store |
| **Pluggable validation** | `ValidationRegistry` supporting zkML, TEE, stakers |
| **Multi-protocol support** | Registration files list A2A, MCP, OASF, web endpoints |
| **Feedback tags** | Arbitrary `tag1`/`tag2` categorization |
| **Feedback revocation** | `revokeFeedback()` + `appendResponse()` |
| **Domain verification** | `.well-known/agent-registration.json` |
| **Wallet binding** | `setAgentWallet()` with EIP-712/ERC-1271 signature verification |
| **Multi-chain deployment** | Ethereum mainnet, Base, Optimism, Arbitrum, etc. |
| **Standards interop** | Formal EIP with community review, CAIP-10, ENS/DID compatible |

---

## 9. How They Could Work Together

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Application (marketplace UI, agent framework) │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Transport (Xenga HTTP, A2A, MCP)               │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Settlement (Xenga — EscrowVault, SessionEscrow)│
├─────────────────────────────────────────────────────────┤
│  Layer 1: Identity + Trust (ERC-8004 — Registries)      │
└─────────────────────────────────────────────────────────┘
```

### Integration Points

1. **Agent Discovery → Escrow Creation**: Use ERC-8004's Identity Registry to discover agents (browse registered agents, read `agentURI` metadata, check service endpoints). When ready to transact, enter Xenga's payment flow with the agent's `agentWallet` address as the seller.

2. **Xenga Outcomes → ERC-8004 Feedback**: After escrow completion/dispute/refund, publish the outcome as ERC-8004 feedback via `giveFeedback()` with tags like `escrowCompleted`, `escrowDisputed`, or `escrowRefunded`. This bridges Xenga's objective outcomes into ERC-8004's feedback system.

3. **ERC-8004 Reputation → Xenga `adjustParams()`**: Xenga's service types already support `adjustParams(params, reputation)`. This could incorporate ERC-8004 reputation signals — e.g., agents with high ERC-8004 validation scores from TEE attestation get shorter release windows even with limited Xenga escrow history.

4. **x402 Support Flag**: ERC-8004's registration file includes `x402Support: true/false`. Clients can filter for agents that support Xenga's payment flow.

5. **Proof of Payment**: ERC-8004's feedback file includes a `proofOfPayment` field (txHash, fromAddress, toAddress, chainId). Xenga's `EscrowCreated` event data serves as proof of payment, creating a verifiable link between the two systems.

6. **Validation Bridge**: ERC-8004's `ValidationRegistry` could validate Xenga escrow outcomes. For high-value escrows, a zkML verifier or TEE oracle could independently verify service delivery, with the result feeding into both ERC-8004 reputation and Xenga dispute resolution.

---

## Sources

- [ERC-8004: Trustless Agents (Official EIP)](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 Reference Contracts](https://github.com/erc-8004/erc-8004-contracts)
- [ERC-8004 Explained (Backpack Exchange)](https://learn.backpack.exchange/articles/erc-8004-explained)
- [Composable Security: ERC-8004 Practical Explainer](https://composable-security.com/blog/erc-8004-a-practical-explainer-for-trustless-agents/)
