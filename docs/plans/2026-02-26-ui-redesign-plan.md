# UI Redesign — Elevated Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete visual reskin of the Xenga web frontend — teal color palette, Inter/JetBrains Mono typography, refined shadows/spacing, redesigned navbar and sidebar.

**Architecture:** CSS-token-first approach. Task 1 updates globals.css design tokens and fonts, which propagates to all components using `accent`, `bg-*`, `text-*`, `border-*` tokens automatically. Tasks 2-8 then refine individual components for the new aesthetic.

**Tech Stack:** Tailwind CSS 4 (`@theme` block), Next.js 15, Framer Motion, Inter + JetBrains Mono (Google Fonts via `next/font`)

**Note on testing:** This is a visual reskin — verification is done by running `cd web && bun run dev` and inspecting in-browser. No unit tests apply.

---

### Task 1: Design System Foundation

**Files:**
- Modify: `web/app/globals.css` (all 254 lines — rewrite `@theme` block, update hardcoded colors)
- Modify: `web/app/layout.tsx:1-51` (swap font setup to Inter + JetBrains Mono)

**Step 1: Install Inter and JetBrains Mono via next/font**

In `web/app/layout.tsx`, replace Coinbase Sans font imports with `next/font/google`:

```tsx
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
```

Apply to `<body>`:
```tsx
<body className={`${inter.variable} ${jetbrainsMono.variable} font-sans ...`}>
```

**Step 2: Rewrite globals.css `@theme` block**

Replace the entire `@theme { ... }` block (lines 123-143) with:

```css
@theme {
  --color-bg-primary: #F8FAFB;
  --color-bg-secondary: #FFFFFF;
  --color-bg-tertiary: #F1F5F9;
  --color-border-default: #E2E8F0;
  --color-border-active: #5EEAD4;
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-text-tertiary: #64748B;
  --color-accent: #0D9488;
  --color-accent-hover: #0F766E;
  --color-accent-light: #CCFBF1;
  --color-accent-muted: #99F6E4;
  --color-accent-purple: #8B5CF6;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-error: #DC2626;
  --color-violet: #8B5CF6;

  --font-sans: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, monospace;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03);
  --shadow-lg: 0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
}
```

**Step 3: Remove all Coinbase Sans/Mono @font-face declarations**

Delete lines 2-121 (all `@font-face` blocks).

**Step 4: Update hardcoded blue values in globals.css**

Replace every hardcoded blue (`#2563EB`, `#1d4ed8`, `rgba(37, 99, 235, ...)`) with teal equivalents:

| Location | Old | New |
|---|---|---|
| `::selection` (line 159) | `rgba(37, 99, 235, 0.2)` | `rgba(13, 148, 136, 0.2)` |
| `.gradient-text` (line 172) | `#1d4ed8` | `#0D9488` |
| `.glow-blue` (line 179) | `rgba(37, 99, 235, 0.2)` | `rgba(13, 148, 136, 0.2)` |
| `.glow-purple` (line 183) | `rgba(37, 99, 235, 0.16)` | `rgba(139, 92, 246, 0.16)` |
| `pulse-glow` keyframe (line 188) | `rgba(37, 99, 235, 0.28)` / `rgba(37, 99, 235, 0)` | `rgba(13, 148, 136, 0.28)` / `rgba(13, 148, 136, 0)` |
| `inspector-flash` keyframe (line 236) | `rgba(37, 99, 235, 0.1)` | `rgba(13, 148, 136, 0.1)` |

**Step 5: Update body background gradient**

```css
body {
  background-color: var(--color-bg-primary);
  background-image: linear-gradient(180deg, #fafcfd 0%, #f8fafb 100%);
}
```

**Step 6: Verify build compiles**

Run: `cd web && bun run build`
Expected: Build succeeds (may have warnings about unused fonts in `public/fonts/`)

**Step 7: Commit**

```bash
git add web/app/globals.css web/app/layout.tsx
git commit -m "feat(web): teal design system — new palette, Inter/JetBrains Mono fonts, layered shadows"
```

---

### Task 2: Navbar Redesign

**Files:**
- Modify: `web/components/layout/Navbar.tsx` (178 lines — significant rewrite)

**Step 1: Redesign the navbar**

Key changes:
- Replace `border-b border-border-default` with `shadow-sm` (subtle shadow instead of hard border)
- Height from `h-16` to `h-14` (more compact)
- Logo: keep "Xenga" text, ensure `text-accent font-semibold`
- Nav links: active state uses teal underline indicator (2px bottom border) instead of `bg-accent/10` background
- Background: `bg-white/80 backdrop-blur-xl` for glassmorphism
- Health dot: simplify — just the dot, remove the text label on desktop too (cleaner)
- Chain badge: softer styling

Replace the outer `<nav>` element classes:
```tsx
<nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl shadow-sm">
```

Replace `NavLink` component styling:
```tsx
function NavLink({ href, children, active, mobile }: { ... }) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "text-accent"
          : "text-text-secondary hover:text-text-primary"
      } ${mobile ? "block w-full rounded-lg hover:bg-bg-tertiary" : ""}`}
    >
      {children}
      {active && !mobile && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent" />
      )}
    </Link>
  );
}
```

Simplify `HealthDot` — remove text, just show the colored dot with a tooltip:
```tsx
function HealthDot({ status }: { status: boolean | null }) {
  const color = status === null ? "bg-text-tertiary" : status ? "bg-success" : "bg-error";
  const label = status === null ? "Checking..." : status ? "Connected" : "Disconnected";
  return <div className={`h-2 w-2 rounded-full ${color}`} title={label} />;
}
```

**Step 2: Verify in browser**

Run: `cd web && bun run dev`
Check: Landing page navbar — teal logo, underline active states, glassmorphism blur on scroll, subtle shadow

**Step 3: Commit**

```bash
git add web/components/layout/Navbar.tsx
git commit -m "feat(web): redesign navbar — glassmorphism, underline active states, compact height"
```

---

### Task 3: Dashboard Sidebar Redesign

**Files:**
- Modify: `web/components/dashboard/DashboardSidebar.tsx` (197 lines — significant rewrite)

**Step 1: Redesign the sidebar**

Key changes:
- Width: `w-56` → `w-60` (240px, more breathing room)
- Border: remove `border-r border-border-default`, use `shadow-[1px_0_0_0_#e2e8f0]` (hairline shadow)
- Add section labels: "NAVIGATION" above nav items, "SETTINGS" above settings
- Active state: teal left bar (3px) + `bg-accent-light text-accent` background
- "Soon" badges: lighter opacity, more subtle
- Bottom wallet section: show colored circle (first 2 chars of address as background seed) + shorter address + icon-only disconnect
- Mobile header: match navbar height `h-14`, use same glassmorphism

Section labels above nav groups:
```tsx
<p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
  Navigation
</p>
```

Replace `SidebarLink` active state:
```tsx
function SidebarLink({ href, children, active, icon, onClick }: { ... }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-light text-accent font-medium"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
      )}
      {ICONS[icon]}
      {children}
    </Link>
  );
}
```

Desktop sidebar container:
```tsx
<div className="hidden w-60 shrink-0 bg-bg-secondary shadow-[1px_0_0_0_#e2e8f0] lg:block">
```

**Step 2: Verify in browser**

Run: `cd web && bun run dev`
Check: `/dashboard` — sidebar with section labels, teal left-bar active indicators, wider width, no hard border

**Step 3: Commit**

```bash
git add web/components/dashboard/DashboardSidebar.tsx
git commit -m "feat(web): redesign dashboard sidebar — section labels, teal active indicators, subtle shadow"
```

---

### Task 4: Landing Page — Hero Section

**Files:**
- Modify: `web/components/landing/HeroSection.tsx` (156 lines)

**Step 1: Refine the hero**

Key changes:
- Increase section padding: `py-16 md:py-24` → `py-20 md:py-32` (more breathing room)
- Hero badge: use `bg-accent-light text-accent border border-accent-muted` (teal pill)
- Headline: `text-4xl md:text-5xl lg:text-6xl font-semibold` (semibold, not light)
- `.gradient-text` will now use teal gradient (already updated in globals.css)
- Subtitle: `text-lg text-text-secondary max-w-2xl` (constrained width for readability)
- CTA buttons: both use teal (`bg-accent text-white hover:bg-accent-hover`), secondary uses outline (`border border-accent text-accent hover:bg-accent-light`)
- Code block: add `shadow-md` for more depth, keep `panel-surface` class
- Traffic light dots: keep colors (red/yellow/green), make slightly smaller
- Bottom stat cards: add `shadow-sm` and `hover:shadow-md` transition

**Step 2: Verify in browser**

Check: Hero section — teal gradient headline, teal CTAs, elevated code panel

**Step 3: Commit**

```bash
git add web/components/landing/HeroSection.tsx
git commit -m "feat(web): refine hero section — teal palette, semibold heading, elevated code panel"
```

---

### Task 5: Landing Page — Remaining Sections

**Files:**
- Modify: `web/components/landing/ProtocolFlow.tsx` (72 lines)
- Modify: `web/components/landing/DemoCards.tsx` (145 lines)
- Modify: `web/components/landing/HowItWorks.tsx` (141 lines)
- Modify: `web/components/landing/ReputationSection.tsx` (178 lines)
- Modify: `web/components/landing/AdaptabilitySection.tsx` (303 lines)
- Modify: `web/components/landing/Footer.tsx` (155 lines)

**Step 1: Apply consistent section styling to all sections**

Each section should follow this pattern:
- Section wrapper: `py-24` (consistent 96px vertical spacing)
- Section label: `text-xs font-medium uppercase tracking-wider text-accent mb-3`
- Section title: `text-3xl font-semibold text-text-primary mb-4`
- Section subtitle: `text-base text-text-secondary max-w-2xl`
- Cards: `rounded-xl border border-border-default bg-bg-secondary shadow-sm hover:shadow-md transition-shadow`

**Step 2: ProtocolFlow.tsx**
- Increase spacing between step cards
- Add `shadow-sm` to each step card
- Step numbers: `bg-accent-light text-accent` circle

**Step 3: DemoCards.tsx**
- Fix `accent-green` bug → use `success`
- Agent card: use `accent-purple` (now correctly purple)
- Marketplace card: use `accent` (teal)
- Add `shadow-sm hover:shadow-md` to cards
- Arrow indicator: teal color

**Step 4: HowItWorks.tsx**
- Tab underline: `bg-accent` (now teal — auto-updated)
- Code syntax: keywords `text-accent-purple`, types `text-accent`, strings `text-success`
- Code block: add `shadow-sm`

**Step 5: ReputationSection.tsx**
- Card icons: teal/purple/success themed circles
- Signal dots: use `accent`, `accent-purple`, `warning`, `success`
- Cards: consistent `shadow-sm hover:shadow-md`

**Step 6: AdaptabilitySection.tsx**
- Use case cards: teal/purple/success icons
- Tab underline: teal
- Code syntax: same color scheme as HowItWorks

**Step 7: Footer.tsx**
- Subtle top border: `border-t border-border-default`
- "Xenga" brand: `text-accent`
- Contract links: `hover:text-accent`
- Badge: teal for testnet, keep warning for Base Sepolia indicator

**Step 8: Verify all sections in browser**

Run: `cd web && bun run dev`
Scroll through entire landing page — check visual consistency, spacing, shadow depth, teal accent throughout

**Step 9: Commit**

```bash
git add web/components/landing/
git commit -m "feat(web): refine all landing page sections — consistent spacing, shadows, teal palette"
```

---

### Task 6: Shared UI Components

**Files:**
- Modify: `web/components/ui/Badge.tsx` (33 lines)
- Modify: `web/components/ui/AddressDisplay.tsx`
- Modify: `web/components/ui/ReputationBadge.tsx`
- Modify: `web/components/ui/TxLink.tsx`

**Step 1: Update Badge info variant**

The `info` variant currently uses `accent` — this auto-updates to teal. Verify it looks right.

**Step 2: Review all UI components for hardcoded blue references**

Scan for any inline blue colors or classes that won't auto-update from token changes.

**Step 3: Commit**

```bash
git add web/components/ui/
git commit -m "feat(web): update shared UI components for teal design system"
```

---

### Task 7: Playground Pages

**Files:**
- Modify: `web/app/playground/page.tsx` (108 lines)
- Modify: `web/components/marketplace/StepTracker.tsx` (76 lines)
- Modify: `web/components/marketplace/PaymentFlow.tsx` (~1400 lines)
- Modify: `web/components/marketplace/ProductGrid.tsx` (112 lines)
- Modify: `web/components/marketplace/SellerPanel.tsx` (117 lines)
- Modify: `web/components/agent/AgentTerminal.tsx` (1028 lines)
- Modify: `web/components/protocol-inspector/InspectorPanel.tsx` (178 lines)

**Step 1: Playground hub page**

- Demo cards: match new DemoCards landing page style
- Add `shadow-sm hover:shadow-md` transitions

**Step 2: Marketplace components**

- StepTracker: active step uses teal, completed uses `bg-accent-light` checkmark
- PaymentFlow: teal buttons, teal progress indicators
- ProductGrid: product cards with `shadow-sm`, teal selection border
- SellerPanel: consistent card styling

**Step 3: Agent terminal**

- Keep dark terminal background (it's a terminal — dark is correct)
- Update syntax colors: `request` type → teal, `reputation` type → keep violet
- Scenario selector: teal active state

**Step 4: Protocol Inspector**

- Active tab: teal underline
- Tab badges: teal counts
- Panel border: subtle shadow instead of hard border

**Step 5: Verify in browser**

Run: `cd web && bun run dev`
Check `/playground`, `/playground/marketplace`, `/playground/agent`

**Step 6: Commit**

```bash
git add web/app/playground/ web/components/marketplace/ web/components/agent/ web/components/protocol-inspector/
git commit -m "feat(web): apply teal design system to playground and inspector"
```

---

### Task 8: Dashboard Pages

**Files:**
- Modify: `web/components/dashboard/WalletGate.tsx` (122 lines)
- Modify: `web/components/dashboard/StatsRow.tsx` (59 lines)
- Modify: `web/components/dashboard/ActivityFeed.tsx` (76 lines)
- Modify: `web/components/dashboard/OrderTable.tsx` (185 lines)
- Modify: `web/components/dashboard/OrderActions.tsx` (138 lines)
- Modify: `web/components/dashboard/SellerProfile.tsx` (113 lines)
- Modify: `web/components/dashboard/ApiKeyManager.tsx` (210 lines)
- Modify: `web/app/dashboard/page.tsx` (124 lines)

**Step 1: WalletGate**
- Connect button: teal primary (`bg-accent text-white`)
- Card: `shadow-md`, centered vertically
- Error states: keep `text-error`

**Step 2: StatsRow**
- Stat cards: `shadow-sm`, subtle border
- Accent values: teal for positive metrics

**Step 3: ActivityFeed**
- Status dots/labels: use consistent badge styling
- Row hover: `hover:bg-bg-tertiary`

**Step 4: OrderTable**
- Filter tabs: teal active underline (match navbar pattern)
- Table rows: alternating subtle backgrounds or consistent hover
- Expand indicator: teal accent

**Step 5: OrderActions**
- Confirm button: teal primary
- Refund button: outline/secondary style
- Confirmation dialog: cleaner modal styling

**Step 6: SellerProfile + ApiKeyManager**
- Form inputs: teal focus ring (`focus:border-accent focus:ring-1 focus:ring-accent/20`)
- Save/Create buttons: teal primary
- Success messages: `bg-accent-light text-accent border border-accent-muted`
- Key display: monospace, teal-tinted background

**Step 7: Dashboard overview page**
- "Coming soon" placeholder cards: softer styling
- Quick actions: teal-accented

**Step 8: Verify in browser**

Run: `cd web && bun run dev`
Check all dashboard pages: `/dashboard`, `/dashboard/orders`, `/dashboard/settings`, `/dashboard/api-keys`

**Step 9: Commit**

```bash
git add web/components/dashboard/ web/app/dashboard/
git commit -m "feat(web): apply teal design system to dashboard pages"
```

---

## Execution Order

```
Task 1 (foundation) ──→ Task 2 (navbar) ──→ Task 4 (hero) ──→ Task 5 (landing sections) ──→ Task 6 (UI components)
                    └──→ Task 3 (sidebar) ──→ Task 8 (dashboard pages)
                                          ──→ Task 7 (playground)
```

Tasks 2-3 can run in parallel after Task 1.
Tasks 4-8 can run in parallel after their respective dependencies.
Task 1 is the blocker — everything depends on the design tokens being set first.
