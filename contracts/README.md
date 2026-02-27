# Contracts

Solidity smart contracts for the escrow and reputation system. Built with Foundry.

## EscrowVault

Core escrow contract for USDC payments with gasless deposits (ERC-3009).

### State Machine

```
None ─→ Active ─→ DeliveryConfirmed ─→ Completed      (buyer releases)
           │              │              AutoReleased   (timeout, facilitator poller triggers)
           │              └───────────→ Disputed ──→ Resolved (arbiter splits %)
           └──────────────────────────→ Refunded   (seller voluntary / arbiter)
```

### Roles

- **Buyer** — deposits USDC (via ERC-3009 gasless authorization or approve+transferFrom), releases funds, files disputes
- **Seller** — confirms delivery (starts dispute window), can voluntarily refund
- **Arbiter** — resolves disputes by splitting funds (0-100% to buyer), can force refund
- **Facilitator** (operator) — submits gasless transactions on behalf of buyers, pays gas

### Key Functions

| Function | Access | Description |
|---|---|---|
| `createEscrowWithAuth` | anyone (gasless) | Create escrow via ERC-3009 signed authorization |
| `createEscrow` | buyer | Create escrow via approve+transferFrom |
| `confirmDelivery` | seller | Confirm delivery, start dispute window |
| `releaseFunds` | buyer | Release funds to seller (from Active or DeliveryConfirmed) |
| `autoRelease` | anyone (facilitator poller) | Release after timeout — see timing below |
| `dispute` | buyer | File dispute within dispute window |
| `resolveDispute` | arbiter | Split funds by buyer percentage (0-100) |
| `refund` | seller or arbiter | Full refund to buyer (facilitator absorbs fee) |

### Timing

- **Release window**: configurable per escrow (minimum = dispute window = 3 days)
- **Dispute window**: 3 days (`DEFAULT_DISPUTE_WINDOW`)
- **Auto-release from Active**: requires `releaseWindow + disputeWindow` to pass (gives buyer time to dispute even without delivery confirmation)
- **Auto-release from DeliveryConfirmed**: requires both `releaseWindow` from creation AND `disputeWindow` from delivery confirmation to pass
- **Dispute from DeliveryConfirmed**: within `disputeWindow` of `deliveryConfirmedAt`
- **Dispute from Active**: between `releaseWindow - disputeWindow` and `releaseWindow + disputeWindow` from creation

### On-Chain Stats (Reputation Data)

Per-address transaction counters — the raw data for reputation scoring.

```
sellerStats[address]  ─┐
buyerStats[address]   ─┤─→ Stats { totalEscrows, totalAmount,
serviceStats[string]  ─┘       completedCount, completedAmount,
                               disputedCount, disputedAmount,
                               resolvedCount,
                               refundedCount, refundedAmount }
```

View functions: `getSellerStats(address)`, `getBuyerStats(address)`, `getServiceTypeStats(string)`

Permissionless — anyone can read the raw data and compute their own reputation scores.

### Fee System

- `feeBps` / `feeRecipient` set by owner via `setFeeConfig()`
- Fee computed at escrow creation: `fee = (amount * feeBps) / 10000`
- Deducted from seller payout on release/autoRelease/resolve
- Full refund to buyer on refund (facilitator absorbs the fee)
- `MAX_FEE_BPS = 1000` (10% cap)

## SessionEscrow

Authorize-once, use-many session escrow for high-frequency micropayments.

```
None ─→ Active ─→ Settled    (facilitator finalizes, refunds unused)
           │
           └────→ Expired    (buyer reclaims after session timeout)
```

- Buyer deposits USDC for a session with a time limit
- Facilitator calls `captureSession()` to batch-settle usage incrementally
- `settleSession()` finalizes: captures remaining usage + refunds unused balance
- `reclaimExpired()` safety valve: buyer reclaims uncaptured funds after session expires

## Build & Test

```bash
forge build
forge test
forge test --match-test test_specificName   # single test
forge test -vvvv                            # verbose with traces
```

**Note:** `via_ir = true` in `foundry.toml` is required — OpenZeppelin contracts cause "stack too deep" without it.

## Dependencies

- OpenZeppelin Contracts (ERC20, Ownable2Step, Pausable, SafeERC20)
- Forge-std (testing)
- `IERC3009` defined locally in `src/interfaces/`
