# Plan: Buyer Identity Verification for Reputation-Aware Escrow Terms

## Problem

At 402 time (step 1), the buyer hasn't identified themselves yet. The server uses
a placeholder `buyerScore: 50, buyerConfidence: "low"` when calling `adjustParams()`.
This means the "both sides 80+ = fast lane" path is effectively dead code — it can
never trigger because the buyer score is always 50.

If we naively add a `X-BUYER-ADDRESS` header to step 1, anyone could claim a
high-reputation address to get better terms. We need cryptographic verification.

## Approach: Claim-then-Verify

**Step 1 (402 path):** Buyer sends their address via `X-BUYER-ADDRESS` header.
Server uses it for `adjustParams()` and returns personalized terms in the 402
response. This gives accurate escrow parameters upfront.

**Step 2 (settlement path):** The ERC-3009 signature reveals the real buyer
address (`payload.from`). The server **re-runs `adjustParams()`** with the real
buyer to compute the authoritative `releaseWindow`, and uses THAT for the on-chain
escrow — ignoring whatever the payload claimed.

No extra signature. No UX friction. The existing ERC-3009 sig is the proof.
Spoofing is pointless because the server always re-computes with the real address.

## Changes

### 1. `src/server/middleware/paymentCore.ts` — 402 path

In `processEscrowPayment()` (line 77), extract the claimed buyer address:
```typescript
const claimedBuyer = ctx.getHeader("x-buyer-address") as Address | undefined;
return buildPaymentRequiredResponse(order, deps, log, claimedBuyer);
```

In `buildPaymentRequiredResponse()`, add `claimedBuyer?: Address` param:
- If provided AND `deps.computeReputation` is available, fetch buyer rep
  in parallel with seller rep via `Promise.all`
- Pass real buyer scores to `adjustParams()` instead of placeholder
- If absent, fall back to current behavior (buyerScore: 50, "low")

### 2. `src/server/middleware/paymentCore.ts` — settlement path

After `deps.verify()` succeeds (line 118), before settling:
- Look up buyer reputation using `payload.from` (the cryptographically verified address)
- Look up seller reputation (or reuse from 402 if cached)
- Re-run `adjustParams()` with real buyer + seller scores
- Override `payload.releaseWindow` with the re-computed authoritative value
- Settle on-chain with the correct window

This ensures spoofing is impossible — even if step 1 used a fake address,
step 2 always computes the real window from the real signer.

### 3. `src/client/escrowFetch.ts`

In `escrowFetch()`, before the first request:
- Extract buyer address from `options.walletClient.account.address`
- Add `X-BUYER-ADDRESS` header to the initial request

Backward-compatible: servers that don't understand the header ignore it.

### 4. `demo-web/lib/api/payment-flow.ts`

In `requestPayment()`:
- Add optional `buyerAddress?: Address` parameter
- If provided, include `X-BUYER-ADDRESS` header in the initial POST
- Update inspector event to show the new header

### 5. Demo components (callers of `requestPayment()`)

Find where `requestPayment()` is called in marketplace and agent components,
pass the wallet's `account.address`.

## Security Analysis

| Attack | Result |
|---|---|
| Claim high-rep address in step 1, sign with own key in step 2 | Server re-computes window from real signer → correct window on-chain. Attacker sees optimistic 402 but gets real terms. |
| No header sent | Falls back to buyerScore: 50 (current behavior). No regression. |
| Invalid/garbage address header | Reputation lookup returns 0 escrows → unknown buyer → default window. Harmless. |

## Files Summary

| File | Change |
|---|---|
| `src/server/middleware/paymentCore.ts` | Read X-BUYER-ADDRESS in 402 path; re-compute release window at settlement |
| `src/client/escrowFetch.ts` | Send X-BUYER-ADDRESS on initial request |
| `demo-web/lib/api/payment-flow.ts` | Accept + forward buyerAddress |
| `demo-web/components/marketplace/PaymentFlow.tsx` | Pass buyer address (if applicable) |
| `demo-web/components/agent/AgentTerminal.tsx` | Pass buyer address (if applicable) |
