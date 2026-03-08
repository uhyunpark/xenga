# SIWE Authentication for Dashboard

**Date:** 2026-02-25
**Status:** Approved

## Problem

The dashboard requires a MetaMask signature on every API call (every tab click, every page load). The sign message is a cryptic string like `xenga-auth:/api/orders:1740528000`. Industry standard (OpenSea, Blur, etc.) is to sign once via SIWE (EIP-4361) and use a session token for subsequent requests.

## Design

### Sign-In Flow

1. User connects wallet (no signature — same as now)
2. User lands on dashboard → frontend requests nonce from `GET /api/auth/nonce`
3. Frontend builds SIWE message, prompts MetaMask **once**
4. Frontend sends signed message to `POST /api/auth/siwe` → server verifies, returns JWT (24h expiry)
5. JWT stored in `sessionStorage` under `xenga-session-{address}`
6. All subsequent dashboard requests use `Authorization: Bearer <token>`
7. No more MetaMask prompts until token expires or user disconnects

### SIWE Message (what user sees in MetaMask)

```
xenga.io wants you to sign in with your Ethereum account:
0x1234...abcd

Sign in to the Xenga Seller Dashboard.

URI: https://xenga.io
Version: 1
Chain ID: 84532
Nonce: k8jD3mXp
Issued At: 2026-02-25T12:34:56.000Z
Expiration Time: 2026-02-26T12:34:56.000Z
```

### JWT Payload

```json
{
  "sub": "0x1234...abcd",
  "iat": 1740528000,
  "exp": 1740614400,
  "chainId": 84532
}
```

### Why JWT in sessionStorage (not cookie)

Frontend (Vercel) and facilitator (Fly.io) are on different origins. Cookies would need `SameSite=None; Secure; HttpOnly` + explicit CORS `credentials: include`. JWT in sessionStorage is simpler, fits the existing header-based auth pattern, and clears on tab close.

## Server Changes

### New Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/auth/nonce` | GET | Returns random nonce (in-memory, 5-min TTL) |
| `POST /api/auth/siwe` | POST | Verifies `{ message, signature }`, returns `{ token }` |

### New Middleware: `sessionAuth()`

Replaces `walletAuth()` on dashboard routes. Reads `Authorization: Bearer <jwt>`, verifies signature, sets `req.walletAddress` from JWT claims.

### Nonce Storage

In-memory `Map<nonce, expiresAt>` — consumed on use, expired entries cleaned lazily. No DB needed (single instance, short-lived).

### New Env Var

`JWT_SECRET` — random string for HS256 signing. Required for production.

## Frontend Changes

### `WalletGate` Enhancement

Detects wallet connected but no session token → triggers SIWE sign-in flow automatically.

### `authenticatedFetch()` Rewrite

Reads JWT from `sessionStorage`, attaches `Authorization: Bearer <token>`. No `walletClient.signMessage()` call. On 401, clears token and triggers re-sign.

### Wallet Disconnect / Switch

Clear stored JWT when address changes. Next dashboard visit triggers fresh SIWE.

## Migration

- `walletAuth()` stays for one-off signed actions (disputes, arbiter routes)
- Dashboard routes switch to `sessionAuth()`
- `apiKeyOrWalletAuth()` becomes `apiKeyOrSessionAuth()`
- API keys unchanged
- On-chain write actions (confirm delivery, refund) unchanged — those are tx signatures
- Playground flows unaffected

## Dependencies

- `siwe` — official SIWE library (message creation + verification)
- `jose` — JWT signing/verification (or lightweight alternative)
