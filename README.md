# Xenga

An on-chain escrow and reputation system for secure, verifiable payments — for both humans and autonomous agents.

**Website:** [xenga.xyz](https://xenga.xyz)

## Escrow State Machine

Buyers deposit USDC into escrow. Funds are held until delivery is confirmed and released, or disputes are resolved by an arbiter.

```
None ─→ Active ─→ DeliveryConfirmed ─→ Completed      (buyer releases)
           │              │              AutoReleased   (timeout, anyone triggers)
           │              └───────────→ Disputed ──→ Resolved (arbiter splits %)
           └──────────────────────────→ Refunded   (seller voluntary / arbiter)
```

**Roles:** buyer (deposits, releases, disputes), seller (confirms delivery, can refund), arbiter (resolves disputes), facilitator (submits gasless transactions, pays gas)

**Gasless deposits:** Buyers sign an ERC-3009 `ReceiveWithAuthorization` off-chain. The facilitator submits the transaction — buyers never need ETH for gas.

**Time windows:**
- **Release window** — configurable per escrow. After this period (+ dispute window if no delivery confirmation), funds auto-release to the seller.
- **Dispute window** — 3 days. After the seller confirms delivery, the buyer has this window to file a dispute.

**Fees:** Configurable facilitator fee (BPS) deducted from seller payout on release. On refund, the buyer gets the full deposit back — the facilitator absorbs the cost. Capped at 10%.

## Reputation System

On-chain credit scoring for wallets, computed from escrow transaction history.

**On-chain data** (permissionless reads):
- `sellerStats[address]` and `buyerStats[address]` mappings in EscrowVault
- Tracks: totalEscrows, completedCount, disputedCount, refundedCount, resolvedCount, and corresponding amounts
- Anyone can read the raw data and compute their own scores

**Off-chain scoring** (0-100 with confidence levels):
- Seller: completionRate x40 + (1-disputeRate) x25 + (1-refundRate) x15 + resolutionFairness x10 + volumeBonus x10
- Buyer: completionRate x45 + (1-disputeRate) x25 + (1-frivolousDisputeRate) x20 + volumeBonus x10
- Confidence: `low` (<3 escrows), `medium` (3-9), `high` (10+)

**Dynamic parameters:** Service types implement `adjustParams()` to shorten or extend release windows based on counterparty reputation. High-trust pairs get shorter escrow periods; low-trust pairs get longer ones.

## Contracts

| Contract | Description |
|---|---|
| `EscrowVault` | Core escrow state machine with gasless deposits (ERC-3009), dispute resolution, auto-release, fee system, and per-address stats tracking |
| `SessionEscrow` | Authorize-once, use-many session escrow for high-frequency micropayments. Deposit once, facilitator captures usage incrementally, settle/refund unused. |
| `AutoReleaseKeeper` | Chainlink Automation compatible. Scans escrow ID ranges, batch auto-releases timed-out escrows. |

See [`contracts/README.md`](contracts/README.md) for contract details.

## Architecture

```
contracts/          Foundry — EscrowVault, SessionEscrow, AutoReleaseKeeper
src/server/         Facilitator server — settles escrows, computes reputation, serves API
src/client/         Client SDK — EIP-712 signing, reputation lookup, x402 payment flow
demo-web/           Next.js 15 demo app with Protocol Inspector
src/shared/         Types, constants, EIP-712 domain/types, auto-generated ABIs
```

### Service Types

Service types (`src/server/service-types/`) define escrow parameters per use case:
- **marketplace** — 7-day release window, manual delivery confirmation, reputation-adjusted (3-14 days)
- **agent-service** — 1-hour release window, auto-verify delivery, reputation-adjusted (30min-4h)

### x402 Integration Layer

The x402 protocol provides an HTTP transport layer for triggering escrow creation. When a client requests a payment-protected endpoint without credentials, the server returns HTTP 402 with escrow requirements. The client signs an ERC-3009 authorization, resubmits, and the server settles the escrow on-chain. This is one integration path — the contracts can also be called directly.

## Quick Start

```bash
bun install

# Build and test contracts
bun run build:contracts
bun run test:contracts

# Start server (requires .env)
bun run dev

# Start demo app
cd demo-web && bun run dev
```

## Environment

Requires `.env` (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes | Operator wallet (submits on-chain transactions) |
| `ESCROW_VAULT_ADDRESS` | Yes | Deployed EscrowVault contract address |
| `BASE_SEPOLIA_RPC` | No | RPC URL (defaults to public endpoint) |
| `FEE_BPS` | No | Facilitator fee in basis points (default: 0) |
| `FEE_RECIPIENT` | No | Address to receive facilitator fees |

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
