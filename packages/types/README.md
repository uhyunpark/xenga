# @x402/types

Shared types, constants, ABIs, and utilities for the x402 escrow payment protocol.

## Install

```bash
npm install @x402/types
```

## What's included

- **Types** — `Order`, `OnChainEscrow`, `EscrowState`, `ReputationScore`, `EscrowPaymentRequired`, `EscrowPaymentPayload`, `EscrowPaymentResponse`, `Stats`, etc.
- **Constants** — Chain configs (Base Sepolia/Mainnet), USDC addresses, service type windows, reputation thresholds
- **EIP-712** — `buildReceiveAuthSigningParams()` for ERC-3009 gasless USDC authorizations
- **ABIs** — Auto-generated EscrowVault ABI (via `@x402/types/abi`)
- **Errors** — `X402Error`, `NetworkError`, `InvalidPaymentHeaderError`, `SettlementError`, etc.
- **Retry** — `withRetry()` exponential backoff helper, `isRetryableError()` predicate

## Usage

```ts
import {
  type Order,
  type OnChainEscrow,
  EscrowState,
  getChainConfig,
  buildReceiveAuthSigningParams,
  NetworkError,
  withRetry,
} from "@x402/types";

import { escrowVaultAbi } from "@x402/types/abi";
```

## Peer dependencies

- `viem` ^2.21.0
