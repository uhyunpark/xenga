# Seller Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-service seller dashboard at `/dashboard` with sidebar navigation, wallet-based auth, order management with on-chain actions, seller profile registration, and API key self-service.

**Architecture:** New Next.js route group (`web/app/dashboard/`) with a sidebar layout and wallet gate. Backend adds `seller_api_keys` table, walletAuth on seller-relevant routes, and API key CRUD endpoints. On-chain actions (confirm delivery, refund) signed directly by the seller's browser wallet.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS, viem (wallet signing + contract writes), Express, bun:sqlite

**Design doc:** `docs/plans/2026-02-25-seller-dashboard-design.md`

---

### Task 1: Backend — Add `seller_api_keys` table

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add the table creation SQL**

In `src/server/db/schema.ts`, add after the `sellers` table creation:

```sql
CREATE TABLE IF NOT EXISTS seller_api_keys (
  id TEXT PRIMARY KEY,
  seller_address TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_seller_api_keys_address ON seller_api_keys(seller_address);
```

**Step 2: Verify server starts**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run src/server/index.ts`
Expected: Server starts without errors, table is created.

**Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(db): add seller_api_keys table for self-service API key management"
```

---

### Task 2: Backend — Seller API key CRUD endpoints

**Files:**
- Create: `src/server/routes/sellerApiKeys.ts`
- Modify: `src/server/index.ts` (mount routes)

**Step 1: Create the route file**

Create `src/server/routes/sellerApiKeys.ts`:

```typescript
import { Router } from "express";
import crypto from "crypto";
import { walletAuth } from "../middleware/auth.js";
import { getDb } from "../db/schema.js";

const router = Router();

// Generate a new API key
router.post("/", walletAuth(), (req, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;
  const name = req.body?.name || null;

  // Generate a random API key: "xng_" + 32 random hex chars
  const rawKey = `xng_${crypto.randomBytes(16).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12); // "xng_" + 8 chars
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.run(
    `INSERT INTO seller_api_keys (id, seller_address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sellerAddress, keyHash, keyPrefix, name, now]
  );

  res.json({ id, key: rawKey, keyPrefix, name, createdAt: now });
});

// List API keys for the connected wallet
router.get("/", walletAuth(), (req, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;

  const keys = db
    .query(
      `SELECT id, key_prefix, name, created_at, last_used_at, revoked_at FROM seller_api_keys WHERE seller_address = ? AND revoked_at IS NULL ORDER BY created_at DESC`
    )
    .all(sellerAddress) as Array<{
    id: string;
    key_prefix: string;
    name: string | null;
    created_at: number;
    last_used_at: number | null;
    revoked_at: number | null;
  }>;

  res.json({
    keys: keys.map((k) => ({
      id: k.id,
      keyPrefix: k.key_prefix,
      name: k.name,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })),
  });
});

// Revoke an API key
router.delete("/:id", walletAuth(), (req, res) => {
  const db = getDb();
  const sellerAddress = req.callerAddress!;
  const keyId = req.params.id as string;
  const now = Math.floor(Date.now() / 1000);

  const result = db.run(
    `UPDATE seller_api_keys SET revoked_at = ? WHERE id = ? AND seller_address = ? AND revoked_at IS NULL`,
    [now, keyId, sellerAddress]
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: "API key not found or already revoked" });
  }

  res.json({ success: true });
});

export default router;
```

**Step 2: Mount routes in `src/server/index.ts`**

Find where other routes are mounted (look for `app.use("/api/sellers"`) and add:

```typescript
import sellerApiKeysRouter from "./routes/sellerApiKeys.js";
// ...
app.use("/api/seller-api-keys", sellerApiKeysRouter);
```

**Step 3: Verify server starts and routes are registered**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run src/server/index.ts`
Expected: Server starts, routes mounted.

**Step 4: Commit**

```bash
git add src/server/routes/sellerApiKeys.ts src/server/index.ts
git commit -m "feat(api): add seller API key CRUD endpoints with walletAuth"
```

---

### Task 3: Backend — Add walletAuth to seller order routes

**Files:**
- Modify: `src/server/routes/orders.ts`
- Modify: `src/server/middleware/auth.ts`

**Step 1: Add `apiKeyOrWalletAuth` middleware**

In `src/server/middleware/auth.ts`, add a new combined middleware that accepts either API key or wallet auth:

```typescript
export function apiKeyOrWalletAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    // If API key is present, use apiKeyAuth
    if (req.headers["x-api-key"]) {
      return apiKeyAuth()(req, res, next);
    }
    // If wallet headers are present, use walletAuth
    if (req.headers["x-wallet-address"]) {
      return walletAuth()(req, res, next);
    }
    // No auth provided
    if (config.apiKeys.length === 0) {
      return next(); // Open mode (no API keys configured)
    }
    res.status(401).json({ error: "Authentication required (API key or wallet signature)" });
  };
}
```

**Step 2: Protect `GET /api/orders?seller=` with wallet verification**

In `src/server/routes/orders.ts`, modify the GET handler. When `?seller=` is present:
- If wallet auth headers are present, verify the signer matches the `seller` param
- If no auth, allow in open mode only (backward compat for demos)

Change the GET route's auth logic:

```typescript
// Before: apiKeyAuth() unless ?seller= present (then no auth)
// After: if ?seller= present, prefer walletAuth to verify identity; allow open mode as fallback
router.get("/", async (req, res) => {
  const sellerFilter = req.query.seller as string | undefined;

  // If wallet headers present and seller filter, verify identity
  if (sellerFilter && req.headers["x-wallet-address"]) {
    const walletAddress = (req.headers["x-wallet-address"] as string).toLowerCase();
    if (walletAddress !== sellerFilter.toLowerCase()) {
      return res.status(403).json({ error: "Wallet address does not match seller filter" });
    }
  }

  // ... rest of existing handler
});
```

**Step 3: Change confirm-delivery to use `apiKeyOrWalletAuth`**

In `src/server/routes/orders.ts`, change the confirm-delivery route from `apiKeyAuth()` to `apiKeyOrWalletAuth()`. Also add seller verification: the wallet signer must be the order's seller.

```typescript
router.post("/:id/confirm-delivery", apiKeyOrWalletAuth(), async (req, res) => {
  // ... existing order lookup ...

  // If wallet auth was used, verify signer is the seller
  if (req.callerAddress && req.callerAddress.toLowerCase() !== order.sellerAddress.toLowerCase()) {
    return res.status(403).json({ error: "Only the seller can confirm delivery" });
  }

  // ... rest of existing handler
});
```

**Step 4: Add `facilitatorFee` to order API responses**

In the order serialization in `src/server/routes/orders.ts`, add `facilitatorFee` from the on-chain escrow data. For the list endpoint, this requires fetching escrow data per order (expensive), so instead add it only to the single-order GET endpoint and store it in the DB.

Actually, simpler: the `orders` table already stores `escrow_id`. Add a `facilitator_fee` column to the orders table (Task 1 addendum), or compute it from the fee config. For v1, compute it client-side from the known fee config exposed via `/api/health`.

**Step 5: Verify server starts**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run src/server/index.ts`

**Step 6: Commit**

```bash
git add src/server/routes/orders.ts src/server/middleware/auth.ts
git commit -m "feat(auth): add apiKeyOrWalletAuth, protect seller order routes"
```

---

### Task 4: Frontend — Wallet auth helper hook

**Files:**
- Create: `web/lib/api/wallet-auth.ts`

**Step 1: Create the wallet auth helper**

This hook generates walletAuth headers for facilitator API calls. Matching the server's `walletAuth` middleware expectations.

Create `web/lib/api/wallet-auth.ts`:

```typescript
import type { WalletClient, Address } from "viem";
import { facilitatorFetch } from "./client";

/**
 * Build wallet auth headers for the facilitator API.
 * Server expects: X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP
 * Message format: "xenga-auth:{routeId}:{timestamp}"
 */
export async function buildWalletAuthHeaders(
  walletClient: WalletClient,
  address: Address,
  routeId: string
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `xenga-auth:${routeId}:${timestamp}`;

  const signature = await walletClient.signMessage({
    account: address,
    message,
  });

  return {
    "X-WALLET-ADDRESS": address,
    "X-WALLET-SIGNATURE": signature,
    "X-WALLET-TIMESTAMP": timestamp,
  };
}

/**
 * Authenticated facilitator fetch — adds wallet auth headers automatically.
 */
export async function authenticatedFetch(
  path: string,
  walletClient: WalletClient,
  address: Address,
  options?: RequestInit
): Promise<Response> {
  // Use the path as routeId (server uses req.path as fallback)
  const routeId = path.split("?")[0]; // strip query params
  const authHeaders = await buildWalletAuthHeaders(walletClient, address, routeId);

  return facilitatorFetch(path, {
    ...options,
    headers: {
      ...options?.headers,
      ...authHeaders,
    },
  });
}
```

**Step 2: Commit**

```bash
git add web/lib/api/wallet-auth.ts
git commit -m "feat(web): add wallet auth helper for authenticated API calls"
```

---

### Task 5: Frontend — Dashboard layout with sidebar and wallet gate

**Files:**
- Create: `web/app/dashboard/layout.tsx`
- Create: `web/components/dashboard/DashboardSidebar.tsx`
- Create: `web/components/dashboard/WalletGate.tsx`

**Step 1: Create `WalletGate.tsx`**

Create `web/components/dashboard/WalletGate.tsx`:

```tsx
"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";
import { WalletSelector } from "@/components/ui/WalletSelector";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();

  if (!address) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="panel-surface mx-auto max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold">Connect Your Wallet</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Connect a wallet to access the seller dashboard.
          </p>
          <div className="mt-6 flex justify-center">
            <WalletSelector />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

**Step 2: Create `DashboardSidebar.tsx`**

Create `web/components/dashboard/DashboardSidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "home" },
  { href: "/dashboard/orders", label: "Orders", icon: "orders" },
];

const SETTINGS_ITEMS = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/api-keys", label: "API Keys", icon: "key" },
];

const COMING_SOON = [
  { label: "Payment Links", icon: "link" },
  { label: "Webhooks", icon: "webhook" },
];

const ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6.5L8 2l6 4.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  orders: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3h10v10H3V3zm0 3.5h10M6 3v10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" /><path d="M8 1v2m0 10v2m-5-7H1m14 0h-2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41" strokeLinecap="round" />
    </svg>
  ),
  key: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5.5" cy="10.5" r="3" /><path d="M8 8l5-5m0 0v3m0-3h-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  link: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 9.5l3-3M5 11a2.5 2.5 0 010-3.54l1-1M11 5a2.5 2.5 0 010 3.54l-1 1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  webhook: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-4">
        <Link href="/" className="font-semibold text-accent transition-colors hover:text-accent/80">
          Xenga
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.href} href={item.href} active={isActive(item.href)} icon={item.icon} onClick={() => setMobileOpen(false)}>
            {item.label}
          </SidebarLink>
        ))}

        <div className="my-3 border-t border-border-default" />

        {SETTINGS_ITEMS.map((item) => (
          <SidebarLink key={item.href} href={item.href} active={isActive(item.href)} icon={item.icon} onClick={() => setMobileOpen(false)}>
            {item.label}
          </SidebarLink>
        ))}

        <div className="my-3 border-t border-border-default" />

        {COMING_SOON.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-tertiary"
          >
            {ICONS[item.icon]}
            <span>{item.label}</span>
            <span className="ml-auto rounded-full border border-border-default px-1.5 py-0.5 text-[10px]">
              Soon
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-default px-2 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to site
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <div className="sticky top-0 z-50 flex h-14 items-center border-b border-border-default bg-bg-secondary/95 px-4 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default text-text-secondary"
          aria-label="Toggle sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {mobileOpen ? (
              <path d="M3.5 3.5l9 9m0-9l-9 9" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M2.5 4h11m-11 4h11m-11 4h11" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
        <span className="ml-3 font-semibold text-accent">Xenga</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute left-0 top-0 h-full w-64 bg-bg-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden w-56 shrink-0 border-r border-border-default bg-bg-secondary lg:block">
        {sidebar}
      </div>
    </>
  );
}

function SidebarLink({
  href,
  children,
  active,
  icon,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      }`}
    >
      {ICONS[icon]}
      {children}
    </Link>
  );
}
```

**Step 3: Create dashboard `layout.tsx`**

Create `web/app/dashboard/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { WalletGate } from "@/components/dashboard/WalletGate";

export const metadata: Metadata = {
  title: "Dashboard — Xenga",
  description: "Manage your escrow orders, earnings, and API integrations.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <WalletGate>
          <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
        </WalletGate>
      </main>
    </div>
  );
}
```

**Step 4: Verify layout renders**

Create a placeholder `web/app/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return <div>Dashboard overview (placeholder)</div>;
}
```

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run dev`
Navigate to `http://localhost:3001/dashboard`
Expected: Sidebar renders on left, wallet gate shows if not connected, placeholder content shows if connected.

**Step 5: Commit**

```bash
git add web/app/dashboard/ web/components/dashboard/
git commit -m "feat(web): add dashboard layout with sidebar nav and wallet gate"
```

---

### Task 6: Frontend — Update main nav (Seller → Dashboard)

**Files:**
- Modify: `web/components/layout/Navbar.tsx`
- Modify: `web/app/seller/page.tsx` (redirect)

**Step 1: Update nav items**

In `web/components/layout/Navbar.tsx`, change the `NAV_ITEMS` array:

```typescript
const NAV_ITEMS = [
  { href: "/agent", label: "Agent" },
  { href: "/marketplace", label: "Human Escrow" },
  { href: "/dashboard", label: "Dashboard" },
];
```

**Step 2: Add redirect from old `/seller` route**

Replace `web/app/seller/page.tsx` with a redirect:

```tsx
import { redirect } from "next/navigation";

export default function SellerPage() {
  redirect("/dashboard");
}
```

Remove the `SellerPage.tsx` client component since it's no longer used.

**Step 3: Verify navigation works**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run dev`
Expected: "Dashboard" appears in nav, clicking it goes to `/dashboard`. Visiting `/seller` redirects to `/dashboard`.

**Step 4: Commit**

```bash
git add web/components/layout/Navbar.tsx web/app/seller/page.tsx
git rm web/app/seller/SellerPage.tsx
git commit -m "feat(nav): replace Seller tab with Dashboard link, redirect /seller"
```

---

### Task 7: Frontend — Overview page

**Files:**
- Modify: `web/app/dashboard/page.tsx`
- Create: `web/components/dashboard/StatsRow.tsx`
- Create: `web/components/dashboard/ActivityFeed.tsx`

**Step 1: Create `StatsRow.tsx`**

Create `web/components/dashboard/StatsRow.tsx`:

```tsx
"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
}

function StatCard({ label, value, accent, warn }: StatCardProps) {
  return (
    <div className="panel-surface rounded-xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${
          warn ? "text-warning" : accent ? "text-success" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

interface StatsRowProps {
  activeEscrows: number;
  pendingRelease: number;
  netEarnings: string; // formatted USDC string
  reputationScore: number | null;
  confidence: string | null;
}

export function StatsRow({
  activeEscrows,
  pendingRelease,
  netEarnings,
  reputationScore,
  confidence,
}: StatsRowProps) {
  const repDisplay =
    reputationScore !== null
      ? `${reputationScore}/100`
      : "—";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Active Escrows" value={activeEscrows} />
      <StatCard label="Pending Release" value={pendingRelease} />
      <StatCard label="Net Earnings" value={`$${netEarnings}`} accent />
      <StatCard
        label={`Reputation${confidence ? ` (${confidence})` : ""}`}
        value={repDisplay}
      />
    </div>
  );
}
```

**Step 2: Create `ActivityFeed.tsx`**

Create `web/components/dashboard/ActivityFeed.tsx`:

```tsx
"use client";

import Link from "next/link";
import { formatUsdc, shortenAddress } from "@/lib/utils";

interface OrderEvent {
  id: string;
  title: string;
  status: string;
  priceUsdc: number;
  buyerAddress?: string;
  createdAt: number;
}

const STATUS_LABELS: Record<string, string> = {
  created: "Order created",
  escrowed: "Payment received",
  delivery_confirmed: "Delivery confirmed",
  completed: "Funds released",
  disputed: "Dispute filed",
  resolved: "Dispute resolved",
  refunded: "Refunded",
};

export function ActivityFeed({ orders }: { orders: OrderEvent[] }) {
  const recent = orders.slice(0, 10);

  if (recent.length === 0) {
    return (
      <div className="panel-surface rounded-xl p-6 text-center text-sm text-text-secondary">
        No orders yet. Create a payment link or integrate via API to get started.
      </div>
    );
  }

  return (
    <div className="panel-surface rounded-xl">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
        <Link
          href="/dashboard/orders"
          className="text-xs text-accent hover:text-accent/80"
        >
          View all orders →
        </Link>
      </div>
      <div className="divide-y divide-border-default">
        {recent.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{order.title}</p>
              <p className="text-xs text-text-tertiary">
                {STATUS_LABELS[order.status] || order.status}
                {order.buyerAddress
                  ? ` · ${shortenAddress(order.buyerAddress)}`
                  : ""}
              </p>
            </div>
            <div className="ml-4 text-right">
              <p className="text-sm font-medium">
                ${order.priceUsdc.toFixed(2)}
              </p>
              <p className="text-xs text-text-tertiary">
                {new Date(order.createdAt * 1000).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Build the overview page**

Replace `web/app/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { authenticatedFetch } from "@/lib/api/wallet-auth";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import Link from "next/link";

interface OrderData {
  id: string;
  title: string;
  price: string;
  priceUsdc: number;
  status: string;
  buyerAddress?: string;
  escrowId?: number;
  txHash?: string;
  createdAt: number;
}

interface ReputationData {
  overall: number;
  confidence: "low" | "medium" | "high";
}

export default function DashboardOverview() {
  const { address, walletClient } = useWallet();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!address || !walletClient) return;
    setLoading(true);
    try {
      const [ordersRes, repRes] = await Promise.all([
        authenticatedFetch(
          `/api/orders?seller=${address}&limit=50`,
          walletClient,
          address
        ),
        authenticatedFetch(`/api/reputation/${address}`, walletClient, address),
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }
      if (repRes.ok) {
        const data = await repRes.json();
        setReputation(data);
      }
    } catch {
      // Silently handle — stats will show defaults
    } finally {
      setLoading(false);
    }
  }, [address, walletClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeEscrows = orders.filter((o) => o.status === "escrowed").length;
  const pendingRelease = orders.filter((o) => o.status === "delivery_confirmed").length;

  // Net earnings: completed orders only (not delivery_confirmed — funds not yet released)
  const netEarnings = orders
    .filter((o) => o.status === "completed" || o.status === "resolved")
    .reduce((sum, o) => sum + o.priceUsdc, 0)
    .toFixed(2);

  if (loading && orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your escrow activity at a glance.
        </p>
      </div>

      <StatsRow
        activeEscrows={activeEscrows}
        pendingRelease={pendingRelease}
        netEarnings={netEarnings}
        reputationScore={reputation?.overall ?? null}
        confidence={reputation?.confidence ?? null}
      />

      <ActivityFeed orders={orders} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="panel-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold">Payment Links</h3>
          <p className="mt-1 text-xs text-text-tertiary">
            Create shareable checkout links for buyers.
          </p>
          <span className="mt-3 inline-block rounded-full border border-border-default px-2.5 py-1 text-xs text-text-tertiary">
            Coming soon
          </span>
        </div>
        <Link
          href="/docs/api-reference"
          className="panel-surface rounded-xl p-4 transition-colors hover:border-border-active"
          target="_blank"
        >
          <h3 className="text-sm font-semibold">API Documentation</h3>
          <p className="mt-1 text-xs text-text-tertiary">
            Integrate Xenga escrow into your backend.
          </p>
          <span className="mt-3 inline-block text-xs text-accent">
            View docs →
          </span>
        </Link>
      </div>
    </div>
  );
}
```

**Step 4: Verify overview renders**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run dev`
Navigate to `http://localhost:3001/dashboard`
Expected: Stats row, activity feed, quick action cards render. Data loads from facilitator API if running.

**Step 5: Commit**

```bash
git add web/app/dashboard/page.tsx web/components/dashboard/StatsRow.tsx web/components/dashboard/ActivityFeed.tsx
git commit -m "feat(dashboard): add overview page with stats, activity feed, quick actions"
```

---

### Task 8: Frontend — Orders page with filters and inline expand

**Files:**
- Create: `web/app/dashboard/orders/page.tsx`
- Create: `web/components/dashboard/OrderTable.tsx`

**Step 1: Create `OrderTable.tsx`**

Create `web/components/dashboard/OrderTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { shortenAddress } from "@/lib/utils";

interface OrderData {
  id: string;
  title: string;
  price: string;
  priceUsdc: number;
  status: string;
  buyerAddress?: string;
  escrowId?: number;
  txHash?: string;
  createdAt: number;
}

const STATUS_STYLES: Record<string, string> = {
  created: "border-text-tertiary/30 bg-text-tertiary/10 text-text-tertiary",
  pending_payment: "border-warning/30 bg-warning/10 text-warning",
  escrowed: "border-accent/30 bg-accent/10 text-accent",
  delivery_confirmed: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
  completed: "border-success/30 bg-success/10 text-success",
  disputed: "border-error/30 bg-error/10 text-error",
  resolved: "border-warning/30 bg-warning/10 text-warning",
  refunded: "border-text-secondary/30 bg-text-secondary/10 text-text-secondary",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

function filterOrders(orders: OrderData[], filter: FilterKey): OrderData[] {
  switch (filter) {
    case "active":
      return orders.filter((o) => o.status === "escrowed" || o.status === "delivery_confirmed");
    case "completed":
      return orders.filter((o) => o.status === "completed" || o.status === "resolved" || o.status === "refunded");
    case "disputed":
      return orders.filter((o) => o.status === "disputed");
    default:
      return orders;
  }
}

interface OrderTableProps {
  orders: OrderData[];
  actionSlot?: (order: OrderData) => React.ReactNode;
}

export function OrderTable({ orders, actionSlot }: OrderTableProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = filterOrders(orders, filter);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border-default bg-bg-secondary p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="panel-surface rounded-xl p-8 text-center text-sm text-text-secondary">
          No orders match this filter.
        </div>
      ) : (
        <div className="panel-surface divide-y divide-border-default rounded-xl">
          {filtered.map((order) => (
            <div key={order.id}>
              <button
                onClick={() =>
                  setExpandedId(expandedId === order.id ? null : order.id)
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {order.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLES[order.status] || STATUS_STYLES.created
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
                    <span>${order.priceUsdc.toFixed(2)}</span>
                    {order.buyerAddress && (
                      <span>{shortenAddress(order.buyerAddress)}</span>
                    )}
                    <span>
                      {new Date(order.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <svg
                  className={`ml-2 h-4 w-4 shrink-0 text-text-tertiary transition-transform ${
                    expandedId === order.id ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Inline detail panel */}
              {expandedId === order.id && (
                <div className="border-t border-border-default bg-bg-tertiary/30 px-4 py-3">
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-text-tertiary">Escrow ID</span>
                      <p className="font-mono font-medium">
                        {order.escrowId ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Amount</span>
                      <p className="font-medium">
                        ${order.priceUsdc.toFixed(2)} USDC
                      </p>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Tx Hash</span>
                      <p className="truncate font-mono font-medium">
                        {order.txHash
                          ? `${order.txHash.slice(0, 10)}...`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Buyer</span>
                      <p className="font-mono font-medium">
                        {order.buyerAddress
                          ? shortenAddress(order.buyerAddress)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Action slot */}
                  {actionSlot && (
                    <div className="mt-3 border-t border-border-default pt-3">
                      {actionSlot(order)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create orders page**

Create `web/app/dashboard/orders/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { authenticatedFetch } from "@/lib/api/wallet-auth";
import { OrderTable } from "@/components/dashboard/OrderTable";
import { OrderActions } from "@/components/dashboard/OrderActions";

interface OrderData {
  id: string;
  title: string;
  price: string;
  priceUsdc: number;
  status: string;
  buyerAddress?: string;
  escrowId?: number;
  txHash?: string;
  createdAt: number;
}

export default function OrdersPage() {
  const { address, walletClient } = useWallet();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!address || !walletClient) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/orders?seller=${address}&limit=100`,
        walletClient,
        address
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
  }, [address, walletClient]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (loading && orders.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your escrow orders and confirm deliveries.
        </p>
      </div>

      <OrderTable
        orders={orders}
        actionSlot={(order) => (
          <OrderActions order={order} onComplete={fetchOrders} />
        )}
      />
    </div>
  );
}
```

**Step 3: Verify orders page renders**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run dev`
Navigate to `http://localhost:3001/dashboard/orders`
Expected: Filter tabs and order list render. Clicking an order expands the detail panel.

**Step 4: Commit**

```bash
git add web/app/dashboard/orders/ web/components/dashboard/OrderTable.tsx
git commit -m "feat(dashboard): add orders page with filter tabs and inline expand"
```

---

### Task 9: Frontend — Order actions (confirm delivery + refund via wallet)

**Files:**
- Create: `web/components/dashboard/OrderActions.tsx`

**Step 1: Create `OrderActions.tsx`**

This component handles on-chain actions signed directly by the seller's browser wallet using `walletClient.writeContract`.

Create `web/components/dashboard/OrderActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { escrowVaultAbi } from "@shared/abi.js";

interface OrderData {
  id: string;
  status: string;
  escrowId?: number;
}

interface OrderActionsProps {
  order: OrderData;
  onComplete: () => void;
}

export function OrderActions({ order, onComplete }: OrderActionsProps) {
  const { walletClient, address, publicClient } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);

  const escrowVaultAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS as `0x${string}` | undefined;

  const canConfirmDelivery = order.status === "escrowed" && order.escrowId != null;
  const canRefund =
    (order.status === "escrowed" || order.status === "delivery_confirmed") &&
    order.escrowId != null;

  if (!canConfirmDelivery && !canRefund) return null;
  if (!walletClient || !address || !escrowVaultAddress) return null;

  const executeAction = async (action: "confirmDelivery" | "refund") => {
    if (!order.escrowId) return;
    setPending(action);
    setError(null);
    setConfirmDialog(null);

    try {
      const hash = await walletClient.writeContract({
        address: escrowVaultAddress,
        abi: escrowVaultAbi,
        functionName: action,
        args: [BigInt(order.escrowId)],
        account: address,
        chain: publicClient.chain,
      });

      // Wait for tx confirmation
      await publicClient.waitForTransactionReceipt({ hash });
      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      // Shorten long error messages
      setError(message.length > 100 ? message.slice(0, 100) + "..." : message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      )}

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="text-xs font-medium text-warning">
            {confirmDialog === "confirmDelivery"
              ? "Confirm that you have delivered this order? The buyer will have a window to dispute."
              : "Refund the full amount to the buyer? This cannot be undone."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => executeAction(confirmDialog as "confirmDelivery" | "refund")}
              disabled={!!pending}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {pending ? "Signing..." : "Confirm"}
            </button>
            <button
              onClick={() => setConfirmDialog(null)}
              className="rounded-md border border-border-default px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirmDialog && (
        <div className="flex gap-2">
          {canConfirmDelivery && (
            <button
              onClick={() => setConfirmDialog("confirmDelivery")}
              disabled={!!pending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {pending === "confirmDelivery" ? "Signing..." : "Confirm Delivery"}
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => setConfirmDialog("refund")}
              disabled={!!pending}
              className="rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              {pending === "refund" ? "Signing..." : "Refund"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add `NEXT_PUBLIC_ESCROW_VAULT_ADDRESS` env var**

In `web/.env.local` (or `.env`), add:

```
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x467e239df917755ff7ab7f6f49e96a0e35a6253d
```

This is the deployed EscrowVault address on Base Sepolia.

**Step 3: Verify actions render on active orders**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run dev`
Navigate to `/dashboard/orders`, expand an active order.
Expected: "Confirm Delivery" and "Refund" buttons appear with confirmation dialog flow.

**Step 4: Commit**

```bash
git add web/components/dashboard/OrderActions.tsx
git commit -m "feat(dashboard): add on-chain order actions (confirm delivery + refund via wallet)"
```

---

### Task 10: Frontend — Settings page (seller profile)

**Files:**
- Create: `web/app/dashboard/settings/page.tsx`
- Create: `web/components/dashboard/SellerProfile.tsx`

**Step 1: Create `SellerProfile.tsx`**

Create `web/components/dashboard/SellerProfile.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { facilitatorFetch } from "@/lib/api/client";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

export function SellerProfile() {
  const { address, walletClient } = useWallet();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch existing profile
  useEffect(() => {
    if (!address) return;
    facilitatorFetch(`/api/sellers/${address}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setName(data.name || "");
          setSavedName(data.name || null);
          setIsRegistered(true);
        }
      })
      .catch(() => {});
  }, [address]);

  const handleSave = async () => {
    if (!address || !walletClient) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await authenticatedFetch("/api/sellers", walletClient, address, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || undefined }),
      });

      if (res.ok) {
        setSavedName(name.trim());
        setIsRegistered(true);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else if (res.status === 409) {
        // Already registered — this means the POST endpoint doesn't support updates
        // For v1, just show the current state
        setError("Profile already registered. Name updates coming soon.");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save profile");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-surface rounded-xl p-6">
      <h3 className="text-sm font-semibold">Seller Profile</h3>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Your business name"
            className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary">
            Payout Address
          </label>
          <p className="mt-1 rounded-lg border border-border-default bg-bg-tertiary/50 px-3 py-2 font-mono text-sm text-text-secondary">
            {address || "—"}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            This is your connected wallet. USDC payouts are sent here.
          </p>
        </div>

        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        {success && (
          <p className="text-xs text-success">Profile saved successfully.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || (isRegistered && name.trim() === (savedName || ""))}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : isRegistered ? "Update Profile" : "Register as Seller"}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Create settings page**

Create `web/app/dashboard/settings/page.tsx`:

```tsx
"use client";

import { SellerProfile } from "@/components/dashboard/SellerProfile";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your seller profile and preferences.
        </p>
      </div>

      <SellerProfile />
    </div>
  );
}
```

**Step 3: Verify settings page**

Navigate to `/dashboard/settings`.
Expected: Profile form renders with name input, payout address display, and save button.

**Step 4: Commit**

```bash
git add web/app/dashboard/settings/ web/components/dashboard/SellerProfile.tsx
git commit -m "feat(dashboard): add settings page with seller profile registration"
```

---

### Task 11: Frontend — API Keys page

**Files:**
- Create: `web/app/dashboard/api-keys/page.tsx`
- Create: `web/components/dashboard/ApiKeyManager.tsx`

**Step 1: Create `ApiKeyManager.tsx`**

Create `web/components/dashboard/ApiKeyManager.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/wallet/WalletProvider";
import { authenticatedFetch } from "@/lib/api/wallet-auth";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export function ApiKeyManager() {
  const { address, walletClient } = useWallet();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!address || !walletClient) return;
    try {
      const res = await authenticatedFetch(
        "/api/seller-api-keys",
        walletClient,
        address
      );
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // Silently handle
    }
  }, [address, walletClient]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!address || !walletClient) return;
    setCreating(true);
    setError(null);
    setNewKeyValue(null);

    try {
      const res = await authenticatedFetch(
        "/api/seller-api-keys",
        walletClient,
        address,
        {
          method: "POST",
          body: JSON.stringify({ name: newKeyName.trim() || undefined }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setNewKeyValue(data.key);
        setNewKeyName("");
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create API key");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!address || !walletClient) return;
    setRevoking(keyId);
    setError(null);

    try {
      const res = await authenticatedFetch(
        `/api/seller-api-keys/${keyId}`,
        walletClient,
        address,
        { method: "DELETE" }
      );

      if (res.ok) {
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to revoke key");
      }
    } catch {
      setError("Network error");
    } finally {
      setRevoking(null);
    }
  };

  const [copied, setCopied] = useState(false);
  const copyKey = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create new key */}
      <div className="panel-surface rounded-xl p-6">
        <h3 className="text-sm font-semibold">Create API Key</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Use API keys to authenticate programmatic requests to the Xenga API.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (optional)"
            maxLength={100}
            className="flex-1 rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Key"}
          </button>
        </div>

        {/* Show new key (only visible once, right after creation) */}
        {newKeyValue && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success/10 p-3">
            <p className="text-xs font-medium text-success">
              Key created! Copy it now — it won't be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded border border-border-default bg-bg-primary px-2 py-1 font-mono text-xs">
                {newKeyValue}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 rounded-md border border-border-default px-2 py-1 text-xs hover:bg-bg-tertiary"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-error">{error}</p>}
      </div>

      {/* Existing keys */}
      <div className="panel-surface rounded-xl">
        <div className="border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold">Active Keys</h3>
        </div>

        {keys.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-secondary">
            No API keys yet.
          </div>
        ) : (
          <div className="divide-y divide-border-default">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">
                      {key.keyPrefix}...
                    </code>
                    {key.name && (
                      <span className="text-xs text-text-tertiary">
                        {key.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Created{" "}
                    {new Date(key.createdAt * 1000).toLocaleDateString()}
                    {key.lastUsedAt &&
                      ` · Last used ${new Date(key.lastUsedAt * 1000).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={revoking === key.id}
                  className="rounded-md border border-error/30 px-2.5 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
                >
                  {revoking === key.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create API keys page**

Create `web/app/dashboard/api-keys/page.tsx`:

```tsx
"use client";

import { ApiKeyManager } from "@/components/dashboard/ApiKeyManager";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage API keys for programmatic access to the Xenga API.
        </p>
      </div>

      <ApiKeyManager />
    </div>
  );
}
```

**Step 3: Verify API keys page**

Navigate to `/dashboard/api-keys`.
Expected: Create form renders. After creating a key (requires facilitator + wallet), the key is displayed once, then appears masked in the list.

**Step 4: Commit**

```bash
git add web/app/dashboard/api-keys/ web/components/dashboard/ApiKeyManager.tsx
git commit -m "feat(dashboard): add API keys page with create/list/revoke"
```

---

### Task 12: Backend — Update sellers route to support profile updates

**Files:**
- Modify: `src/server/routes/sellers.ts`

**Step 1: Add PUT/PATCH support or upsert logic**

The current `POST /api/sellers` returns 409 if already registered. Change it to upsert (INSERT OR REPLACE) so the dashboard can update the seller name:

In `src/server/routes/sellers.ts`, change the POST handler to use `INSERT ... ON CONFLICT`:

```typescript
router.post("/", walletAuth(), (req, res) => {
  const db = getDb();
  const address = req.callerAddress!;
  const name = req.body?.name;

  if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
    return res.status(400).json({ error: "Name must be a string under 100 characters" });
  }

  const now = Math.floor(Date.now() / 1000);

  db.run(
    `INSERT INTO sellers (address, name, registered_at)
     VALUES (?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET name = excluded.name`,
    [address, name?.trim() || null, now]
  );

  const seller = db.query("SELECT * FROM sellers WHERE address = ?").get(address) as {
    address: string;
    name: string | null;
    registered_at: number;
  };

  res.json({
    address: seller.address,
    name: seller.name,
    registeredAt: seller.registered_at,
  });
});
```

**Step 2: Verify**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run src/server/index.ts`
Expected: POST /api/sellers now upserts (first call creates, subsequent calls update name).

**Step 3: Commit**

```bash
git add src/server/routes/sellers.ts
git commit -m "feat(api): change seller registration to upsert for profile updates"
```

---

### Task 13: Cleanup — Remove old seller components, verify build

**Files:**
- Delete: `web/components/seller/SellerDashboard.tsx`
- Delete: `web/components/seller/OrderList.tsx`
- Delete: `web/components/seller/EarningsCard.tsx`
- Delete: `web/components/seller/types.ts`
- Modify: `web/app/seller/page.tsx` (already redirects from Task 6)

**Step 1: Remove old seller components**

```bash
rm web/components/seller/SellerDashboard.tsx
rm web/components/seller/OrderList.tsx
rm web/components/seller/EarningsCard.tsx
rm web/components/seller/types.ts
```

Check if anything else imports from `@/components/seller/` — if not, remove the directory:

```bash
rmdir web/components/seller/
```

**Step 2: Verify build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds with no import errors.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old seller components, replaced by dashboard"
```

---

### Task 14: Integration test — full dashboard flow

**Step 1: Start both servers**

Terminal 1: `cd /Users/uhyun/personal/x402-escrow && bun run dev`
Terminal 2: `cd /Users/uhyun/personal/x402-escrow/web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x467e239df917755ff7ab7f6f49e96a0e35a6253d bun run dev`

**Step 2: Manual test checklist**

1. Visit `/` — verify "Dashboard" appears in nav instead of "Seller"
2. Visit `/seller` — verify redirect to `/dashboard`
3. Visit `/dashboard` without wallet — verify wallet gate appears
4. Connect demo wallet — verify overview loads (may show empty state)
5. Navigate to `/dashboard/orders` — verify filter tabs and empty state
6. Navigate to `/dashboard/settings` — register as seller with a name
7. Navigate to `/dashboard/api-keys` — create an API key, verify it appears masked in list
8. (If orders exist) Expand an active order — verify Confirm Delivery and Refund buttons appear
9. Test mobile: resize browser — verify sidebar collapses to hamburger

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for seller dashboard"
```
