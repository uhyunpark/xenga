# Wallet & Navigation Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate demo and dashboard wallet UX, restructure navigation to `Playground | Dashboard`, move demo pages under `/playground/`.

**Architecture:** Remove wallet UI from header. Move `/agent` and `/marketplace` to `/playground/agent` and `/playground/marketplace`. Add a `/playground` landing page with two demo cards. Old URLs redirect for SEO. Delete unused `WalletSelector` component.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS

---

### Task 1: Remove `WalletSelector` from Navbar and update nav items

**Files:**
- Modify: `web/components/layout/Navbar.tsx`

**Step 1: Update nav items and remove WalletSelector**

In `web/components/layout/Navbar.tsx`:

1. Remove the `WalletSelector` import (line 6):

```typescript
// DELETE this line:
import { WalletSelector } from "@/components/ui/WalletSelector";
```

2. Replace the `NAV_ITEMS` array (lines 9-13):

Old:
```typescript
const NAV_ITEMS = [
  { href: "/agent", label: "Agent" },
  { href: "/marketplace", label: "Human Escrow" },
  { href: "/dashboard", label: "Dashboard" },
];
```

New:
```typescript
const NAV_ITEMS = [
  { href: "/playground", label: "Playground" },
  { href: "/dashboard", label: "Dashboard" },
];
```

3. Remove the desktop `WalletSelector` (lines 75-77):

```tsx
// DELETE this block:
<div className="hidden md:block">
  <WalletSelector />
</div>
```

4. Remove the mobile `WalletSelector` (lines 132-134):

```tsx
// DELETE this block:
<div className="rounded-lg border border-border-default bg-bg-secondary p-2">
  <WalletSelector />
</div>
```

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add web/components/layout/Navbar.tsx
git commit -m "refactor: remove WalletSelector from header, update nav to Playground + Dashboard"
```

---

### Task 2: Create `/playground` landing page

**Files:**
- Create: `web/app/playground/page.tsx`

**Step 1: Create the playground landing page**

Create `web/app/playground/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Try Xenga's escrow protocol hands-on — agent service automation or human marketplace checkout on Base Sepolia.",
};

const demos = [
  {
    title: "Agent Service",
    description:
      "Watch an autonomous agent discover a service, negotiate payment, and settle on-chain — including dispute resolution.",
    href: "/playground/agent",
    badge: "Autonomous",
    color: "accent-purple" as const,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
        <path d="M9 15h6" />
      </svg>
    ),
    highlights: [
      "Auto-advancing terminal walkthrough",
      "Machine-to-machine escrow settlement",
      "Dispute resolution demo",
    ],
  },
  {
    title: "Human Escrow",
    description:
      "Step through a marketplace checkout — product selection, EIP-712 signing, escrow lock, delivery confirmation, and fund release.",
    href: "/playground/marketplace",
    badge: "Interactive",
    color: "accent" as const,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    highlights: [
      "Step-by-step payment flow",
      "Protocol Inspector shows every detail",
      "Release, dispute, or auto-release",
    ],
  },
];

function colorClasses(color: "accent-purple" | "accent") {
  return color === "accent-purple"
    ? { badge: "bg-accent-purple/10 text-accent-purple", icon: "bg-accent-purple/10 text-accent-purple" }
    : { badge: "bg-accent/10 text-accent", icon: "bg-accent/10 text-accent" };
}

export default function PlaygroundPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Playground</h1>
        <p className="mt-3 text-text-secondary">
          Try the Xenga escrow protocol hands-on. Pick a demo to get started.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {demos.map((demo) => {
          const c = colorClasses(demo.color);
          return (
            <Link key={demo.href} href={demo.href} className="group block">
              <div className="panel-surface flex h-full flex-col rounded-2xl p-6 transition-all duration-200 hover:border-border-active hover:shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className={`rounded-lg p-2.5 ${c.icon}`}>
                    {demo.icon}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.badge}`}>
                    {demo.badge}
                  </span>
                </div>
                <h2 className="mb-2 text-lg font-semibold">{demo.title}</h2>
                <p className="text-sm text-text-secondary">{demo.description}</p>
                <div className="mt-4 flex-1 space-y-1.5">
                  {demo.highlights.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-1 text-sm font-medium text-text-tertiary transition-colors group-hover:text-text-primary">
                  Start Demo
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds, `/playground` appears in route list

**Step 3: Commit**

```bash
git add web/app/playground/page.tsx
git commit -m "feat: add /playground landing page with demo cards"
```

---

### Task 3: Move agent page to `/playground/agent`

**Files:**
- Create: `web/app/playground/agent/page.tsx` (copy from `web/app/agent/page.tsx`)
- Create: `web/app/playground/agent/AgentPage.tsx` (copy from `web/app/agent/AgentPage.tsx`)
- Modify: `web/app/agent/page.tsx` (replace with redirect)

**Step 1: Copy agent page files to playground**

Create `web/app/playground/agent/page.tsx`:

```tsx
import type { Metadata } from "next";
import AgentPage from "./AgentPage";

export const metadata: Metadata = {
  title: "Agent Service Demo",
  description:
    "Watch an autonomous agent execute discovery, payment, and on-chain escrow settlement — including dispute resolution on Base Sepolia.",
  openGraph: {
    title: "Agent Service Demo — Xenga",
    description:
      "Autonomous agent demo with machine-to-machine escrow payments, on-chain settlement, and dispute resolution.",
  },
  twitter: {
    title: "Agent Service Demo — Xenga",
    description:
      "Autonomous agent demo with machine-to-machine escrow payments and on-chain settlement.",
  },
};

export default function Page() {
  return <AgentPage />;
}
```

Copy `web/app/agent/AgentPage.tsx` to `web/app/playground/agent/AgentPage.tsx` (no changes needed — all imports use `@/` aliases).

**Step 2: Replace old agent page with redirect**

Replace `web/app/agent/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function AgentRedirect() {
  redirect("/playground/agent");
}
```

Delete `web/app/agent/AgentPage.tsx` (no longer needed at old location).

**Step 3: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds, `/playground/agent` appears in route list, `/agent` shows as redirect

**Step 4: Commit**

```bash
git add web/app/playground/agent/ web/app/agent/
git commit -m "feat: move agent demo to /playground/agent, redirect old URL"
```

---

### Task 4: Move marketplace page to `/playground/marketplace`

**Files:**
- Create: `web/app/playground/marketplace/page.tsx` (copy from `web/app/marketplace/page.tsx`)
- Create: `web/app/playground/marketplace/MarketplacePage.tsx` (copy from `web/app/marketplace/MarketplacePage.tsx`)
- Modify: `web/app/marketplace/page.tsx` (replace with redirect)

**Step 1: Copy marketplace page files to playground**

Create `web/app/playground/marketplace/page.tsx`:

```tsx
import type { Metadata } from "next";
import MarketplacePage from "./MarketplacePage";

export const metadata: Metadata = {
  title: "Marketplace Demo",
  description:
    "Interactive escrow marketplace demo — simulate buyer checkout, EIP-712 signing, on-chain settlement, and release or dispute decisions on Base Sepolia.",
  openGraph: {
    title: "Marketplace Demo — Xenga",
    description:
      "Interactive escrow marketplace demo with on-chain settlement, reputation scoring, and dispute resolution.",
  },
  twitter: {
    title: "Marketplace Demo — Xenga",
    description:
      "Interactive escrow marketplace demo with on-chain settlement and dispute resolution.",
  },
};

export default function Page() {
  return <MarketplacePage />;
}
```

Copy `web/app/marketplace/MarketplacePage.tsx` to `web/app/playground/marketplace/MarketplacePage.tsx` (no changes needed — all imports use `@/` aliases).

**Step 2: Replace old marketplace page with redirect**

Replace `web/app/marketplace/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function MarketplaceRedirect() {
  redirect("/playground/marketplace");
}
```

Delete `web/app/marketplace/MarketplacePage.tsx` (no longer needed at old location).

**Step 3: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds, `/playground/marketplace` appears in route list

**Step 4: Commit**

```bash
git add web/app/playground/marketplace/ web/app/marketplace/
git commit -m "feat: move marketplace demo to /playground/marketplace, redirect old URL"
```

---

### Task 5: Update all URL references

**Files:**
- Modify: `web/components/landing/DemoCards.tsx` — update `href` values
- Modify: `web/components/landing/HeroSection.tsx` — update `href` values
- Modify: `web/app/sitemap.ts` — update URLs

**Step 1: Update DemoCards**

In `web/components/landing/DemoCards.tsx`, update the `demos` array entries:

Old:
```typescript
    href: "/agent",
```
New:
```typescript
    href: "/playground/agent",
```

Old:
```typescript
    href: "/marketplace",
```
New:
```typescript
    href: "/playground/marketplace",
```

**Step 2: Update HeroSection**

In `web/components/landing/HeroSection.tsx`, update the two `Link` components:

Old: `href="/agent"` → New: `href="/playground/agent"`
Old: `href="/marketplace"` → New: `href="/playground/marketplace"`

**Step 3: Update sitemap**

In `web/app/sitemap.ts`, update URL entries:

Old: `` url: `${baseUrl}/agent` `` → New: `` url: `${baseUrl}/playground/agent` ``
Old: `` url: `${baseUrl}/marketplace` `` → New: `` url: `${baseUrl}/playground/marketplace` ``

Add the playground landing page:
`` url: `${baseUrl}/playground` ``

**Step 4: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add web/components/landing/DemoCards.tsx web/components/landing/HeroSection.tsx web/app/sitemap.ts
git commit -m "refactor: update all URL references from /agent, /marketplace to /playground/*"
```

---

### Task 6: Delete unused `WalletSelector` component

**Files:**
- Delete: `web/components/ui/WalletSelector.tsx`

**Step 1: Verify no remaining imports**

Search for any remaining imports of `WalletSelector` across the codebase. After Task 1 removed it from Navbar, there should be zero.

Run: `grep -r "WalletSelector" web/ --include="*.tsx" --include="*.ts"`
Expected: No matches (only the file itself, which we're deleting)

**Step 2: Delete the file**

```bash
rm web/components/ui/WalletSelector.tsx
```

**Step 3: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add web/components/ui/WalletSelector.tsx
git commit -m "chore: delete unused WalletSelector component"
```

---

### Task 7: Update docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `web/CLAUDE.md`

**Step 1: Update CLAUDE.md**

In `CLAUDE.md`, find the web structure section and update path references:

1. Update the `app/` structure to reflect the new routes:
   - Replace `marketplace/page.tsx` references with `playground/marketplace/page.tsx`
   - Replace `agent/page.tsx` references with `playground/agent/page.tsx`
   - Add `playground/page.tsx` entry

2. In the `components/` section, remove `WalletSelector` from the `ui/` list.

3. In the "Seller Dashboard — Frontend" section, remove the `WalletSelector` reference from the Layout line.

**Step 2: Update web/CLAUDE.md**

Similar updates — reflect the new URL structure and remove `WalletSelector` references.

**Step 3: Commit**

```bash
git add CLAUDE.md web/CLAUDE.md
git commit -m "docs: update CLAUDE.md for playground URL structure and WalletSelector removal"
```

---

### Task 8: Final verification

**Step 1: Verify web build**

Run: `cd /Users/uhyun/personal/x402-escrow/web && bun run build`
Expected: Build succeeds with routes:
- `/playground` (static)
- `/playground/agent` (static)
- `/playground/marketplace` (static)
- `/agent` (redirect)
- `/marketplace` (redirect)
- `/dashboard` and sub-routes (unchanged)

**Step 2: Verify contract tests still pass**

Run: `cd /Users/uhyun/personal/x402-escrow && bun run test:contracts`
Expected: All 86 tests pass (no contract changes)

**Step 3: Grep for stale references**

Run: `grep -rn "WalletSelector" web/ --include="*.tsx" --include="*.ts"`
Expected: No matches

Run: `grep -rn 'href="/agent"' web/ --include="*.tsx" --include="*.ts"`
Expected: No matches (only redirects)

Run: `grep -rn 'href="/marketplace"' web/ --include="*.tsx" --include="*.ts"`
Expected: No matches (only redirects)
