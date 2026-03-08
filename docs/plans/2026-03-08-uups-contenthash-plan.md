# Plan: UUPS Upgradeability + ContentHash for EscrowVault

## Context

The EscrowVault contract is non-upgradeable and stores no transaction context. As the protocol evolves (especially dispute resolution), we need:
1. **Upgradeability** — ability to fix bugs and iterate on logic without migrating locked funds
2. **ContentHash** — on-chain tamper-proof evidence of what was promised/requested, for fair dispute resolution

Hash is one-way (not decryptable). Full metadata lives in our DB; the on-chain hash is proof it wasn't altered.

### ContentHash Data Model

**How metadata is assembled** — auto-captured from existing data, no extra seller burden:

```json
{
  "version": 1,
  "order": {
    "title": "Weather Forecast API",
    "description": "Returns 30-day JSON forecast data",
    "price": "5000000",
    "serviceType": "agent-service",
    "terms": "JSON response, < 5s SLA"
  },
  "request": {
    "method": "GET",
    "url": "/api/weather?location=Seoul",
    "contentType": "application/json"
  },
  "seller": "0xabc...",
  "buyer": "0xdef...",
  "timestamp": 1709856000
}
```

- `order.*` — from existing order fields (title, description, price, serviceType)
- `order.terms` — **new optional text field** on order creation. Free text. Agents can put structured JSON; human sellers can write plain text or leave blank.
- `request.*` — auto-captured by middleware from the buyer's HTTP request
- `seller`, `buyer`, `timestamp` — auto-captured

The `terms` field is added to `POST /api/orders` (optional) and the payment link creation form (optional textarea). No schema enforcement — structure comes later based on real dispute patterns.

---

## Phase 1: Contract Layer

### 1.1 Install OZ Upgradeable Contracts
```bash
cd contracts && forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.5.0 --no-commit
```
Add to `contracts/remappings.txt`:
```
@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
```

### 1.2 Modify `contracts/src/EscrowVault.sol`

**UUPS changes:**
- Replace `Ownable2Step, Ownable` → `Ownable2StepUpgradeable`
- Replace `Pausable` → `PausableUpgradeable`
- Add `UUPSUpgradeable`
- Change `IERC20 public immutable usdc` → `IERC20 public usdc` (set in initializer)
- Replace `constructor(...)` with `initialize(...)` using `initializer` modifier
- Add disabled constructor: `constructor() { _disableInitializers(); }`
- Add `_authorizeUpgrade(address) internal override onlyOwner {}`
- Add `uint256[48] private __gap;` at end for future storage safety

**ContentHash changes:**
- Add `bytes32 contentHash` to `Escrow` struct (last field)
- Add `bytes32 contentHash` param to `createEscrowWithAuth()`, `createEscrow()`, `_createEscrow()`
- Add `contentHash` to `EscrowCreated` event
- `contentHash` can be `bytes32(0)` (optional — not all escrows need metadata)

### 1.3 Modify `contracts/src/SessionEscrow.sol`
Same UUPS pattern (no contentHash — sessions are micropayments).

### 1.4 Update Deployment Scripts

**`contracts/script/Deploy.s.sol`** — deploy implementation + ERC1967Proxy + call initialize()
**`contracts/script/DeployLocal.s.sol`** — same pattern
**New `contracts/script/Upgrade.s.sol`** — deploy new impl + upgradeToAndCall()

### 1.5 Update Tests

**`contracts/test/EscrowVault.t.sol`:**
- `setUp()`: deploy via ERC1967Proxy instead of `new EscrowVault(...)`
- All `createEscrow`/`createEscrowWithAuth` calls: add `contentHash` param
- New tests: `test_upgradeByOwner`, `test_upgradeNotOwner_reverts`, `test_storagePreservedAfterUpgrade`, `test_initializeCannotBeCalledTwice`, `test_contentHashStoredAndEmitted`, `test_contentHashCanBeZero`

**`contracts/test/SessionEscrow.t.sol`:** proxy-based setUp()

### 1.6 Build & Verify
```bash
bun run build:contracts && bun run test:contracts
```

---

## Phase 2: Shared Layer

### 2.1 ABI Sync
```bash
bun run build:contracts && bun run sync-abi
```

### 2.2 Update `src/shared/types.ts`
- Add `contentHash: Hash` to `OnChainEscrow`
- Add `contentMetadata?: string` and `contentHash?: Hash` to `Order` type

---

## Phase 3: Server Layer

### 3.1 DB Schema — `src/server/db/schema.ts`
Add `content_metadata TEXT` and `content_hash TEXT` columns to orders table.
Add migration logic (ALTER TABLE for existing DBs).

### 3.2 Order Routes — `src/server/routes/orders.ts`
Add optional `terms` field to `POST /api/orders`. Stored as `terms TEXT` column in orders table.

### 3.3 Content Hash Assembly — `src/server/middleware/paymentCore.ts`
At settlement time, auto-assemble canonical metadata JSON:
- `order.*` from DB (title, description, price, serviceType, terms)
- `request.*` from the buyer's original HTTP request (method, url, content-type)
- `seller`, `buyer`, `timestamp` from payment context

Compute `keccak256(canonicalJson)` (sorted keys, no whitespace) → pass as `contentHash` to settler.

### 3.4 Payment Links — `src/server/routes/paymentLinks.ts`
Add optional `terms` textarea to payment link creation.

### 3.5 Settlement — `src/server/facilitator/settler.ts`
Add `contentHash` parameter to `settleEscrow()`, pass to `createEscrowWithAuth` args.

### 3.6 Order Service — `src/server/services/orderService.ts`
- `toOrder()`: map new columns
- `computeContentHash()`: deterministic JSON → keccak256
- Store `content_metadata` and `content_hash` after settlement

### 3.7 Escrow Service — `src/server/services/escrowService.ts`
Add `contentHash` field to `getEscrow()` response mapping.

---

## Phase 4: Client SDK (minimal)
No functional changes. Types updated in Phase 2 flow through automatically.

---

## Phase 5: Documentation

### 5.1 `CLAUDE.md` (project root)
- Add contentHash to Escrow struct documentation
- Document UUPS proxy pattern in Architecture section
- Add `initialize()` to deployment notes
- Update "Post-Deployment Configuration" table with upgrade procedure
- Add contentHash to Escrow Lifecycle description

### 5.2 `docs/api-reference.md`
- Add `contentHash` to `GET /api/escrows/:escrowId` response schema
- Add `terms` field to `POST /api/orders` request schema
- Add `terms` to payment link creation endpoint
- Document content metadata retrieval for disputes

### 5.3 `docs/sdk-reference.md`
- Add `contentHash` to `OnChainEscrow` type definition
- Update `getEscrow()` and `watchEscrow()` examples to show contentHash

### 5.4 `docs/seller-guide.md`
- Add section on "Transaction Evidence" explaining:
  - What contentHash is and why it matters
  - How terms/metadata become tamper-proof on-chain evidence
  - How to provide good terms for dispute protection
  - That existing title + description are auto-captured

### 5.5 `docs/agent-guide.md`
- Add `terms` field to order creation examples
- Show how agents can include structured terms (JSON in text field)
- Explain contentHash in x402 payment flow

### 5.6 `docs/quickstart.md`
- Update escrow creation examples with contentHash
- Brief mention of dispute evidence

### 5.7 `docs/deployment.md`
- Document UUPS proxy deployment (implementation + ERC1967Proxy + initialize)
- Document upgrade procedure (deploy new impl + upgradeToAndCall)
- Add safety notes (timelock, multisig for production)

---

## Phase 6: Protocol Inspector & Dashboard UI

### 6.1 Protocol Inspector — `web/components/protocol-inspector/OnChainTab.tsx`
- Display `contentHash` in escrow creation transaction details
- Show it as a labeled hex field with copy button

### 6.2 Protocol Inspector — `web/components/protocol-inspector/StateMachineTab.tsx`
- Add contentHash as a detail field in the escrow info panel (if escrow details are shown)

### 6.3 Dashboard Orders — `web/app/dashboard/orders/page.tsx`
- Show `contentHash` in expanded order details
- Add "View Evidence" button that shows the full content metadata JSON
- Make it clear this is on-chain verifiable (link to block explorer for the hash)

### 6.4 Dashboard Payment Links — `web/app/dashboard/payment-links/page.tsx`
- Add optional "Terms" textarea to payment link creation form

### 6.5 Escrow Details Route — `src/server/routes/escrows.ts`
- Add `contentHash` and `contentMetadata` to `GET /api/escrows/:escrowId` response

### 6.6 Dispute Route — `src/server/routes/disputes.ts`
- Include `contentMetadata` in dispute filing context (auto-attached from order)
- Arbiter resolution endpoint receives content metadata for review

---

## Phase 7: Demo Updates

### 7.1 Marketplace Demo — `web/components/marketplace/PaymentFlow.tsx`
- After escrow creation, show contentHash in the success state
- In the Protocol Inspector (already integrated), contentHash will appear in on-chain tab automatically via ABI changes

### 7.2 Agent Demo — `web/components/agent/AgentTerminal.tsx`
- Add a terminal line showing contentHash after escrow creation
- e.g., `"Evidence hash: 0xabc123... (on-chain, tamper-proof)"`

### 7.3 Marketplace ReviewTermsStep — `web/components/marketplace/ReviewTermsStep.tsx`
- Show a note that the order details will be hashed on-chain as dispute evidence
- Optional: show the metadata that will be hashed (title, description, terms)

### 7.4 Demo Data — update any hardcoded demo order data to include `terms` field

---

## Critical Files

| File | Changes |
|------|---------|
| **Contract** | |
| `contracts/src/EscrowVault.sol` | UUPS + initialize() + contentHash in struct/params/event |
| `contracts/src/SessionEscrow.sol` | UUPS + initialize() |
| `contracts/test/EscrowVault.t.sol` | Proxy setUp, contentHash params, new upgrade tests |
| `contracts/test/SessionEscrow.t.sol` | Proxy setUp |
| `contracts/script/Deploy.s.sol` | Proxy deployment pattern |
| `contracts/script/DeployLocal.s.sol` | Proxy deployment pattern |
| **Shared + Server** | |
| `src/shared/types.ts` | OnChainEscrow.contentHash, Order.contentMetadata |
| `src/server/db/schema.ts` | content_metadata, content_hash, terms columns |
| `src/server/facilitator/settler.ts` | Pass contentHash to contract call |
| `src/server/middleware/paymentCore.ts` | Assemble metadata, compute hash |
| `src/server/services/orderService.ts` | toOrder, computeContentHash |
| `src/server/services/escrowService.ts` | Map contentHash from on-chain data |
| `src/server/routes/orders.ts` | Accept `terms` field |
| `src/server/routes/escrows.ts` | Return contentHash + contentMetadata |
| `src/server/routes/disputes.ts` | Attach contentMetadata to dispute context |
| `src/server/routes/paymentLinks.ts` | Accept `terms` field |
| **Documentation** | |
| `CLAUDE.md` | UUPS architecture, contentHash in escrow lifecycle |
| `docs/api-reference.md` | contentHash in responses, terms in requests |
| `docs/sdk-reference.md` | OnChainEscrow.contentHash, updated examples |
| `docs/seller-guide.md` | Transaction evidence section |
| `docs/agent-guide.md` | Terms field, contentHash in x402 flow |
| `docs/quickstart.md` | Updated escrow examples |
| `docs/deployment.md` | UUPS proxy deployment + upgrade procedure |
| **Web / Demo** | |
| `web/components/protocol-inspector/OnChainTab.tsx` | Display contentHash |
| `web/components/marketplace/PaymentFlow.tsx` | Show contentHash post-escrow |
| `web/components/marketplace/ReviewTermsStep.tsx` | Evidence note |
| `web/components/agent/AgentTerminal.tsx` | Show contentHash in terminal |
| `web/app/dashboard/orders/page.tsx` | ContentHash + "View Evidence" |
| `web/app/dashboard/payment-links/page.tsx` | Terms textarea |

---

## Execution Strategy: Parallel Agents

### Dependency Graph

```
Phase A: Contracts + Shared (sequential, must be first)
  │  Team Lead does: contracts → build → ABI sync → shared types
  │
  ├──→ Agent 1: "server"     — Phase 3 (DB, routes, middleware, settler, services)
  │                             + Phase 6.5-6.6 (server-side escrow/dispute routes)
  │
  ├──→ Agent 2: "docs"       — Phase 5 (all 7 doc files)
  │                             Independent: works from plan spec, no code deps
  │
  └──→ Agent 3: "frontend"   — Phase 6.1-6.4 (inspector, dashboard UI)
                                + Phase 7 (marketplace/agent demo updates)
                                Uses shared types, doesn't need server running

Phase C: Review + Verification (sequential, after all agents complete)
  Team Lead: forge test, bun run build, end-to-end check
```

### Why This Works

- **Server** and **Frontend** touch completely different directories (`src/server/` vs `web/`)
- **Docs** is independent — writes from the plan spec, no code dependencies
- **Frontend** only needs shared types (from Phase A), not server running — it calls `facilitatorFetch()` at runtime, not build time
- All 3 agents can run in isolated worktrees to avoid conflicts

### Agent Assignments

| Agent | Files | Isolation |
|-------|-------|-----------|
| **server** | `src/server/{db,routes,middleware,facilitator,services}/*` | worktree |
| **docs** | `CLAUDE.md`, `docs/*.md` | worktree |
| **frontend** | `web/{components,app}/*` | worktree |
| **lead** | `contracts/*`, `src/shared/*`, final review | main |

---

## Migration Notes

- This is a **new deployment** (new proxy address), not an upgrade of the existing contract
- Existing Base Sepolia escrows complete their lifecycle on the old contract
- Update `ESCROW_VAULT_ADDRESS` env var to the new proxy address
- SQLite columns added as nullable — existing orders unaffected
- Event listener may need to temporarily watch both old and new contract addresses

---

## Verification

1. `cd contracts && forge test` — all existing + new tests pass
2. `bun run build:contracts && bun run sync-abi` — ABI regenerated
3. `bun run dev` — server starts, can create orders
4. `cd web && bun run build` — frontend builds without errors
5. Test payment flow end-to-end: hit 402 endpoint → sign → submit → verify contentHash stored on-chain matches DB metadata hash
6. Protocol Inspector: contentHash visible in OnChain tab after escrow creation
7. Dashboard: expanded order shows contentHash + "View Evidence" with full metadata JSON
8. Marketplace demo: contentHash shown after escrow step
9. Agent demo: contentHash line appears in terminal output
10. Deploy to testnet: `forge script Deploy.s.sol --broadcast` → verify proxy works
11. Test upgrade: deploy V2 impl → call upgradeToAndCall → verify storage preserved
12. Review all doc files for accuracy and consistency
