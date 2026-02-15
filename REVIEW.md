# x402 Escrow — Comprehensive Code Review

**Date:** 2026-02-15
**Scope:** Full repository (contracts, server, client SDK, demo-web)

---

## Executive Summary

The x402 escrow payment system is well-architected with strong fundamentals: proper EIP-712 signature handling, a clean state machine design in Solidity, and a clever HTTP 402-based payment protocol. However, the review surfaced **3 critical**, **7 high**, **15 medium**, and several low-severity issues across the stack. The system is suitable for testnet demos but requires substantial hardening before mainnet or production deployment.

---

## Table of Contents

1. [Smart Contracts](#1-smart-contracts)
2. [Server & Facilitator](#2-server--facilitator)
3. [Client SDK](#3-client-sdk)
4. [Demo Web Application](#4-demo-web-application)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
6. [Prioritized Fix Plan](#6-prioritized-fix-plan)

---

## 1. Smart Contracts

### 1.1 CRITICAL — Dispute Window Logic in Active State

**File:** `contracts/src/EscrowVault.sol` (dispute function)

The dispute window for `Active` state escrows uses `(releaseWindow - disputeWindow)` to `(releaseWindow + disputeWindow)`, creating a window centered on the release time. For a 7-day release / 3-day dispute config:

- Disputes allowed: day 4 through day 10
- Auto-release callable: after day 10

This means a dispute can be filed at the exact moment auto-release becomes callable, creating an ambiguous race. A malicious buyer could file a dispute at the last second to prevent auto-release and hold funds hostage.

**Recommendation:** Restructure so disputes in Active state are allowed from creation until `releaseWindow` (not overlapping with auto-release eligibility).

### 1.2 HIGH — `refund()` Too Permissive for Disputed State

**File:** `contracts/src/EscrowVault.sol`

Both seller and arbiter can call `refund()` in `Disputed` state with no distinction. Once a dispute is filed, the seller should not be able to unilaterally refund — only the arbiter should have authority in disputed escrows.

**Recommendation:** Split permissions: seller can refund in `Active`/`DeliveryConfirmed`, arbiter can refund in `Disputed`.

### 1.3 HIGH — Arbiter Change Is Single-Step

**File:** `contracts/src/EscrowVault.sol` (`setArbiter`)

Despite the contract using `Ownable2Step` for ownership, the arbiter change is a single-step operation. A typo in the arbiter address makes all pending disputes unresolvable.

**Recommendation:** Implement a 2-step acceptance pattern for arbiter changes, mirroring `Ownable2Step`.

### 1.4 HIGH — No Zero-Address Check for Arbiter

Constructor and `setArbiter()` accept `address(0)`, which would make disputes permanently unresolvable.

**Recommendation:** Add `if (_arbiter == address(0)) revert InvalidAddress();`.

### 1.5 MEDIUM — Unbounded Loop in AutoReleaseKeeper

**File:** `contracts/src/AutoReleaseKeeper.sol` (`checkUpkeep`)

The loop from `startId` to `endId` has no range cap. A caller could pass `endId = type(uint256).max`, causing excessive gas consumption. Chainlink nodes could reject this upkeep.

**Recommendation:** Enforce `MAX_SCAN_RANGE` (e.g., 500) and revert if exceeded.

### 1.6 MEDIUM — Silent Failures in `performUpkeep`

`try vault.autoRelease(escrowIds[i]) {} catch {}` swallows all errors, including legitimate failures (balance issues, unexpected states). This makes debugging impossible.

**Recommendation:** Emit an `AutoReleaseAttempted(escrowId, success, reason)` event, or at minimum only catch `InvalidState` errors.

### 1.7 MEDIUM — Keeper Forwarder Can Be Set to Zero

Setting `forwarder = address(0)` silently disables access control, allowing anyone to call `performUpkeep`.

### 1.8 LOW — Unvalidated `serviceType` String

No length or content validation on `serviceType` parameter in `createEscrowWithAuth`. Empty or extremely long strings are stored on-chain.

### 1.9 LOW — Integer Precision in `resolveDispute`

`(amount * buyerPct) / 100` loses up to 5 wei per resolution with USDC's 6 decimals. The current `sellerAmount = amount - buyerAmount` pattern correctly captures the remainder, so this is cosmetic but worth documenting.

### 1.10 Positive — Test Coverage

60+ tests covering happy paths, access control, edge cases, fuzzing for `resolveDispute`, and the automation keeper. Missing: boundary-condition tests for dispute windows near exact timestamps, and concurrent action scenarios.

---

## 2. Server & Facilitator

### 2.1 CRITICAL — Silent Success on Missing Escrow ID

**File:** `src/server/facilitator/settler.ts`

If `settleEscrow()` submits a transaction that succeeds but the `EscrowCreated` event is not found in logs, it returns `escrowId = 0` instead of throwing. The middleware then stores `escrowId = 0` in the database and returns a 200 to the client.

**Recommendation:** Throw an error if no `EscrowCreated` event is found after a successful transaction.

### 2.2 HIGH — Race Condition in `updateOrderStatus()`

**File:** `src/server/services/orderService.ts`

`updateOrderStatus()` has no `WHERE` clause verifying the current status. Two concurrent calls can overwrite each other's state transitions.

**Recommendation:** Add `WHERE status = ?` for the expected previous state, and verify `result.changes > 0`.

### 2.3 HIGH — Dispute Allows `escrowId = 0`

**File:** `src/server/routes/disputes.ts`

When filing a dispute, if the order has no `escrowId`, the code inserts `escrow_id = 0` via `order.escrowId ?? 0`. This creates a dispute record pointing to a non-existent escrow.

**Recommendation:** Return 400 if `escrowId` is missing.

### 2.4 MEDIUM — Auto-Verify Job Not Persisted

**File:** `src/server/services/eventListener.ts`

Auto-verify for agent-service escrows is scheduled via `setTimeout(5000)`. If the server crashes before the timer fires, the auto-verify is lost permanently. There is no persistent job queue.

**Recommendation:** Use a persistent job queue (e.g., BullMQ) or poll for unverified escrows on startup.

### 2.5 MEDIUM — Event Listener Silently Skips Missing Orders

`syncOrderStatus()` silently returns if `getOrderByOrderId()` returns null. This could happen if the event listener processes an `EscrowCreated` event before `createOrder()` completes in the database.

**Recommendation:** Retry with backoff, or queue the event for later processing.

### 2.6 MEDIUM — No Settlement Timeout

If `settleEscrow()` hangs (RPC unresponsive), the HTTP request hangs indefinitely. No timeout wrapper exists.

**Recommendation:** Add `AbortController` or timeout wrapper (e.g., 30 seconds).

### 2.7 MEDIUM — No Price or Address Validation on Order Creation

**File:** `src/server/routes/orders.ts`

`POST /api/orders` accepts any string as `sellerAddress` and any number as `price` (including 0 or negative).

**Recommendation:** Use `viem.isAddress()` for address validation. Validate `price > 0`.

### 2.8 MEDIUM — No Pagination on List Endpoints

`GET /api/orders` and `GET /api/disputes` return all records with no pagination. This becomes a problem as data grows.

### 2.9 LOW — Address Case Inconsistency

Addresses are stored as-provided (mixed case). Some queries use `LOWER()`, others don't. This can cause missed matches.

**Recommendation:** Normalize to lowercase (or checksum) at insertion.

### 2.10 LOW — Missing Database Index

No index on `orders.escrow_id`, which is used by the event listener to correlate on-chain events.

### 2.11 LOW — Missing `ESCROW_VAULT_ADDRESS` Format Validation

`config.ts` validates `PRIVATE_KEY` format but not `ESCROW_VAULT_ADDRESS`.

---

## 3. Client SDK

### 3.1 MEDIUM — No Client-Side Network/Chain Validation

**File:** `src/client/escrowFetch.ts`

The client trusts the `network` string from the server's 402 response without validating it matches the wallet's current chain. A MITM could inject a different network. On-chain validation would ultimately fail, but the user experience would be confusing.

**Recommendation:** Compare `paymentRequired.network` against `walletClient.chain.id` before signing.

### 3.2 MEDIUM — No Client-Side Balance Check

The client signs an ERC-3009 authorization without checking USDC balance. If the buyer has insufficient USDC, settlement will fail on-chain, wasting gas and creating a confusing error.

**Recommendation:** Query USDC balance before signing and fail early with a clear message.

### 3.3 MEDIUM — Body Fallback Parsing Can Throw

**File:** `src/client/escrowFetch.ts`

If the 402 response has no `X-PAYMENT-REQUIRED` header, the code falls back to parsing the response body. If the body is also missing or malformed, `JSON.parse()` throws an uncaught error.

**Recommendation:** Wrap in try-catch with a descriptive error message.

### 3.4 LOW — No Built-In Retry Logic

`escrowFetch` makes a single attempt. Network failures during the retry POST (step 5 of the flow) are the caller's responsibility. This is an intentional design choice but should be documented.

### 3.5 Positive — Strong Security Fundamentals

EIP-712 domain binding, 24-hour `validBefore` window, per-order nonces via `keccak256(address + orderId + UUID)`, and proper signature decomposition. The idempotency handling in the middleware correctly prevents double payments.

---

## 4. Demo Web Application

### 4.1 CRITICAL — Private Key in SessionStorage

**File:** `demo-web/lib/wallet/WalletProvider.tsx`

Demo wallet private keys are stored in `sessionStorage`, accessible to any JavaScript running on the page. An XSS vulnerability would leak the key.

**Context:** This is a demo wallet for testnet tokens, so the real-world impact is limited. However:
- **Recommendation:** Add prominent UI warnings ("Demo wallet — never use with real funds"). Consider in-memory-only storage.

### 4.2 HIGH — Dispute Resolution Has No Authentication

**File:** `demo-web/app/api/disputes/[id]/resolve/route.ts`

Anyone can call `POST /api/disputes/:id/resolve` with arbitrary `buyerPct` to split funds. No arbiter verification, no signed message, no access control.

**Recommendation:** Require arbiter wallet signature (as done in the Express server's auth middleware).

### 4.3 HIGH — Delivery Confirmation Unprotected in Mock Mode

**File:** `demo-web/app/api/orders/[id]/confirm-delivery/route.ts`

In mock mode (`adapter.isMock`), anyone can confirm delivery on any order. In real mode, it only checks that the operator wallet is the seller — not the actual seller's identity.

**Recommendation:** Implement proper seller authentication via signed message.

### 4.4 MEDIUM — In-Memory Rate Limiting on Faucet

**File:** `demo-web/app/api/demo/fund/route.ts`

Rate limit state is in-memory (`Map`), lost on restart, and per-process in clustered deployments. IP is read from `x-forwarded-for` which can be spoofed.

### 4.5 MEDIUM — No CSRF Protection

No CSRF tokens on any POST endpoint. An attacker's site could trigger state-changing operations via cross-origin requests.

**Recommendation:** Add CSRF token validation or SameSite cookie attributes.

### 4.6 MEDIUM — Unsafe JSON Parsing Without Try-Catch

**Files:** `lib/api/payment-flow.ts`, `components/marketplace/PaymentFlow.tsx`

Multiple `JSON.parse(atob(...))` calls without try-catch. Malformed data (from a corrupted sessionStorage or malicious header) crashes the component.

### 4.7 MEDIUM — Error Details Exposed to Client

**File:** `demo-web/app/api/orders/[id]/pay/route.ts`

Settlement errors return `err.message` to the client, potentially leaking internal implementation details (RPC URLs, contract addresses, stack traces).

**Recommendation:** Return generic error messages to client; log details server-side only.

### 4.8 MEDIUM — Transaction Confirmation Count

**File:** `demo-web/lib/chain/real-adapter.ts`

`waitForTransactionReceipt` waits for 1 confirmation with no timeout. For production, this should wait for more confirmations and have a timeout.

### 4.9 MEDIUM — No Input Size Limits

Dispute `reason`, order `title`/`description` have no max length. Large payloads could stress the database and responses.

### 4.10 LOW — `any` Types Defeat Type Safety

**File:** `demo-web/lib/wallet/WalletProvider.tsx`

`type AnyPublicClient = any` and untyped `window.ethereum` access reduce TypeScript's ability to catch errors.

### 4.11 LOW — Hard-Coded Magic Numbers

Poll interval (3000ms), max attempts (60), auto-verify delay (5000ms), rate limit window (3600000ms) are scattered across files without named constants.

### 4.12 LOW — ABI Hardcoded in WalletProvider

The ERC-20 `balanceOf` ABI is manually defined instead of importing from `viem` (`erc20Abi`) or `@shared/abi.ts`.

---

## 5. Cross-Cutting Concerns

### 5.1 No Audit Logging

No structured audit trail for sensitive operations (payments, disputes, resolutions, refunds). Only `console.log` with informal prefixes.

### 5.2 No Security Headers

No CSP, X-Frame-Options, X-Content-Type-Options, or HSTS headers configured in the Next.js app.

### 5.3 Database on /tmp in Vercel

SQLite path defaults to `/tmp/x402-escrow.db` on Vercel, which is ephemeral. All data is lost on cold start. This is acceptable for demos but must be documented.

### 5.4 No Monitoring or Alerting

No health checks for RPC connectivity, no monitoring for failed settlements, no alerting for dispute filings.

---

## 6. Prioritized Fix Plan

### Phase 1 — Critical & High (Pre-Mainnet Blockers)

| # | Issue | Location | Effort |
|---|-------|----------|--------|
| 1 | Fix dispute window logic for Active state | `EscrowVault.sol` | Medium |
| 2 | Throw error when EscrowCreated event not found | `settler.ts` | Small |
| 3 | Add arbiter 2-step acceptance pattern | `EscrowVault.sol` | Medium |
| 4 | Add zero-address check for arbiter | `EscrowVault.sol` | Small |
| 5 | Fix `refund()` permissions per state | `EscrowVault.sol` | Medium |
| 6 | Add `WHERE status = ?` to `updateOrderStatus()` | `orderService.ts` | Small |
| 7 | Reject disputes when `escrowId` is missing | `disputes.ts` | Small |
| 8 | Add auth to dispute resolution endpoint | `demo-web disputes resolve` | Medium |
| 9 | Add auth to delivery confirmation endpoint | `demo-web confirm-delivery` | Medium |

### Phase 2 — Medium (Production Readiness)

| # | Issue | Location | Effort |
|---|-------|----------|--------|
| 10 | Cap scan range in AutoReleaseKeeper | `AutoReleaseKeeper.sol` | Small |
| 11 | Add event logging to keeper failures | `AutoReleaseKeeper.sol` | Small |
| 12 | Persistent job queue for auto-verify | `eventListener.ts` | Large |
| 13 | Settlement timeout wrapper | `settler.ts` | Small |
| 14 | Client-side chain ID validation | `escrowFetch.ts` | Small |
| 15 | Client-side USDC balance check | `escrowScheme.ts` | Small |
| 16 | Input validation (addresses, prices, lengths) | Multiple routes | Medium |
| 17 | CSRF protection on POST endpoints | `demo-web` | Medium |
| 18 | Sanitize error responses to clients | Multiple routes | Small |
| 19 | Add try-catch to JSON parsing | `payment-flow.ts`, components | Small |
| 20 | Transaction confirmation count + timeout | `real-adapter.ts` | Small |

### Phase 3 — Low Priority (Polish)

| # | Issue | Location | Effort |
|---|-------|----------|--------|
| 21 | Normalize address casing in DB | `orderService.ts`, schema | Small |
| 22 | Add missing DB indexes | `schema.ts` | Small |
| 23 | Replace magic numbers with constants | Multiple files | Small |
| 24 | Add pagination to list endpoints | Routes | Medium |
| 25 | Validate `serviceType` on-chain | `EscrowVault.sol` | Small |
| 26 | Import `erc20Abi` from viem | `WalletProvider.tsx` | Small |
| 27 | Add security headers (CSP, etc.) | `next.config.ts` | Small |
| 28 | Structured audit logging | Multiple | Large |
| 29 | Event listener retry for missing orders | `eventListener.ts` | Medium |
| 30 | Validate `ESCROW_VAULT_ADDRESS` format | `config.ts` | Small |

---

## Architecture Observations (Non-Issues)

These are design decisions worth noting, not bugs:

- **Operator pays gas**: The facilitator submits `createEscrowWithAuth` using its own private key. This is intentional (gasless UX for buyers) but means the operator bears gas costs.
- **SQLite as database**: Appropriate for demo/single-server. Not suitable for multi-instance production deployment.
- **Webpack alias trick**: `demo-web` imports from parent `src/` via webpack aliases. This works but is fragile across Next.js version upgrades.
- **ERC-3009 version "2"**: The USDC EIP-712 domain uses `version: "2"`, matching Circle's actual USDC implementation. The MockUSDC mirrors this correctly.
- **No retry in `escrowFetch`**: The client SDK deliberately delegates retry logic to the caller. This is documented in the function signature but could surprise consumers.
