# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Server (Express + SQLite)
bun run dev                    # Dev mode with watch
bun run start                  # Production start

# Contracts (Foundry)
bun run build:contracts        # forge build (from contracts/)
bun run test:contracts         # forge test (from contracts/)
cd contracts && forge test --match-test test_specificName  # Run single test
cd contracts && forge test -vvvv  # Verbose output with traces

# ABI sync (run after contract changes)
bun run build:contracts && bun run sync-abi
```

## Architecture

x402 HTTP 402 escrow payment system on Base Sepolia using USDC (ERC-3009 gasless transfers).

**Three layers:**
- **`contracts/`** — Foundry project: EscrowVault (escrow state machine), AutoReleaseKeeper (Chainlink automation), MockUSDC (test token)
- **`src/server/`** — Express server: x402 middleware intercepts requests, returns 402 with payment requirements, verifies EIP-712 signatures, settles on-chain
- **`src/client/`** — SDK: `escrowFetch` wraps fetch to handle the 402 flow automatically, `escrowScheme` handles EIP-712 ReceiveWithAuthorization signing

**Shared code** (`src/shared/`): types, constants, EIP-712 domain/types, and auto-generated ABIs (`abi.ts` — never edit manually, use `sync-abi`).

### x402 Payment Flow

1. Client POSTs to a payment-protected endpoint without `X-PAYMENT` header
2. Middleware returns **402** with `X-PAYMENT-REQUIRED` header (base64 JSON: amount, token, escrow address, order details)
3. Client signs ERC-3009 `ReceiveWithAuthorization` via EIP-712 (USDC gasless transfer to EscrowVault)
4. Client retries with `X-PAYMENT` header containing the signature
5. Server verifies signature off-chain (`facilitator/verifier.ts`), submits `createEscrowWithAuth` on-chain (`facilitator/settler.ts`)
6. Returns **200** with `X-PAYMENT-RESPONSE` header

### Service Types

Service types (`src/server/service-types/`) define escrow parameters per use case:
- **marketplace**: 7-day release window, manual delivery confirmation
- **agent-service**: 1-hour release window, auto-verify delivery

### Escrow Lifecycle (On-Chain)

`None → Active → DeliveryConfirmed → Completed` (happy path: seller confirms, buyer releases)
- **AutoReleased**: anyone triggers after release window expires
- **Disputed**: buyer files within 3-day window after delivery confirmation
- **Resolved**: arbiter splits funds by percentage
- **Refunded**: seller or arbiter refunds buyer

## Key Technical Notes

- **`via_ir = true`** in `foundry.toml` is required — OpenZeppelin contracts cause "stack too deep" without it
- **`@types/express` v5**: `req.params` values are `string | string[]`, cast to `string` when needed
- **Foundry tests**: default `block.timestamp` is 1 (not 0); use explicit absolute timestamps with `vm.warp()` rather than relative offsets from captured `block.timestamp` (via_ir can change evaluation order)
- **ABI source of truth**: Foundry artifacts in `contracts/out/` → run `sync-abi` to regenerate `src/shared/abi.ts`
- **AutomationCompatibleInterface**: defined locally in `contracts/src/interfaces/` (Chainlink repo too large to install)

## Environment

Requires `.env` (see `.env.example`): `PRIVATE_KEY`, `ESCROW_VAULT_ADDRESS`, optionally `BASE_SEPOLIA_RPC` and `PORT`.

## Constants

- Chain: Base Sepolia (84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals)
- Runtime: Bun
