# Landing Page Reputation Emphasis — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate on-chain reputation to equal prominence with escrow across the landing page.

**Architecture:** Pure frontend copy + layout changes across 5 existing components. No new components, no backend changes.

**Tech Stack:** Next.js 15, React, Framer Motion, Tailwind CSS

---

### Task 1: Update HeroSection copy and stats

**Files:**
- Modify: `web/components/landing/HeroSection.tsx:30-42` (badge, headline, subtext)
- Modify: `web/components/landing/HeroSection.tsx:76-80` (stats row)

**Step 1: Update the badge pill**

Change line 31:
```tsx
// Before:
Escrow-Secured Checkout

// After:
Escrow + Reputation Protocol
```

**Step 2: Update the headline**

Change line 37:
```tsx
// Before:
On-chain escrow for humans and autonomous agents

// After:
On-chain escrow and reputation for humans and autonomous agents
```

**Step 3: Update the subtext**

Change lines 40-42:
```tsx
// Before:
{isMockChainClient
  ? "Explore the escrow lifecycle with simulated settlement, signed USDC authorization, and programmable release logic."
  : "Explore the escrow lifecycle with on-chain settlement, signed USDC authorization, and programmable release logic."}

// After:
{isMockChainClient
  ? "Simulated escrow settlement and reputation scoring — every transaction builds a permissionless credit history that shapes future terms."
  : "Escrow settlement and reputation scoring on-chain — every transaction builds a permissionless credit history that shapes future terms."}
```

**Step 4: Update the stats row**

Change lines 76-80:
```tsx
// Before:
<MiniStat label="Buyer Gas Cost" value="$0" />
<MiniStat label="Settlement" value={isMockChainClient ? "Simulated" : "Base Sepolia"} />
<MiniStat label="Escrow Visibility" value="Realtime" />
<MiniStat label="Authorization" value="EIP-712" />
<MiniStat label="Asset" value="USDC" />

// After:
<MiniStat label="Buyer Gas Cost" value="$0" />
<MiniStat label="Reputation" value="On-Chain" />
<MiniStat label="Escrow Visibility" value="Realtime" />
<MiniStat label="Authorization" value="EIP-712" />
<MiniStat label="Asset" value="USDC" />
```

**Step 5: Commit**

```bash
git add web/components/landing/HeroSection.tsx
git commit -m "feat: update hero section to emphasize reputation alongside escrow"
```

---

### Task 2: Add reputation step to ProtocolFlow

**Files:**
- Modify: `web/components/landing/ProtocolFlow.tsx:6-14` (steps array)
- Modify: `web/components/landing/ProtocolFlow.tsx:32` (grid cols)
- Modify: `web/components/landing/ProtocolFlow.tsx:43-47` (step badge color logic)

**Step 1: Add step 8 to the steps array**

Change lines 6-14:
```tsx
// Before:
const steps = [
  { label: "Request", icon: "1", desc: "Client sends HTTP request" },
  { label: "402", icon: "402", desc: "Server returns Payment Required" },
  { label: "Sign", icon: "3", desc: "Client signs EIP-712 authorization" },
  { label: "Retry", icon: "4", desc: "Client retries with X-PAYMENT" },
  { label: "Escrow", icon: "5", desc: "Funds locked in smart contract" },
  { label: "Deliver", icon: "6", desc: "Seller confirms delivery" },
  { label: "Release", icon: "7", desc: "Funds released to seller" },
];

// After:
const steps = [
  { label: "Request", icon: "1", desc: "Client sends HTTP request" },
  { label: "402", icon: "402", desc: "Server returns Payment Required" },
  { label: "Sign", icon: "3", desc: "Client signs EIP-712 authorization" },
  { label: "Retry", icon: "4", desc: "Client retries with X-PAYMENT" },
  { label: "Escrow", icon: "5", desc: "Funds locked in smart contract" },
  { label: "Deliver", icon: "6", desc: "Seller confirms delivery" },
  { label: "Release", icon: "7", desc: "Funds released to seller" },
  { label: "Reputation", icon: "★", desc: "On-chain reputation score updated" },
];
```

**Step 2: Update the grid to fit 8 steps**

Change line 32:
```tsx
// Before:
<div className="grid gap-3 pb-1 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">

// After:
<div className="grid gap-3 pb-1 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
```

**Step 3: Add success color for the reputation step badge**

Change the badge color logic (lines 43-47):
```tsx
// Before:
className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
  step.icon === "402"
    ? "border-warning/30 bg-warning/10 text-warning"
    : "border-accent/30 bg-accent/10 text-accent"
}`}

// After:
className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
  step.icon === "402"
    ? "border-warning/30 bg-warning/10 text-warning"
    : step.icon === "★"
      ? "border-success/30 bg-success/10 text-success"
      : "border-accent/30 bg-accent/10 text-accent"
}`}
```

**Step 4: Commit**

```bash
git add web/components/landing/ProtocolFlow.tsx
git commit -m "feat: add reputation step to protocol flow visualization"
```

---

### Task 3: Update DemoCards descriptions and highlights

**Files:**
- Modify: `web/components/landing/DemoCards.tsx:8-42` (demos array)

**Step 1: Update Agent Service card**

Change lines 11-12 (description):
```tsx
// Before:
description:
  "Autonomous machine-to-machine payments with simulated operator verification.",

// After:
description:
  "Autonomous machine-to-machine payments with reputation-gated escrow terms.",
```

Change line 23 (highlights):
```tsx
// Before:
highlights: ["Auto-advancing run", "Signed authorization + on-chain settle"],

// After:
highlights: ["Auto-advancing run", "Signed authorization + on-chain settle", "Reputation updated on completion"],
```

**Step 2: Update Human Escrow card**

Change lines 28-29 (description):
```tsx
// Before:
description:
  "Buyer-driven escrow checkout with delivery confirmation and dispute controls.",

// After:
description:
  "Buyer-driven escrow checkout with delivery confirmation, disputes, and reputation tracking.",
```

Change line 39 (highlights):
```tsx
// Before:
highlights: ["Manual release/dispute", "Step-by-step protocol view"],

// After:
highlights: ["Manual release/dispute", "Step-by-step protocol view", "On-chain reputation scoring"],
```

**Step 3: Update the mock chain conditional**

The mock chain conditional on line 116 checks for the old highlight text. Update:
```tsx
// Before:
{isMockChainClient && item === "Signed authorization + on-chain settle"
  ? "Signed authorization + simulated settlement"
  : item}

// After:
{isMockChainClient && item === "Signed authorization + on-chain settle"
  ? "Signed authorization + simulated settlement"
  : item}
```

No change needed — the conditional still matches the exact string.

**Step 4: Commit**

```bash
git add web/components/landing/DemoCards.tsx
git commit -m "feat: add reputation highlights to demo cards"
```

---

### Task 4: Reorder sections in page.tsx

**Files:**
- Modify: `web/app/page.tsx:27-33` (section order)

**Step 1: Move ReputationSection from position 6 to position 4**

Change lines 27-33:
```tsx
// Before:
<HeroSection />
<ProtocolFlow />
<DemoCards />
<HowItWorks />
<AdaptabilitySection />
<ReputationSection />
<Footer />

// After:
<HeroSection />
<ProtocolFlow />
<DemoCards />
<ReputationSection />
<HowItWorks />
<AdaptabilitySection />
<Footer />
```

**Step 2: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: move reputation section higher in landing page order"
```

---

### Task 5: Update Footer tagline

**Files:**
- Modify: `web/components/landing/Footer.tsx:43-45` (tagline)

**Step 1: Update the tagline**

Change lines 43-45:
```tsx
// Before:
{isMockChain
  ? "Agentic payments with simulated escrow state for offline demos."
  : "Agentic payments with on-chain escrow protection."}

// After:
{isMockChain
  ? "Agentic payments with simulated escrow and reputation for offline demos."
  : "Agentic payments with on-chain escrow and reputation."}
```

**Step 2: Commit**

```bash
git add web/components/landing/Footer.tsx
git commit -m "feat: update footer tagline to include reputation"
```

---

### Task 6: Build verification

**Step 1: Run Next.js build to verify no errors**

Run: `cd web && bun run build`
Expected: Build succeeds with no errors.

**Step 2: Visual check (optional)**

Run: `cd web && NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3000 bun run dev`
Open `http://localhost:3001` and verify:
- Hero badge says "Escrow + Reputation Protocol"
- Hero headline includes "and reputation"
- Hero subtext mentions reputation scoring
- Stats row shows "Reputation: On-Chain" instead of "Settlement: Base Sepolia"
- ProtocolFlow has 8 steps, last one green with "★"
- DemoCards mention reputation in descriptions and highlights
- ReputationSection appears after DemoCards (position 4)
- Footer tagline says "on-chain escrow and reputation"
