# Wallet & Navigation Redesign — Design

## Goal

Separate demo and dashboard wallet UX completely. Clean up navigation to reflect the product's two modes: Playground (interactive demos) and Dashboard (seller management).

## Navigation

**Header:** `Xenga` (left) ... `Playground | Dashboard` (right)

- No wallet UI in the header
- Health dot and chain badge remain

**Current → New URL mapping:**
- `/agent` → `/playground/agent`
- `/marketplace` → `/playground/marketplace`
- New: `/playground` — landing page with two demo cards

## Playground (`/playground`)

Landing page with two cards:
- **Agent Service** — short description of the agent demo
- **Human Escrow** — short description of the marketplace demo

Each links to `/playground/agent` or `/playground/marketplace`.

Demo pages manage their own wallet internally:
- "Create Demo Wallet" entry point lives inside the demo page (not the header)
- Demo wallet shared across both demos via sessionStorage (fund once, try both)
- Inline faucet prompt when balance is low
- `WalletProvider` stays at root layout — demos use `useWallet()` as before

## Dashboard (`/dashboard`)

- `WalletGate` requires browser wallet — blocks entry with "Connect Wallet" prompt
- No changes to dashboard internals (orders, settings, API keys)
- Browser wallet connect button lives inside the WalletGate, not the header

## Header Changes

- Remove `WalletSelector` component from `Navbar`
- Replace nav items: `Agent | Human Escrow | Dashboard` → `Playground | Dashboard`
- Keep: health dot, chain badge, mobile hamburger menu

## Landing Page (`/`)

- Keep all existing sections (Hero, ProtocolFlow, DemoCards, HowItWorks, Footer)
- Update DemoCard links from `/agent` and `/marketplace` to `/playground/agent` and `/playground/marketplace`

## Files Affected

- `web/components/layout/Navbar.tsx` — remove WalletSelector, update nav items
- `web/app/playground/page.tsx` — new playground landing page
- `web/app/playground/agent/page.tsx` — move from `web/app/agent/page.tsx`
- `web/app/playground/marketplace/page.tsx` — move from `web/app/marketplace/page.tsx`
- `web/app/playground/marketplace/MarketplacePage.tsx` — move from `web/app/marketplace/`
- `web/app/agent/page.tsx` — redirect to `/playground/agent`
- `web/app/marketplace/page.tsx` — redirect to `/playground/marketplace`
- `web/components/landing/DemoCards.tsx` — update links
- `web/components/ui/WalletSelector.tsx` — can be deleted (no longer used anywhere)
