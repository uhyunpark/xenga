# Add Solana Support to Xenga Escrow System

## Context

Xenga is an on-chain escrow and reputation system running on Base Sepolia (EVM) with USDC via ERC-3009 gasless transfers. The goal is to add Solana support **alongside** the existing EVM system — both chains work simultaneously, orders specify their target chain.

### Critical constraint: Don't break existing infrastructure

The codebase has **59 files** using viem types (`Address`, `Hash`, `Hex`), **18 files** importing from `constants.ts`, and types are re-exported as the public `@x402/types` package. Refactoring shared types or moving existing files would create massive blast radius.

### Key discovery: The scheme registry already supports this

The codebase has a `PaymentScheme` interface (`src/shared/schemes.ts`) with `registerScheme()`/`getScheme()` and a plugin architecture. The existing `escrowScheme` at `src/server/schemes/escrow.ts` is the EVM implementation. The `dispatch.ts` routes verify/settle calls through this registry based on `payload.scheme`. **Adding Solana = registering a new scheme.** Zero changes to existing types or EVM code.

```
       Client sends X-PAYMENT with scheme: "escrow" or "solana-escrow"
                           │
                    ┌──────┴──────┐
                    │  dispatch.ts │  getScheme(payload.scheme)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    escrowScheme (EVM)       solanaEscrowScheme (NEW)
    ├── settler.ts (viem)    ├── settler.ts (@solana/web3.js)
    ├── verifier.ts (EIP712) ├── verifier.ts (Ed25519)
    └── eventListener.ts     └── eventListener.ts
```

---

## Phase 1: Solana Anchor Program

Write the escrow program using **Anchor** framework. Mirrors `EscrowVault.sol` state machine.

### New directory: `solana-programs/escrow/`

Standard Anchor project layout:
```
solana-programs/escrow/
├── Anchor.toml
├── Cargo.toml
├── programs/escrow/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                    # Program entrypoint, declare_id!
│       ├── state.rs                  # Escrow, EscrowConfig, Stats account structs
│       ├── errors.rs                 # Custom error codes
│       └── instructions/
│           ├── mod.rs
│           ├── initialize.rs         # Set config PDA (arbiter, USDC mint, fees)
│           ├── create_escrow.rs      # Create escrow + SPL transfer from buyer
│           ├── confirm_delivery.rs   # Seller confirms delivery
│           ├── release_funds.rs      # Buyer releases to seller
│           ├── auto_release.rs       # Permissionless timeout release
│           ├── dispute.rs            # Buyer disputes (time-gated)
│           ├── resolve_dispute.rs    # Arbiter resolves
│           └── refund.rs             # Seller/arbiter refund
└── tests/
    └── escrow.ts                     # Anchor test suite (TypeScript)
```

### Account structure (PDAs)

```rust
// Global config — PDA seed: [b"config"]
#[account]
pub struct EscrowConfig {
    pub authority: Pubkey,        // owner
    pub arbiter: Pubkey,
    pub usdc_mint: Pubkey,
    pub fee_recipient: Pubkey,
    pub fee_bps: u16,
    pub flat_fee: u64,
    pub next_escrow_id: u64,
    pub bump: u8,
}

// Escrow — PDA seed: [b"escrow", order_id.as_ref()]  (see Errata E5 — orderId avoids race condition)
#[account]
pub struct Escrow {
    pub escrow_id: u64,            // informational counter (not used for PDA)
    pub order_id: [u8; 32],       // bytes32 matching EVM orderId — ALSO used as PDA seed
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,              // USDC atomic units (6 decimals)
    #[max_len(32)]
    pub service_type: String,     // max 32 chars (see Errata E12)
    pub state: EscrowState,       // u8 enum matching EVM states
    pub created_at: i64,
    pub release_window: i64,
    pub delivery_confirmed_at: i64,
    pub dispute_window: i64,
    pub facilitator_fee: u64,
    pub bump: u8,
}

// Stats — PDA seed: [b"seller_stats"|b"buyer_stats", address.as_ref()]
#[account]
pub struct Stats {
    pub total_escrows: u64,
    pub total_amount: u64,
    pub completed_count: u64,
    pub completed_amount: u64,
    pub disputed_count: u64,
    pub disputed_amount: u64,
    pub resolved_count: u64,
    pub refunded_count: u64,
    pub refunded_amount: u64,
    pub bump: u8,
}

// Escrow vault token account — PDA seed: [b"vault", order_id.as_ref()]
// (ATA owned by the escrow PDA, holds USDC for that escrow)
// Note: facilitator pays ~0.002 SOL rent per vault ATA (see Errata E11)
```

### Token flow: Partial signing (replacing ERC-3009)

On EVM, the buyer signs EIP-712 off-chain and the facilitator submits the tx. On Solana:

1. **Server returns 402** with `scheme: "solana-escrow"` and payment requirements (program ID, USDC mint, escrow params)
2. **Client builds a Solana transaction** containing:
   - SPL Token `transfer_checked` instruction (buyer's ATA → escrow vault ATA)
   - `create_escrow` instruction on the escrow program
   - Facilitator wallet as fee payer (so facilitator pays SOL gas)
3. **Client partial-signs** with buyer's key (authorizes the token transfer)
4. **Client sends the serialized partially-signed transaction** in the `X-PAYMENT` header (base64-encoded)
5. **Server deserializes, adds facilitator signature** (as fee payer), submits to Solana
6. **Server returns 200** with tx signature in `X-PAYMENT-RESPONSE`

### Events

Anchor `emit!()` for all state transitions (EscrowCreated, DeliveryConfirmed, EscrowReleased, etc.). Parsed from transaction logs by the event listener.

### Build commands (added to root `package.json`)

```
"build:solana": "cd solana-programs/escrow && anchor build",
"test:solana": "cd solana-programs/escrow && anchor test",
"deploy:solana:devnet": "cd solana-programs/escrow && anchor deploy --provider.cluster devnet"
```

---

## Phase 2: Server-Side Solana Scheme (additive, no existing file changes)

### New files

| File | Purpose |
|---|---|
| `src/server/solana/config.ts` | Solana-specific config: `SOLANA_RPC`, `SOLANA_PRIVATE_KEY`, `SOLANA_PROGRAM_ID`, `SOLANA_USDC_MINT` env vars. Validated independently from EVM config. |
| `src/server/solana/settler.ts` | Solana settlement: deserialize partial-signed tx → add facilitator signature → submit → parse Anchor event for escrowId. Also: `resolveDisputeOnChain()`, `refundOnChain()`, `getEscrowOnChain()`, `confirmDeliveryOnChain()`. |
| `src/server/solana/verifier.ts` | Verify the serialized transaction: check instructions match expected program ID, USDC mint, amounts, buyer/seller addresses. Validate buyer's Ed25519 signature on the transaction. |
| `src/server/solana/eventListener.ts` | Watch program events via `connection.onLogs(programId)`. Parse Anchor-emitted events from transaction logs. Save to same `events` DB table as EVM listener. Sync order status. |
| `src/server/solana/statsReader.ts` | Read Stats PDAs for reputation: `getSellerStats(pubkey)`, `getBuyerStats(pubkey)`. Returns the same `Stats` shape used by `reputationService.ts`. |
| `src/server/solana/idl.ts` | Auto-generated Anchor IDL (JSON) for the escrow program. Similar role to `src/shared/abi.ts` for EVM. |
| `src/server/schemes/solana-escrow.ts` | New `PaymentScheme` implementation for Solana. Uses solana/settler.ts and solana/verifier.ts. |

### `src/server/schemes/solana-escrow.ts` (key new file)

```typescript
import type { PaymentScheme, SettleResult } from "../../shared/schemes.js";
import type { SolanaEscrowPayload } from "../solana/types.js";  // (see Errata E9)
import { verifySolanaEscrowPayment } from "../solana/verifier.js";
import { settleSolanaEscrow } from "../solana/settler.js";

export const solanaEscrowScheme: PaymentScheme = {
  name: "solana-escrow",

  buildRequirement(params) {
    return {
      scheme: "solana-escrow",
      network: "solana-devnet",
      programId: params.programId,
      usdcMint: params.usdcMint,
      amount: params.amount,
      orderId: params.orderId,
      sellerAddress: params.sellerAddress,
      releaseWindow: params.releaseWindow,
      serviceType: params.serviceType,
      facilitatorAddress: params.facilitatorAddress, // for fee payer
    };
  },

  async verify(payload) {
    return verifySolanaEscrowPayment(payload as SolanaEscrowPayload);
  },

  async settle(payload): Promise<SettleResult> {
    const result = await settleSolanaEscrow(payload as SolanaEscrowPayload);
    return { success: true, txHash: result.txSignature, network: "solana-devnet", escrowId: result.escrowId };
  },
};
```

### Solana-specific payload type

```typescript
// src/server/solana/types.ts (NEW file — does NOT modify shared/types.ts)
export interface SolanaEscrowPayload {
  scheme: "solana-escrow";
  network: "solana-devnet" | "solana-mainnet";
  serializedTransaction: string;  // base64 partially-signed transaction
  buyer: string;                  // base58 pubkey
  seller: string;                 // base58 pubkey
  amount: string;                 // stringified u64
  orderId: string;                // hex bytes32
  serviceType: string;
  releaseWindow: number;
}

export interface SolanaEscrowPaymentRequired {
  scheme: "solana-escrow";
  network: "solana-devnet" | "solana-mainnet";
  programId: string;              // base58
  usdcMint: string;               // base58
  amount: string;
  orderId: string;
  sellerAddress: string;          // base58
  releaseWindow: number;
  serviceType: string;
  facilitatorAddress: string;     // base58 (fee payer)
  facilitatorFee?: string;
  feeBps?: number;
  flatFee?: string;
}
```

### Minimal modifications to existing files (3 files, ~5 lines each)

1. **`src/server/index.ts`** — Add 2 lines:
   ```typescript
   import { solanaEscrowScheme } from "./schemes/solana-escrow.js";
   // ... after existing registerScheme(escrowScheme):
   registerScheme(solanaEscrowScheme);
   ```

2. **`demo-web/instrumentation.ts`** — Add 2 lines (same pattern):
   ```typescript
   const { solanaEscrowScheme } = await import("@server/schemes/solana-escrow.js");
   registerScheme(solanaEscrowScheme);
   ```

3. **`src/server/solana/config.ts`** — Reads Solana env vars independently:
   ```typescript
   export const solanaConfig = {
     rpcUrl: process.env.SOLANA_RPC || "https://api.devnet.solana.com",
     privateKey: process.env.SOLANA_PRIVATE_KEY,
     programId: process.env.SOLANA_PROGRAM_ID,
     usdcMint: process.env.SOLANA_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
   };
   ```

### How routing works (no changes needed)

The existing `dispatch.ts` already routes by `payload.scheme`:
- Client sends `{ scheme: "escrow", ... }` → routes to existing EVM scheme
- Client sends `{ scheme: "solana-escrow", ... }` → routes to new Solana scheme

The `facilitator.ts` routes (`/facilitator/verify`, `/facilitator/settle`) also already use `getScheme(payload.scheme)` — they work automatically.

### Reputation integration

The existing `reputationService.ts` reads stats via `readContract()` on the EVM. For Solana:
- Add a `getSolanaStats()` function in `src/server/solana/statsReader.ts` that reads the Stats PDA
- The reputation routes (`src/server/routes/reputation.ts`) already take an address parameter. Add an optional `?network=solana-devnet` query param. If the address looks like a base58 pubkey (32+ chars, no 0x prefix), auto-detect Solana.
- **Modification**: Add ~10 lines to `src/server/routes/reputation.ts` to check network param and delegate to Solana stats reader when needed. The scoring formulas in `reputationService.ts` remain unchanged — they work with the same `Stats` interface.

### Event listener integration

- The new `src/server/solana/eventListener.ts` starts alongside the existing EVM listener
- **Modification**: Add ~3 lines to `src/server/index.ts` and `demo-web/instrumentation.ts` to call `startSolanaEventListener()` at startup (guarded by `if (solanaConfig.programId)`)
- Both listeners write to the same SQLite `events` and `orders` tables — no schema changes needed (event names and escrow IDs are already strings/numbers)

### Order-level chain selection

- **Modification to `src/server/routes/orders.ts`**: Accept optional `network` field in `CreateOrderRequest`. Defaults to `"base-sepolia"` for backwards compatibility.
- **DB**: Add `network TEXT DEFAULT 'base-sepolia'` column to orders table (backwards-compatible ALTER TABLE, or default in the CREATE)
- **Modification to `src/server/db/index.ts`**: Add `network` column to schema. Existing rows get `"base-sepolia"` default.
- The `paymentCore.ts` 402 response already reads order data. When `order.network` starts with `"solana"`, the 402 returns `scheme: "solana-escrow"` instead of `scheme: "escrow"`.
- **Modification to `src/server/middleware/paymentCore.ts`**: ~15 lines to check `order.network` and build the appropriate payment requirement. The verify/settle path goes through `dispatch.ts` which already routes by scheme name.

---

## Phase 3: Client-Side Solana Signing

### New files

| File | Purpose |
|---|---|
| `src/client/solanaEscrowScheme.ts` | Builds and partial-signs Solana transactions for the x402 flow |
| `src/shared/solana-constants.ts` | Solana devnet constants (USDC mint, default RPC). Kept separate from `constants.ts` to avoid breaking EVM imports. |

### `src/client/solanaEscrowScheme.ts`

```typescript
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferCheckedInstruction } from "@solana/spl-token";

export async function signSolanaEscrowPayment(
  wallet: { publicKey: PublicKey; signTransaction(tx: Transaction): Promise<Transaction> },
  paymentRequired: SolanaEscrowPaymentRequired,
  connection: Connection
): Promise<SolanaEscrowPayload> {
  const programId = new PublicKey(paymentRequired.programId);
  const usdcMint = new PublicKey(paymentRequired.usdcMint);
  const facilitator = new PublicKey(paymentRequired.facilitatorAddress);

  // 1. Derive PDAs
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const escrowId = /* from paymentRequired or derived */;
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowId.toArrayLike(Buffer, "le", 8)],
    programId
  );

  // 2. Get ATAs
  const buyerAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const vaultAta = await getAssociatedTokenAddress(usdcMint, vaultPda, true);

  // 3. Build transaction with facilitator as fee payer
  const tx = new Transaction();
  tx.feePayer = facilitator;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Add create_escrow instruction (includes token transfer via CPI or separate ix)
  tx.add(/* create_escrow instruction built from Anchor IDL */);

  // 4. Buyer partial-signs (authorizes token transfer)
  const signed = await wallet.signTransaction(tx);

  // 5. Serialize and return
  return {
    scheme: "solana-escrow",
    network: paymentRequired.network,
    serializedTransaction: signed.serialize({ requireAllSignatures: false }).toString("base64"),
    buyer: wallet.publicKey.toBase58(),
    seller: paymentRequired.sellerAddress,
    amount: paymentRequired.amount,
    orderId: paymentRequired.orderId,
    serviceType: paymentRequired.serviceType,
    releaseWindow: paymentRequired.releaseWindow,
  };
}
```

### Modification to `src/client/escrowFetch.ts` (~10 lines)

Add chain detection in the 402 response handler:

```typescript
// In the 402 handler, after parsing paymentRequired:
if (paymentRequired.scheme === "solana-escrow") {
  // Use Solana signing flow
  const { signSolanaEscrowPayment } = await import("./solanaEscrowScheme.js");
  payload = await signSolanaEscrowPayment(solanaWallet, paymentRequired, connection);
} else {
  // Existing EVM signing flow (unchanged)
  payload = await signEscrowPayment(walletClient, paymentRequired);
}
```

### Modification to `src/client/index.ts`

Add export for Solana signing:
```typescript
export { signSolanaEscrowPayment } from "./solanaEscrowScheme.js";
```

---

## Phase 4: Demo Web Solana Support

### New files

| File | Purpose |
|---|---|
| `demo-web/lib/wallet/SolanaWalletProvider.tsx` | Ephemeral Solana keypair for demo (stored in sessionStorage, like the EVM demo wallet). Provides `{ publicKey, signTransaction }` interface. |
| `demo-web/components/ui/ChainSelector.tsx` | Toggle between Base Sepolia and Solana Devnet |

### Modifications

- **`demo-web/lib/wallet/WalletProvider.tsx`** — Add `chain` state (`"base-sepolia" | "solana-devnet"`). When Solana is selected, provide a Solana wallet instead of viem WalletClient. Export `useChain()` hook.
- **`demo-web/components/ui/AddressDisplay.tsx`** — Detect base58 vs hex addresses, link to Solana Explorer when appropriate.
- **`demo-web/components/ui/TxLink.tsx`** — Same: detect chain from tx signature format, link to appropriate explorer.
- **`demo-web/lib/api/payment-flow.ts`** — Branch signing based on `paymentRequired.scheme` (same pattern as client SDK).
- **`demo-web/app/api/orders/route.ts`** — Pass `network` field through when creating orders.
- **`demo-web/app/api/demo/fund/route.ts`** — Add Solana funding path: airdrop SOL + transfer devnet USDC to demo wallet.

### No changes needed (already chain-agnostic)

- `dispatch.ts` / `facilitator.ts` routes (scheme registry handles routing)
- Protocol Inspector (events are strings, works with any chain)
- Navbar, landing page, marketplace/agent page structure

**Note**: `paymentCore.ts` is EVM-typed and NOT chain-agnostic (see Errata E3). Solana orders bypass it via the scheme registry (`dispatch.ts` path) or a separate Solana payment handler.

---

## Phase 5: Dependencies and Config

### New dependencies (root `package.json`)

```json
{
  "@solana/web3.js": "^1.95.0",
  "@coral-xyz/anchor": "^0.30.0",
  "@solana/spl-token": "^0.4.0"
}
```

### Demo-web dependencies (`demo-web/package.json`)

```json
{
  "@solana/web3.js": "^1.95.0",
  "@solana/spl-token": "^0.4.0"
}
```

### Global tooling requirements

- Rust toolchain (`rustup`) with `solana` target
- Solana CLI (`solana-cli`)
- Anchor CLI (`anchor-cli ^0.30.0`)

### Environment variables (additions to `.env.example`)

```bash
# Solana (optional — Solana support is disabled when these are not set)
SOLANA_RPC=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=<base58-encoded-keypair-json-or-bytes>
SOLANA_PROGRAM_ID=<deployed-program-id>
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

### Scripts (additions to root `package.json`)

```json
{
  "build:solana": "cd solana-programs/escrow && anchor build",
  "test:solana": "cd solana-programs/escrow && anchor test",
  "deploy:solana:devnet": "cd solana-programs/escrow && anchor deploy --provider.cluster devnet",
  "sync-solana-idl": "cp solana-programs/escrow/target/idl/escrow.json src/server/solana/idl.json"
}
```

---

## Implementation Order

| Step | What | Risk to existing infra |
|---|---|---|
| 1 | Write Anchor program + tests (`solana-programs/`) | **None** — entirely new directory |
| 2 | Deploy to devnet, generate IDL | **None** — external deployment |
| 3 | Add Solana server code (`src/server/solana/`) | **None** — new files only |
| 4 | Add Solana scheme (`src/server/schemes/solana-escrow.ts`) | **None** — new file |
| 5 | Register Solana scheme in `index.ts` + `instrumentation.ts` | **Minimal** — 2 import lines, guarded by config |
| 6 | Add `network` column to orders DB schema | **Low** — backwards-compatible default |
| 7 | Add chain routing in `paymentCore.ts` (~15 lines) | **Low** — existing EVM path untouched, new path for `network.startsWith("solana")` |
| 8 | Add reputation Solana path (~10 lines in reputation route) | **Low** — additive if/else |
| 9 | Start Solana event listener at boot (~3 lines) | **None** — guarded by `if (solanaConfig.programId)` |
| 10 | Client SDK: add `solanaEscrowScheme.ts` + modify `escrowFetch.ts` | **Low** — dynamic import, EVM path unchanged |
| 11 | Demo web: chain selector, Solana wallet, UI tweaks | **Low** — additive components, existing pages unchanged |

**Key safety principle**: Steps 1-4 add only new files. Steps 5-11 make small, additive modifications to existing files. The existing EVM flow is never altered — it continues to work exactly as before.

---

## Verification Plan

1. **Existing EVM tests pass**: Run `bun run test:contracts` (Foundry) — confirms Solidity contracts untouched
2. **Existing server starts**: Run `bun run dev` — confirms EVM scheme still registers, event listener starts
3. **Existing demo-web builds**: Run `cd demo-web && bun run build` — confirms no type errors from new imports
4. **Solana program tests**: Run `bun run test:solana` — covers all instructions, state transitions, fee math, access control
5. **Solana integration test**: Create order with `network: "solana-devnet"`, trigger 402 flow, verify Solana payment requirements returned
6. **End-to-end Solana**: Full escrow lifecycle on devnet (create → confirm delivery → release)
7. **Cross-chain demo**: Switch between EVM and Solana in demo-web, verify both chains work independently

---

## Files Summary

### New files (~15)
- `solana-programs/escrow/` — Entire Anchor project (~10 Rust files + config)
- `src/server/solana/config.ts`
- `src/server/solana/settler.ts`
- `src/server/solana/verifier.ts`
- `src/server/solana/eventListener.ts`
- `src/server/solana/statsReader.ts`
- `src/server/solana/types.ts`
- `src/server/solana/idl.json`
- `src/server/schemes/solana-escrow.ts`
- `src/client/solanaEscrowScheme.ts`
- `src/shared/solana-constants.ts`
- `demo-web/lib/wallet/SolanaWalletProvider.tsx`
- `demo-web/components/ui/ChainSelector.tsx`

### Modified files (~10, all additive changes)
- `src/server/index.ts` — +2 lines (import + register scheme)
- `demo-web/instrumentation.ts` — +2 lines (import + register scheme)
- `src/server/middleware/paymentCore.ts` — +15 lines (chain routing for 402 response)
- `src/server/routes/reputation.ts` — +10 lines (Solana stats reader delegation)
- `src/server/routes/orders.ts` — +5 lines (accept `network` field)
- `src/server/db/index.ts` — +1 line (add `network` column)
- `src/client/escrowFetch.ts` — +10 lines (dynamic Solana import)
- `src/client/index.ts` — +1 line (export)
- `demo-web/lib/wallet/WalletProvider.tsx` — +20 lines (chain state + Solana path)
- `demo-web/lib/api/payment-flow.ts` — +10 lines (Solana signing branch)
- `package.json` — +3 dependencies, +3 scripts
- `.env.example` — +4 lines

### Untouched (existing EVM infrastructure)
- `src/shared/types.ts` — NO changes
- `src/shared/constants.ts` — NO changes
- `src/shared/eip712.ts` — NO changes
- `src/shared/abi.ts` — NO changes
- `src/server/facilitator/settler.ts` — NO changes
- `src/server/facilitator/verifier.ts` — NO changes
- `src/server/services/eventListener.ts` — NO changes
- `src/server/config.ts` — NO changes
- `src/server/schemes/escrow.ts` — NO changes
- `contracts/` — NO changes
- All 59 files using viem types — NO changes

---

## Errata: Issues Found During Code Review

The following issues were identified by reviewing every touched file against the plan. Each must be addressed during implementation.

### E1 (Critical): `escrowFetch.ts` hardcodes `scheme === "escrow"`

**Problem**: `src/client/escrowFetch.ts` line 45 — `isEscrowPaymentRequired()` rejects anything where `o.scheme !== "escrow"`. Line 119 searches for `r.scheme === "escrow"`. Line 154 throws `UnsupportedSchemeError` if scheme isn't `"escrow"`. The proposed "~10 lines" change is insufficient.

**Fix**: Create a parallel `solanaEscrowFetch()` function in `src/client/solanaEscrowFetch.ts` with its own `isSolanaPaymentRequired()` validator and Solana wallet type. Export both from `index.ts`. Consumers choose which to call based on their chain context. The existing `escrowFetch` stays 100% unchanged — no risk to EVM flow.

### E2 (Critical): `Order.sellerAddress: Address` type mismatch

**Problem**: `Order` interface in `src/shared/types.ts` uses `sellerAddress: Address` where `Address = \`0x${string}\``. Solana base58 pubkeys can't satisfy this type. Same for `buyerAddress`, `CreateOrderRequest.sellerAddress`, etc.

**Fix**: The DB schema (`seller_address TEXT`) already stores plain strings. Don't change `types.ts`. Instead, when reading Solana orders from the DB, use `as unknown as Address` type assertions in the service layer. This is safe because the viem `Address` type is only used for type-checking, not runtime validation. The existing EVM code paths never encounter Solana addresses.

### E3 (Critical): `PaymentDeps` interface is EVM-typed

**Problem**: `src/server/middleware/types.ts:71` — `PaymentDeps` has `config.escrowVaultAddress: Address`, `config.usdcAddress: Address`, `OrderStatusUpdate.txHash: \`0x${string}\``, `OrderStatusUpdate.buyerAddress: Address`. None of these work for Solana.

**Fix**: For Solana orders, **bypass `paymentCore.ts` entirely**. Create a separate `src/server/middleware/solanaPaymentCore.ts` (or handle Solana settlement directly in the Solana scheme's `settle()` method — which already happens via `dispatch.ts`). The 402 response for Solana orders is built in `solanaEscrowScheme.buildRequirement()` and returned via the facilitator route. The demo-web Solana pay route wires `deps.settle` to the Solana chain adapter instead of the EVM one.

### E4 (Medium): `reputationService.ts` can't handle Solana addresses

**Problem**: `computeReputation()` takes `Address` (viem type) and calls EVM `readContract()`. Can't be called with Solana pubkeys.

**Fix**: Extract the pure scoring functions (`computeSellerScore`, `computeBuyerScore`, `computeVolumeBonus`, `getConfidence`) into `src/server/services/reputationScoring.ts`. Create `src/server/solana/reputationService.ts` that reads Stats PDAs and calls the same scoring functions. The reputation route dispatches: `address.startsWith("0x") ? computeReputation() : computeSolanaReputation()`.

### E5 (Medium): Escrow PDA race condition with sequential IDs

**Problem**: Using `next_escrow_id` as PDA seed — two concurrent clients reading the same ID would create a collision.

**Fix**: Use `order_id: [u8; 32]` as the PDA seed instead. Change seeds to:
- Escrow PDA: `[b"escrow", order_id.as_ref()]`
- Vault PDA: `[b"vault", order_id.as_ref()]`

The `order_id` is unique per order (it's a keccak256 hash) and known to the client before tx building. Keep `next_escrow_id` in config for informational purposes only.

### E6 (Medium): Route address validation rejects Solana addresses

**Problem**: `reputation.ts:18` and `orders.ts:83` both call `isAddress()` from viem, which rejects Solana base58 addresses.

**Fix**: Add Solana address detection before the viem check:
```typescript
const isSolanaAddress = (addr: string) =>
  !addr.startsWith("0x") && addr.length >= 32 && addr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(addr);
```
In `orders.ts`, branch validation based on `body.network`. In `reputation.ts`, accept either format.

### E7 (Medium): Blockhash expiry in partial-signing flow

**Problem**: Solana tx blockhash expires after ~60 seconds. Client→server→Solana latency may exceed this.

**Fix**: Use **durable nonces** (Solana's NonceAccount feature). The facilitator maintains a nonce account. The 402 response includes `nonceAccount` and `nonceAuthority` pubkeys. The client uses `SystemProgram.nonceAdvance()` instruction instead of a blockhash. Add `src/server/solana/nonce.ts` for nonce account management.

### E8 (Low): `events` table assumes EVM concepts

**Problem**: `block_number INTEGER` and `log_index INTEGER` with `UNIQUE(tx_hash, log_index)`. Solana has slots, not blocks, and no log_index concept.

**Fix**: Store Solana slot number in `block_number`, use `0` for `log_index`. The uniqueness constraint still works since Solana tx signatures are globally unique.

### E9 (Low): Import path error in scheme code

**Problem**: Plan shows `import from "./types.js"` in `src/server/schemes/solana-escrow.ts`, but types are at `src/server/solana/types.ts`.

**Fix**: Correct path: `"../solana/types.js"`.

### E10 (Low): demo-web `ChainAdapter` is EVM-typed

**Problem**: `demo-web/lib/chain/types.ts` has `ChainAdapter` with `settleEscrow(payload: EscrowPaymentPayload)`, `fundWallet(address: Address)` — all EVM types. The pay route calls `getChainAdapter().settleEscrow(payload)`.

**Fix**: Create `SolanaChainAdapter` implementing a new `SolanaChainAdapterInterface` in `demo-web/lib/chain/solana-adapter.ts`. Modify `getChainAdapter()` to accept an optional `network` parameter, or create a separate `getSolanaChainAdapter()` factory.

### E11 (Low): Account rent for vault ATAs

**Problem**: Each escrow creates a vault ATA (~0.002 SOL rent). Plan doesn't address who pays.

**Fix**: The facilitator (as tx fee payer) pays rent. Document that the facilitator Solana wallet needs sufficient SOL. Consider a shared vault ATA approach to reduce rent costs.

### E12 (Low): `String` in Anchor needs `max_len`

**Problem**: `service_type: String` in Escrow struct needs a max length for Anchor to compute account size.

**Fix**: Add `#[max_len(32)]` attribute on the `service_type` field.

### E13 (Low): `demo-web/lib/api/payment-flow.ts` is EVM-typed

**Problem**: Lines 6-35 define `PaymentRequired` and `PaymentPayload` with viem `Address`, `Hash` types. These local types mirror `EscrowPaymentRequired`/`EscrowPaymentPayload`.

**Fix**: Create a parallel `solana-payment-flow.ts` for the Solana path, or make the payment flow function accept a generic `signPayment` callback that can be either EVM or Solana.

---

### Revised modified files count (accounting for errata)

The errata adds ~5 new files and adjusts complexity of existing modifications:

**Additional new files**:
- `src/client/solanaEscrowFetch.ts` (E1 — parallel to escrowFetch.ts)
- `src/server/services/reputationScoring.ts` (E4 — extracted pure scoring functions)
- `src/server/solana/reputationService.ts` (E4 — Solana stats → scoring)
- `src/server/solana/nonce.ts` (E7 — durable nonce management)
- `demo-web/lib/chain/solana-adapter.ts` (E10 — Solana chain adapter)
- `demo-web/lib/api/solana-payment-flow.ts` (E13 — Solana payment flow)

**Adjusted modifications**:
- `src/server/routes/reputation.ts` — ~15 lines (was ~10; E6 adds address detection)
- `src/server/routes/orders.ts` — ~10 lines (was ~5; E7 adds address validation branching)
- `src/server/services/reputationService.ts` — Extract scoring functions to new file (E4; the existing file still works, just imports from the new file)
- `demo-web/app/api/orders/[id]/pay/route.ts` — ~10 lines (E3/E10; route Solana orders to Solana adapter)
