# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Sub-directory CLAUDE.md files contain detailed documentation for each layer: `web/CLAUDE.md`, `src/CLAUDE.md`, `contracts/CLAUDE.md`.

## Build & Run Commands

```bash
# Facilitator (Express + SQLite) — handles all chain interaction
bun run dev                    # Dev mode with watch (port 3000)
bun run start                  # Production start

# Web (Next.js 15) — pure frontend, calls facilitator API
cd web && bun run dev          # Dev mode (port 3001)
cd web && bun run build        # Production build
cd web && bun run start        # Production start

# Local development (two terminals):
# Terminal 1: bun run dev
# Terminal 2: cd web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev

# Contracts (Foundry)
bun run build:contracts        # forge build (from contracts/)
bun run test:contracts         # forge test (from contracts/)
cd contracts && forge test --match-test test_specificName  # Run single test
cd contracts && forge test -vvvv  # Verbose output with traces

# ABI sync (run after contract changes)
bun run build:contracts && bun run sync-abi

# Docker (facilitator only)
docker build -t xenga-facilitator .
docker run -p 8080:8080 --env-file .env xenga-facilitator
```

## Architecture

On-chain escrow and reputation system on Base Sepolia using USDC (ERC-3009 gasless transfers). The x402 protocol provides the HTTP integration layer.

**Split deployment:**
- **`web/`** — Next.js 15 frontend deployed on **Vercel**. Pure client-side: pages, wallet management, EIP-712 signing, Protocol Inspector. Calls the facilitator API via `NEXT_PUBLIC_FACILITATOR_URL`.
- **`src/server/`** — Express facilitator deployed on **GCP Cloud Run**. Handles all chain interaction: settlement, event listening, reputation, order management, SQLite DB. Runs with `PRIVATE_KEY` for gas.

```
Vercel (web/)                    GCP Cloud Run (src/server/)
┌──────────────────┐             ┌──────────────────────────┐
│ Next.js Frontend │   fetch     │ Express Facilitator      │
│ Pages + Signing  │────────────>│ REST API + Chain + SQLite│
└──────────────────┘   CORS      └──────────────────────────┘
        │                                   │
        │ signTypedData                     │ PRIVATE_KEY (gas)
        ▼                                   ▼
   User's Browser                  EscrowVault (Base Sepolia)
```

**Other layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine + stats), SessionEscrow (session micropayments), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/client/`** — Client SDK: EIP-712 signing, reputation lookup (`getReputation()`), and x402 payment flow (`escrowFetch` with optional `onSellerReputation` callback)

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`). The web app imports `@shared/` via webpack alias for types and EIP-712 signing functions (client-safe, no server deps).

### Escrow Lifecycle (On-Chain)

```
None → Active → DeliveryConfirmed → Completed      (buyer releases)
         │             │              AutoReleased   (timeout, anyone triggers)
         │             └────────────→ Disputed ──→ Resolved (arbiter splits %)
         └───────────────────────────→ Refunded   (seller voluntary / arbiter)
```

- **Active**: escrow created, USDC locked. Buyer can release anytime, seller can confirm delivery or refund.
- **DeliveryConfirmed**: seller confirmed delivery, dispute window starts. Buyer can release or dispute.
- **AutoRelease timing**: From Active state, requires `releaseWindow + disputeWindow`. From DeliveryConfirmed, requires `releaseWindow` from creation AND `disputeWindow` from delivery confirmation.
- **Dispute timing**: From DeliveryConfirmed, within `disputeWindow` of confirmation. From Active, between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation.
- **disputeWindow**: Owner-settable global default (default: 3 days, bounds: 1 hour–30 days). Set via `EscrowVault.setDisputeWindow()`. Stored per-escrow at creation — existing escrows keep their original value.
- **Resolved**: arbiter splits funds by buyer percentage (0-100). Fee goes to feeRecipient, split applies to `amount - fee`.
- **Refunded**: buyer gets full deposit back including fee — facilitator absorbs cost.

### Reputation System

On-chain credit scoring for agents/wallets, computed from escrow transaction history. The facilitator tracks both `sellerStats` and `buyerStats` on-chain (in `EscrowVault.sol`), and the server computes weighted reputation scores from this data.

**Architecture:**
- **On-chain**: `buyerStats[address]` and `sellerStats[address]` mappings in EscrowVault track totalEscrows, completedCount, disputedCount, refundedCount, resolvedCount, and amounts. Raw data is permissionless — anyone can read and compute their own scores.
- **Off-chain**: `reputationService.ts` computes weighted scores (0-100) with confidence levels, cached 60s in-memory.
- **Dynamic params**: Service types use `adjustParams()` to shorten/extend release windows based on counterparty reputation (e.g. high-trust pairs get 3-day instead of 7-day marketplace window).
- **Client integration**: Seller reputation is included in payment responses; clients can check via `onSellerReputation` callback before paying.

Scoring formulas and implementation details are in `src/CLAUDE.md`.

### Fee System

The facilitator pays all gas fees for on-chain transactions (createEscrowWithAuth, confirmDelivery, resolveDispute, refund). To cover costs and earn margin, a configurable facilitator fee is deducted from the seller's payout at settlement (seller-pays model, like Stripe/PayPal).

**How it works:**
- `feeBps`, `flatFee`, and `feeRecipient` are global contract state, set by owner via `setFeeConfig()`
- Fee is computed at escrow creation: `fee = (amount * feeBps) / 10000 + flatFee`, stored in `Escrow.facilitatorFee`
- The percentage component (`feeBps`) covers facilitator profit/margin; the fixed component (`flatFee`) covers gas costs — similar to Stripe's `2.9% + $0.30` model
- Buyer pays exactly `orderPrice` — no amount inflation
- On release/autoRelease: seller gets `amount - fee`, feeRecipient gets `fee`
- On refund: buyer gets full `amount` back (facilitator absorbs cost)
- On dispute resolution: fee goes to feeRecipient, `buyerPct` split applies to `amount - fee`

Contract constants and safety guards are in `contracts/CLAUDE.md`. Server-side fee configuration (env vars) is in `src/CLAUDE.md`.

### x402 Integration Layer

HTTP transport for triggering escrow creation. The contracts can also be called directly.

1. Client POSTs to a payment-protected endpoint without `X-PAYMENT` header
2. Middleware returns **402** with `X-PAYMENT-REQUIRED` header (base64 JSON: amount, token, escrow address, order details)
3. Client signs ERC-3009 `ReceiveWithAuthorization` via EIP-712 (USDC gasless transfer to EscrowVault)
4. Client retries with `X-PAYMENT` header containing the signature
5. Server verifies signature off-chain (`facilitator/verifier.ts`), submits `createEscrowWithAuth` on-chain (`facilitator/settler.ts`)
6. Returns **200** with `X-PAYMENT-RESPONSE` header

## Constants

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
- Workspaces: root `package.json` has `"workspaces": ["packages/*", "web"]`; run `bun install` from root to link
