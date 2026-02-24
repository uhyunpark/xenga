# contracts

Foundry smart contracts for the Xenga escrow system on Base Sepolia. EscrowVault (escrow state machine + stats) and SessionEscrow (session micropayments).

## Build & Test

```bash
forge build                                        # Build contracts
forge test                                         # Run all tests
forge test --match-test test_specificName           # Run single test
forge test -vvvv                                   # Verbose output with traces

# ABI sync (run from repo root after contract changes)
bun run build:contracts && bun run sync-abi

# Deployment
bun run deploy                                     # Production (Base Sepolia)
bun run deploy:local                               # Local Anvil
forge script script/Deploy.s.sol --fork-url ... --private-key ... --broadcast
```

## Structure

```
contracts/
├── foundry.toml            # Solc 0.8.24, via_ir=true, optimizer 200 runs
├── src/
│   ├── EscrowVault.sol     # Main escrow contract (510 lines)
│   ├── SessionEscrow.sol   # Session micropayments (243 lines)
│   └── interfaces/
│       └── IERC3009.sol    # ERC-3009 interface (defined locally, not from OZ)
├── test/
│   ├── EscrowVault.t.sol   # 1,103 lines
│   ├── SessionEscrow.t.sol # 317 lines
│   └── mocks/
│       └── MockUSDC.sol    # ERC20 + ERC-3009 mock (115 lines)
└── script/
    ├── Deploy.s.sol        # Base Sepolia production
    └── DeployLocal.s.sol   # Local Anvil (deploys MockUSDC)
```

## Contracts

**EscrowVault** — Main escrow contract. Inherits `Ownable2Step` + `Pausable`. Uses `SafeERC20` for USDC transfers and `IERC3009` for gasless deposits via `receiveWithAuthorization`. Immutable `usdc` token address. Manages the full escrow state machine (Active → DeliveryConfirmed → Completed/AutoReleased/Disputed/Refunded). Tracks `buyerStats[address]` and `sellerStats[address]` on-chain.

**SessionEscrow** — Session-based micropayments. Inherits `Ownable2Step` + `Pausable`. Delegated `facilitator` role for capture/settle. Sessions: create → capture (incremental) → settle or reclaim (expired).

Both follow checks-effects-interactions pattern — no ReentrancyGuard needed since state updates happen before external calls via `SafeERC20`.

## OpenZeppelin Usage

| Import | Usage |
|--------|-------|
| `Ownable2Step` | 2-step ownership transfer for all admin setters |
| `Pausable` | Emergency pause (`whenNotPaused` modifier) |
| `SafeERC20` | Safe USDC transfers (`safeTransferFrom`, `safeTransfer`) |
| `ERC20` | MockUSDC token implementation (test only) |
| `ECDSA` | Signature recovery in MockUSDC (test only) |

## Access Control

| Role | Methods | Enforced via |
|------|---------|-------------|
| Owner | `setArbiter()`, `setFeeConfig()`, `setDisputeWindow()`, `pause()` | `onlyOwner` (Ownable2Step) |
| Buyer | `releaseFunds()`, `dispute()` | `onlyBuyer(escrowId)` modifier |
| Seller | `confirmDelivery()`, `refund()` | `onlySeller(escrowId)` modifier |
| Arbiter | `resolveDispute()`, `refund()` | `onlyArbiter()` modifier |
| Facilitator | `captureSession()`, `settleSession()` | `onlyFacilitator()` modifier |
| Anyone | `autoRelease()` | permissionless after timeout |

Custom errors: `NotBuyer()`, `NotSeller()`, `NotArbiter()`, `NotFacilitator()`, `NotAuthorized()`, `InvalidState(current, expected)`.

## Events

**EscrowVault:**
- `EscrowCreated(escrowId, orderId, buyer, seller, amount, fee, serviceType)`
- `DeliveryConfirmed(escrowId)`, `EscrowReleased(escrowId, releasedBy, sellerAmount, feeAmount)`
- `EscrowAutoReleased(escrowId, sellerAmount, feeAmount)`, `EscrowDisputed(escrowId, disputedBy)`
- `DisputeResolved(escrowId, buyerAmount, sellerAmount, feeAmount)`, `EscrowRefunded(escrowId, buyerAmount)`
- `ArbiterChanged(old, new)`, `FeeConfigUpdated(recipient, bps, flat)`, `DisputeWindowUpdated(old, new)`

**SessionEscrow:**
- `SessionCreated(sessionId, buyer, seller, amount, expiresAt)`
- `SessionCaptured(sessionId, captureAmount, totalCaptured)`, `SessionSettled(sessionId, captured, refund)`
- `SessionReclaimed(sessionId, refundAmount)`, `FacilitatorChanged(old, new)`

Primary IDs and key actors are indexed for event filtering.

## Post-Deployment Configuration

All owner-callable setters. Ownership uses `Ownable2Step` — transfer requires 2-step confirmation (`transferOwnership(newOwner)` then `acceptOwnership()` from new owner).

| Config | Contract | Setter | Default | Bounds |
|---|---|---|---|---|
| Arbiter address | EscrowVault | `setArbiter(address)` | deployer | — |
| Fee config | EscrowVault | `setFeeConfig(recipient, bps, flat)` | 0 | max 10% + 50 USDC |
| Dispute window | EscrowVault | `setDisputeWindow(uint256)` | 3 days | 1 hour – 30 days |
| Pause / unpause | EscrowVault, SessionEscrow | `pause()` / `unpause()` | unpaused | — |
| Facilitator address | SessionEscrow | `setFacilitator(address)` | — | — |

## Fee Constants

- `MAX_FEE_BPS = 1000` (10% cap), `MAX_FLAT_FEE = 50_000_000` (50 USDC cap)
- Fee formula: `fee = (amount * feeBps) / 10000 + flatFee`
- Safety: `if (fee >= amount) revert InvalidFee()` — prevents tiny escrows where fee exceeds deposit
- Guard: `if (fee > 0 && feeRecipient != address(0))` — prevents revert if feeRecipient set to zero while escrows active
- Zero-fee mode: feeRecipient can be `address(0)` only if both feeBps=0 AND flatFee=0

## Design Notes

**`releaseWindow` (per-escrow) vs `disputeWindow` (global default):**
`releaseWindow` is a business timing parameter that must vary by service type (1h for agent-service, 7d for marketplace). It is computed by the server per-escrow from service types + reputation and stored in the escrow struct. `disputeWindow` is a consumer protection parameter — a uniform "cooling off period" — set globally by the owner so it cannot be manipulated by the facilitator on a per-escrow basis.

## Deployment Scripts

**`Deploy.s.sol`** (production): Reads env vars `PRIVATE_KEY`, `USDC_ADDRESS` (defaults to Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`), `ARBITER_ADDRESS`, `FEE_RECIPIENT`, `FEE_BPS`, `FEE_FLAT_USDC`, `FACILITATOR_ADDRESS`. Deploys EscrowVault + SessionEscrow.

**`DeployLocal.s.sol`** (Anvil): Deploys MockUSDC first, mints 1M USDC to deployer, zero fees, all roles set to deployer. Uses default Anvil account #0 PK.

## Test Patterns

- **setUp**: deploy MockUSDC → deploy main contract → mint 100 USDC to buyer → define constants
- **Test actors** with known PKs: `buyerPk = 0xA11CE`, `buyer = vm.addr(buyerPk)`, `sellerPk = 0xB0B`, etc.
- **Helpers**: `_createStandardEscrow()` (approve + transferFrom flow), `_signReceiveAuth()` (manual EIP-712 struct hash with `keccak256(abi.encode(...))`)
- **Fuzz tests**: `testFuzz_resolveDispute()`, `testFuzz_createEscrow()`, `testFuzz_settleSession()` — use `vm.assume()` for preconditions and `bound()` for range clamping
- **State machine tests**: verify `InvalidState` reverts for invalid transitions
- **Pause tests**: verify `EnforcedPause` revert from `whenNotPaused` modifier

### MockUSDC

ERC20 + IERC3009 implementation with `ECDSA.recover()` for signature verification.
- `receiveWithAuthorization()`: msg.sender must equal `to` (payee) — front-run safe
- `transferWithAuthorization()`: any caller can execute
- Nonce-based replay protection per (signer, nonce) pair
- Custom errors: `AuthorizationAlreadyUsed()`, `AuthorizationNotYetValid()`, `AuthorizationExpired()`, `CallerMustBePayee()`, `InvalidSignature()`

## Technical Notes

- **`via_ir = true`** in `foundry.toml` is required — OpenZeppelin contracts cause "stack too deep" without it
- **Foundry tests**: default `block.timestamp` is 1 (not 0). Use explicit absolute timestamps with `vm.warp()` rather than relative offsets from captured `block.timestamp` (via_ir can change evaluation order)
- **AutomationCompatibleInterface**: defined locally in `src/interfaces/` (Chainlink repo too large to install as dependency)
- **ABI source of truth**: Foundry artifacts in `out/` → run `bun run sync-abi` from repo root to regenerate `src/shared/abi.ts`. Never edit `abi.ts` manually.
- **`IERC3009.sol`** is a local interface, not from OpenZeppelin
- **Solc 0.8.24** with optimizer enabled (200 runs)
- **`SafeERC20`** adds ~3% gas overhead vs direct transfers but prevents silent failures on non-compliant ERC20s
