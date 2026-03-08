# Deployment Guide

The facilitator (Express + SQLite) deploys to **Fly.io**. The frontend (`web/`) deploys separately to **Vercel**. Both are already configured in the repo.

## What's already in the repo

| File | Purpose |
|------|---------|
| `fly.toml` | Fly.io app config (machine size, volume, health checks, env) |
| `Dockerfile` | Bun-based container for the facilitator |
| `.dockerignore` | Excludes `web/`, contract source, `.env` files from image |

The app defaults to **Base Sepolia** (chain ID 84532) with USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. No code changes are needed for chain selection.

---

## Smart Contract Deployment (UUPS Proxy)

EscrowVault and SessionEscrow use the **UUPS upgradeable proxy pattern** (ERC1967Proxy). This means each contract is deployed as two contracts: an **implementation** (the logic) and a **proxy** (the entry point that holds all state). Users and the facilitator interact only with the proxy address.

### Initial deployment

The deploy scripts (`Deploy.s.sol` for Base Sepolia, `DeployLocal.s.sol` for local Anvil) handle the full proxy deployment:

1. Deploy the implementation contract (constructor calls `_disableInitializers()` to prevent direct initialization).
2. Deploy an ERC1967Proxy pointing to the implementation, with `initialize()` calldata.
3. The `initialize()` function replaces the traditional constructor -- it sets USDC address, arbiter, fees, and owner.

```bash
# Deploy to Base Sepolia
bun run deploy

# Deploy to local Anvil
bun run deploy:local
```

The deploy script logs the **proxy address** -- this is the `ESCROW_VAULT_ADDRESS` you set in `.env`.

### Upgrading contracts

Use `Upgrade.s.sol` to upgrade an existing deployment to a new implementation:

```bash
# Upgrade EscrowVault on Base Sepolia
forge script script/Upgrade.s.sol \
  --fork-url $BASE_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast
```

**How it works:**
1. Deploys a new implementation contract.
2. Calls `upgradeTo(newImplementation)` on the existing proxy.
3. The proxy address stays the same -- all state (escrows, stats, configuration) is preserved.
4. No changes needed in `.env` or facilitator configuration.

**Safety checklist before upgrading:**
- Verify storage layout compatibility: never reorder, rename, or remove existing state variables.
- New state variables must be appended after existing ones, using slots from the `__gap` (reduce gap size accordingly).
- Test the upgrade on a fork first: `forge script script/Upgrade.s.sol --fork-url $BASE_SEPOLIA_RPC` (without `--broadcast`).
- The upgrade is owner-only (`_authorizeUpgrade` checks `onlyOwner`).
- After upgrading, verify the proxy still works: `curl https://api.xenga.xyz/health`.

### Storage layout

Both contracts include a storage gap for future-proofing:

```solidity
uint256[48] private __gap;
```

This reserves 48 storage slots. When adding new state variables in an upgrade, reduce the gap size by the number of slots consumed. For example, adding 2 new `uint256` variables means changing `__gap` from `[48]` to `[46]`.

---

## Deploying the Facilitator to Fly.io

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/): `curl -L https://fly.io/install.sh | sh`
- A Fly.io account: `fly auth login`
- An operator wallet with **ETH on Base Sepolia** for gas
- Your deployed **EscrowVault contract address**

### 1. Create the app (first time only)

```bash
fly launch --no-deploy
```

This registers the app with Fly.io using the existing `fly.toml`. The `--no-deploy` flag lets you set secrets and create the volume before the first deploy.

> If the app name `xenga-facilitator` is already taken, update the `app` field in `fly.toml` first.

### 2. Create the persistent volume (first time only)

```bash
fly volumes create xenga_data --region sjc --size 1
```

This creates a 1 GB volume for SQLite. The `fly.toml` mounts it at `/data`; the database file lives at `/data/xenga.db` and persists across deploys and restarts.

### 3. Set secrets

Secrets are never stored in code — set them via the CLI:

```bash
# Required
fly secrets set PRIVATE_KEY="0xYOUR_OPERATOR_PRIVATE_KEY"
fly secrets set ESCROW_VAULT_ADDRESS="0xYOUR_CONTRACT_ADDRESS"

# Optional
fly secrets set BASE_SEPOLIA_RPC="https://your-rpc-endpoint.com"
fly secrets set FEE_RECIPIENT="0xYOUR_FEE_ADDRESS"
fly secrets set API_KEYS="sk_live_abc123,sk_live_def456"
```

| Secret | Required | Description |
|--------|----------|-------------|
| `PRIVATE_KEY` | Yes | Operator wallet private key. Pays gas for all on-chain txs (`createEscrowWithAuth`, `confirmDelivery`, `resolveDispute`, `refund`). Must have ETH on Base Sepolia. |
| `ESCROW_VAULT_ADDRESS` | Yes | Your deployed EscrowVault contract address. No default. |
| `BASE_SEPOLIA_RPC` | No | RPC endpoint. Defaults to `https://sepolia.base.org` (public, rate-limited). Use Alchemy or Infura for production. |
| `FEE_RECIPIENT` | No | Address to receive facilitator fees. Required only if `FEE_BPS` or `FEE_FLAT_USDC` are set. |
| `API_KEYS` | No | Comma-separated API keys for authenticated order management endpoints. |

### 4. Deploy

```bash
fly deploy
```

This builds the Docker image, pushes it to Fly.io's registry, and starts the machine. The build installs production Bun dependencies, copies `src/` and `contracts/out/` (compiled ABIs), and runs `bun run start`.

### 5. Verify

```bash
fly status         # Machine status
fly logs           # Stream logs
curl https://api.xenga.xyz/health
```

The `/health` endpoint returns chain info, operator ETH balance, and server status. If operator ETH is low it will show `"degraded"`.

---

## Connecting the Frontend (Vercel)

Set this environment variable in your Vercel project for `web/`:

```
NEXT_PUBLIC_FACILITATOR_URL=https://api.xenga.xyz
```

Then tighten CORS in `fly.toml` (currently `*`) to your frontend domain:

```toml
[env]
  CORS_ORIGIN = "https://www.xenga.xyz"
```

Redeploy the facilitator after this change: `fly deploy`.

---

## What `fly.toml` configures

| Setting | Value | Reason |
|---------|-------|--------|
| `PORT` | 8080 | Internal container port |
| `DATABASE_PATH` | `/data/xenga.db` | SQLite on persistent volume |
| `auto_stop_machines` | off | Event listener and wallet monitor must run 24/7 |
| `min_machines_running` | 1 | Always one machine alive |
| Machine size | shared-cpu-1x, 512 MB | Sufficient for facilitator workload; upgrade to `performance-1x` for high traffic |
| Health check | `GET /health` every 30 s | Auto-restarts machine on failure |
| `force_https` | true | Redirects all HTTP to HTTPS |
| Volume mount | `xenga_data` → `/data` | SQLite database survives deploys |

---

## Common operations

```bash
fly logs                  # Stream live logs
fly status                # Machine and volume status
fly ssh console           # SSH into the running machine
fly secrets list          # List configured secrets (values hidden)
fly volumes list          # Check volume health
fly deploy                # Redeploy after code changes
```
