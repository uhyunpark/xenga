# SIWE Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-request wallet signing on dashboard routes with SIWE sign-once + JWT session.

**Architecture:** Frontend builds a SIWE message on dashboard entry, user signs once in MetaMask, server verifies and returns a JWT. All subsequent dashboard API calls use `Authorization: Bearer <token>`. Existing `walletAuth()` stays for one-off signed actions (disputes).

**Tech Stack:** `siwe` (message creation/verification), `jose` (JWT HS256 signing/verification), Express middleware, React context.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json` (root — server)
- Modify: `web/package.json` (frontend)

**Step 1: Install server dependencies**

```bash
cd /Users/uhyun/personal/x402-escrow && bun add siwe jose
```

**Step 2: Install frontend dependency**

```bash
cd /Users/uhyun/personal/x402-escrow/web && bun add siwe
```

**Step 3: Commit**

```bash
git add package.json bun.lockb web/package.json
git commit -m "chore: add siwe and jose dependencies for SIWE auth"
```

---

### Task 2: Add JWT_SECRET to Server Config

**Files:**
- Modify: `src/server/config.ts:26-42`

**Step 1: Add `jwtSecret` to the config object**

In `src/server/config.ts`, add to the config object (after `apiKeys`):

```typescript
jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
```

No validation needed — the fallback default works for dev. Production deploys set `JWT_SECRET` env var.

**Step 2: Commit**

```bash
git add src/server/config.ts
git commit -m "feat: add JWT_SECRET config for SIWE session auth"
```

---

### Task 3: Create Auth Routes (Nonce + SIWE Verify)

**Files:**
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/index.ts:108` (mount new router)

**Step 1: Create `src/server/routes/auth.ts`**

```typescript
import { Router } from "express";
import crypto from "crypto";
import { SiweMessage } from "siwe";
import { SignJWT } from "jose";
import { config } from "../config.js";

const router = Router();

// In-memory nonce store: nonce → expiresAt (unix ms)
const nonceStore = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Lazy cleanup of expired nonces (runs on each nonce request)
function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiresAt] of nonceStore) {
    if (expiresAt < now) nonceStore.delete(nonce);
  }
}

// GET /api/auth/nonce — generate a one-time nonce
router.get("/nonce", (_req, res) => {
  cleanExpiredNonces();
  const nonce = crypto.randomBytes(16).toString("base64url");
  nonceStore.set(nonce, Date.now() + NONCE_TTL_MS);
  res.json({ nonce });
});

// POST /api/auth/siwe — verify SIWE message + signature, return JWT
router.post("/siwe", async (req, res) => {
  const { message, signature } = req.body as { message: string; signature: string };

  if (!message || !signature) {
    return res.status(400).json({ error: "Missing message or signature" });
  }

  try {
    const siweMessage = new SiweMessage(message);

    // Verify the nonce exists and hasn't expired
    const nonceExpiry = nonceStore.get(siweMessage.nonce);
    if (!nonceExpiry || nonceExpiry < Date.now()) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }

    // Consume nonce (one-time use)
    nonceStore.delete(siweMessage.nonce);

    // Verify signature
    const result = await siweMessage.verify({ signature });
    if (!result.success) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Issue JWT (24h expiry)
    const secret = new TextEncoder().encode(config.jwtSecret);
    const token = await new SignJWT({
      sub: siweMessage.address.toLowerCase(),
      chainId: siweMessage.chainId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);

    res.json({ token });
  } catch (err) {
    return res.status(401).json({ error: "SIWE verification failed" });
  }
});

export default router;
```

**Step 2: Mount in `src/server/index.ts`**

Add import at the top with other route imports:

```typescript
import authRouter from "./routes/auth.js";
```

Add route mount after the existing routes (e.g. after the `app.use("/api/demo", ...)` line):

```typescript
app.use("/api/auth", generalLimiter, authRouter);
```

**Step 3: Verify server starts**

```bash
cd /Users/uhyun/personal/x402-escrow && bun run dev
```

Expected: Server starts without errors. Test with:
```bash
curl http://localhost:3000/api/auth/nonce
```
Expected: `{"nonce":"<random-string>"}`

**Step 4: Commit**

```bash
git add src/server/routes/auth.ts src/server/index.ts
git commit -m "feat: add SIWE auth endpoints (nonce + verify)"
```

---

### Task 4: Create `sessionAuth()` Middleware

**Files:**
- Modify: `src/server/middleware/auth.ts`

**Step 1: Add `sessionAuth()` and `apiKeyOrSessionAuth()` to `src/server/middleware/auth.ts`**

Add imports at the top:

```typescript
import { jwtVerify } from "jose";
import { config } from "../config.js";
```

Note: `config` is already imported. Just add `jwtVerify` from `jose`.

Add after the existing `walletAuth()` function (before the closing of the file):

```typescript
/**
 * Session-based authentication middleware (SIWE JWT).
 * Reads `Authorization: Bearer <jwt>`, verifies it, sets req.callerAddress.
 */
export function sessionAuth() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.slice(7);
    try {
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.sub) {
        return res.status(401).json({ error: "Invalid token: missing subject" });
      }

      req.callerAddress = payload.sub as Address;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }
  };
}

/**
 * Combined middleware: accepts either API key or session token.
 * Replaces apiKeyOrWalletAuth() for dashboard routes.
 */
export function apiKeyOrSessionAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.headers["x-api-key"]) {
      return apiKeyAuth()(req, res, next);
    }
    if (req.headers.authorization?.startsWith("Bearer ")) {
      return sessionAuth()(req, res, next);
    }
    if (config.apiKeys.length === 0) {
      return next(); // Open mode
    }
    res.status(401).json({ error: "Authentication required (API key or session token)" });
  };
}
```

**Step 2: Commit**

```bash
git add src/server/middleware/auth.ts
git commit -m "feat: add sessionAuth and apiKeyOrSessionAuth middleware"
```

---

### Task 5: Switch Dashboard Routes to Session Auth

**Files:**
- Modify: `src/server/routes/orders.ts:13,25-30`
- Modify: `src/server/routes/sellers.ts:3,29-31`
- Modify: `src/server/routes/sellerApiKeys.ts:2,9,30,59`

**Step 1: Update `src/server/routes/orders.ts`**

Change the import to include `sessionAuth`:

```typescript
import { apiKeyAuth, apiKeyOrSessionAuth, sessionAuth } from "../middleware/auth.js";
```

Remove `apiKeyOrWalletAuth` and `walletAuth` from the import.

Update the `GET /` route's seller-filter branch (lines 25-30). Replace:

```typescript
  if (sellerFilter && req.headers["x-wallet-address"]) {
    // Use walletAuth to verify identity, then check address match
    return walletAuth()(req as AuthenticatedRequest, res, next);
  }
```

With:

```typescript
  if (sellerFilter && req.headers.authorization?.startsWith("Bearer ")) {
    return sessionAuth()(req as AuthenticatedRequest, res, next);
  }
```

Update confirm-delivery route (line 120). Replace `apiKeyOrWalletAuth()` with `apiKeyOrSessionAuth()`:

```typescript
router.post("/:id/confirm-delivery", apiKeyOrSessionAuth(), async (req: AuthenticatedRequest, res) => {
```

**Step 2: Update `src/server/routes/sellers.ts`**

Change import:

```typescript
import { sessionAuth, type AuthenticatedRequest } from "../middleware/auth.js";
```

Replace `walletAuth()` on line 31 with `sessionAuth()`:

```typescript
router.post(
  "/",
  sessionAuth(),
  (req: AuthenticatedRequest, res) => {
```

**Step 3: Update `src/server/routes/sellerApiKeys.ts`**

Change import:

```typescript
import { sessionAuth, type AuthenticatedRequest } from "../middleware/auth.js";
```

Replace all three `walletAuth()` calls with `sessionAuth()`:

- Line 9: `router.post("/", sessionAuth(), ...`
- Line 30: `router.get("/", sessionAuth(), ...`
- Line 59: `router.delete("/:id", sessionAuth(), ...`

**Step 4: Verify server starts**

```bash
cd /Users/uhyun/personal/x402-escrow && bun run dev
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/server/routes/orders.ts src/server/routes/sellers.ts src/server/routes/sellerApiKeys.ts
git commit -m "feat: switch dashboard routes from walletAuth to sessionAuth"
```

---

### Task 6: Create Frontend Session Hook

**Files:**
- Create: `web/lib/auth/useSession.ts`

**Step 1: Create `web/lib/auth/useSession.ts`**

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import { SiweMessage } from "siwe";
import type { WalletClient, Address } from "viem";
import { facilitatorFetch } from "@/lib/api/client";

const SESSION_KEY_PREFIX = "xenga-session-";

function getSessionKey(address: Address): string {
  return `${SESSION_KEY_PREFIX}${address.toLowerCase()}`;
}

/**
 * Parse JWT payload without verification (just to check expiry client-side).
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function useSession(
  walletClient: WalletClient | null,
  address: Address | null
) {
  const [token, setToken] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing token from sessionStorage on mount / address change
  useEffect(() => {
    if (!address) {
      setToken(null);
      return;
    }
    const stored = sessionStorage.getItem(getSessionKey(address));
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
    } else {
      if (stored) sessionStorage.removeItem(getSessionKey(address));
      setToken(null);
    }
  }, [address]);

  const signIn = useCallback(async () => {
    if (!walletClient || !address) return;
    setSigning(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const nonceRes = await facilitatorFetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce } = await nonceRes.json();

      // 2. Build SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const siweMessage = new SiweMessage({
        domain,
        address,
        statement: "Sign in to the Xenga Seller Dashboard.",
        uri: origin,
        version: "1",
        chainId: 84532,
        nonce,
      });
      const messageStr = siweMessage.prepareMessage();

      // 3. Sign with wallet
      const signature = await walletClient.signMessage({
        account: address,
        message: messageStr,
      });

      // 4. Verify on server and get JWT
      const verifyRes = await facilitatorFetch("/api/auth/siwe", {
        method: "POST",
        body: JSON.stringify({ message: messageStr, signature }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error || "SIWE verification failed");
      }

      const { token: jwt } = await verifyRes.json();
      sessionStorage.setItem(getSessionKey(address), jwt);
      setToken(jwt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setToken(null);
    } finally {
      setSigning(false);
    }
  }, [walletClient, address]);

  const signOut = useCallback(() => {
    if (address) {
      sessionStorage.removeItem(getSessionKey(address));
    }
    setToken(null);
  }, [address]);

  return { token, signing, error, signIn, signOut };
}
```

**Step 2: Commit**

```bash
git add web/lib/auth/useSession.ts
git commit -m "feat: add useSession hook for SIWE sign-in flow"
```

---

### Task 7: Update `authenticatedFetch` to Use JWT

**Files:**
- Modify: `web/lib/api/wallet-auth.ts`

**Step 1: Rewrite `web/lib/api/wallet-auth.ts`**

Replace the entire file:

```typescript
import { facilitatorFetch } from "./client";

/**
 * Authenticated facilitator fetch — uses session JWT token.
 * Replaces per-request wallet signing with a Bearer token.
 */
export function authenticatedFetch(
  path: string,
  token: string,
  options?: RequestInit
): Promise<Response> {
  return facilitatorFetch(path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
```

Note: The function signature changes — it now takes `(path, token, options?)` instead of `(path, walletClient, address, options?)`. All callers will be updated in the next task.

**Step 2: Commit**

```bash
git add web/lib/api/wallet-auth.ts
git commit -m "feat: rewrite authenticatedFetch to use JWT bearer token"
```

---

### Task 8: Update WalletGate to Handle SIWE Sign-In

**Files:**
- Modify: `web/components/dashboard/WalletGate.tsx`

**Step 1: Rewrite `web/components/dashboard/WalletGate.tsx`**

Replace the entire file:

```typescript
"use client";

import { createContext, useContext } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { useSession } from "@/lib/auth/useSession";

// Context to share the session token with all dashboard children
const SessionContext = createContext<string | null>(null);

export function useSessionToken(): string {
  const token = useContext(SessionContext);
  if (!token) throw new Error("useSessionToken must be used within WalletGate");
  return token;
}

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, type, walletClient, connectBrowser } = useWallet();
  const { token, signing, error, signIn } = useSession(walletClient, address);

  // Not connected or demo wallet
  if (!address || type === "demo") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Connect Your Wallet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {type === "demo"
              ? "The dashboard requires a browser wallet (e.g. MetaMask). Demo wallets are not supported here."
              : "Connect a browser wallet to access the seller dashboard."}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={connectBrowser}
              className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-active hover:bg-bg-tertiary"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connected but no session — prompt SIWE sign-in
  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Sign In</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Sign a message to verify your identity. This does not cost gas.
          </p>
          {error && (
            <p className="mt-3 text-xs text-error">{error}</p>
          )}
          <div className="mt-6 flex justify-center">
            <button
              onClick={signIn}
              disabled={signing}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {signing ? "Waiting for signature..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — render dashboard with session context
  return (
    <SessionContext.Provider value={token}>
      {children}
    </SessionContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add web/components/dashboard/WalletGate.tsx
git commit -m "feat: update WalletGate with SIWE sign-in flow and session context"
```

---

### Task 9: Update All Dashboard Components to Use Session Token

**Files:**
- Modify: `web/app/dashboard/page.tsx` (Overview)
- Modify: `web/app/dashboard/orders/page.tsx`
- Modify: `web/components/dashboard/SellerProfile.tsx`
- Modify: `web/components/dashboard/ApiKeyManager.tsx`

All four follow the same pattern:
1. Remove `walletClient` from `useWallet()` destructure (where it was only used for auth)
2. Add `import { useSessionToken } from "@/components/dashboard/WalletGate"`
3. Call `const token = useSessionToken()`
4. Change `authenticatedFetch(path, walletClient, address, opts?)` → `authenticatedFetch(path, token, opts?)`

**Step 1: Update `web/app/dashboard/page.tsx`**

Change imports:

```typescript
import { authenticatedFetch } from "@/lib/api/wallet-auth";
```

Add:

```typescript
import { useSessionToken } from "@/components/dashboard/WalletGate";
```

Inside `DashboardOverview()`:

Replace:

```typescript
const { address, walletClient } = useWallet();
```

With:

```typescript
const { address } = useWallet();
const token = useSessionToken();
```

Replace `fetchData` callback:

```typescript
const fetchData = useCallback(async () => {
  if (!address) return;
  setLoading(true);
  try {
    const [ordersRes, repRes] = await Promise.all([
      authenticatedFetch(
        `/api/orders?seller=${address}&limit=50`,
        token
      ),
      facilitatorFetch(`/api/reputation/${address}`),
    ]);
    // ... rest unchanged
  } catch {
    // ...
  } finally {
    setLoading(false);
  }
}, [address, token]);
```

(Change the dependency array from `[address, walletClient]` to `[address, token]`)

**Step 2: Update `web/app/dashboard/orders/page.tsx`**

Change imports — add:

```typescript
import { useSessionToken } from "@/components/dashboard/WalletGate";
```

Inside `OrdersPage()`:

Replace:

```typescript
const { address, walletClient } = useWallet();
```

With:

```typescript
const { address } = useWallet();
const token = useSessionToken();
```

Replace `fetchOrders`:

```typescript
const fetchOrders = useCallback(async () => {
  if (!address) return;
  setLoading(true);
  try {
    const res = await authenticatedFetch(
      `/api/orders?seller=${address}&limit=100`,
      token
    );
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders || []);
    }
  } catch {
    // Handle silently
  } finally {
    setLoading(false);
  }
}, [address, token]);
```

**Step 3: Update `web/components/dashboard/SellerProfile.tsx`**

Add import:

```typescript
import { useSessionToken } from "@/components/dashboard/WalletGate";
```

Inside `SellerProfile()`:

Replace:

```typescript
const { address, walletClient } = useWallet();
```

With:

```typescript
const { address } = useWallet();
const token = useSessionToken();
```

Update `handleSave`:

```typescript
const handleSave = async () => {
  if (!address) return;
  // ...
  const res = await authenticatedFetch("/api/sellers", token, {
    method: "POST",
    body: JSON.stringify({ name: name.trim() || undefined }),
  });
  // ... rest unchanged
};
```

Remove the `if (!address || !walletClient) return;` guard — replace with `if (!address) return;`.

**Step 4: Update `web/components/dashboard/ApiKeyManager.tsx`**

Add import:

```typescript
import { useSessionToken } from "@/components/dashboard/WalletGate";
```

Inside `ApiKeyManager()`:

Replace:

```typescript
const { address, walletClient } = useWallet();
```

With:

```typescript
const { address } = useWallet();
const token = useSessionToken();
```

Update all `authenticatedFetch` calls — there are 4 total:

1. `fetchKeys`: `authenticatedFetch("/api/seller-api-keys", token)`
2. `handleCreate`: `authenticatedFetch("/api/seller-api-keys", token, { method: "POST", ... })`
3. `handleRevoke`: `authenticatedFetch(\`/api/seller-api-keys/${keyId}\`, token, { method: "DELETE" })`
4. `fetchKeys` dependency: change `[address, walletClient]` → `[address, token]`

Replace all `if (!address || !walletClient) return;` guards with `if (!address) return;`.

**Step 5: Verify frontend builds**

```bash
cd /Users/uhyun/personal/x402-escrow/web && bun run build
```

Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add web/app/dashboard/page.tsx web/app/dashboard/orders/page.tsx web/components/dashboard/SellerProfile.tsx web/components/dashboard/ApiKeyManager.tsx
git commit -m "feat: update all dashboard components to use session token"
```

---

### Task 10: Manual E2E Verification

**Step 1: Start both servers**

Terminal 1:
```bash
cd /Users/uhyun/personal/x402-escrow && bun run dev
```

Terminal 2:
```bash
cd /Users/uhyun/personal/x402-escrow/web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev
```

**Step 2: Test the full flow**

1. Open `http://localhost:3001/dashboard`
2. Click "Connect Wallet" → MetaMask connect prompt (no signature)
3. See "Sign In" screen → click "Sign In" → MetaMask shows SIWE message with "Sign in to the Xenga Seller Dashboard."
4. After signing → dashboard loads, shows overview
5. Click "Orders" tab → loads immediately, **no MetaMask prompt**
6. Click "API Keys" tab → loads immediately, **no MetaMask prompt**
7. Click back to "Overview" → loads immediately, **no MetaMask prompt**
8. Close tab, reopen → requires fresh sign-in (sessionStorage cleared)

**Step 3: Test token expiry**

1. Manually delete `xenga-session-<address>` from sessionStorage in browser devtools
2. Click any tab → should show "Sign In" screen again

**Step 4: Test API key auth still works**

```bash
curl -H "X-API-KEY: your-key" http://localhost:3000/api/orders
```

Expected: Works as before (unchanged path).

---

### Task 11: Clean Up Old Auth Code

**Files:**
- Modify: `web/lib/api/wallet-auth.ts` (already done in Task 7)
- Modify: `src/server/middleware/auth.ts` — remove `apiKeyOrWalletAuth` (now unused by dashboard routes)

**Step 1: Remove `apiKeyOrWalletAuth` from auth.ts**

Delete the `apiKeyOrWalletAuth()` function from `src/server/middleware/auth.ts`. Check no other files import it:

```bash
grep -r "apiKeyOrWalletAuth" src/ web/
```

If only the old import in `orders.ts` referenced it (already removed in Task 5), delete the function.

**Step 2: Commit**

```bash
git add src/server/middleware/auth.ts
git commit -m "chore: remove unused apiKeyOrWalletAuth middleware"
```
