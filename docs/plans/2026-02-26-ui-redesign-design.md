# UI Redesign — Elevated Polish

**Date:** 2026-02-26
**Scope:** Landing page → Playground → Dashboard (in order)
**Approach:** Keep all existing sections/content, apply complete visual reskin with new design system

## Decisions

- **Light mode only** — no dark mode
- **Audience:** All (developers, sellers/buyers, investors)
- **References:** Stripe, Privy.io — modern SaaS aesthetic in light mode
- **Approach A: "Elevated Polish"** — same structure, dramatically better visual quality
- **Priority areas:** Navbar and Dashboard Sidebar get extra design attention
- **Keep all landing page sections**, make each one look significantly better

## Design System

### Color Palette (Teal-anchored)

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#0D9488` (teal-600) | Primary brand, CTAs, links |
| `--accent-hover` | `#0F766E` (teal-700) | Hover/pressed states |
| `--accent-light` | `#CCFBF1` (teal-50) | Active nav backgrounds, subtle highlights |
| `--accent-muted` | `#99F6E4` (teal-200) | Badges, light accents |
| `--bg-primary` | `#F8FAFB` | Page background (warm, barely teal-tinted) |
| `--bg-secondary` | `#FFFFFF` | Cards, panels |
| `--bg-tertiary` | `#F1F5F9` (slate-100) | Hover backgrounds, secondary surfaces |
| `--text-primary` | `#0F172A` | Headings, body text |
| `--text-secondary` | `#475569` | Secondary text |
| `--text-tertiary` | `#64748B` | Tertiary/muted text |
| `--border-default` | `#E2E8F0` (slate-200) | Softer borders |
| `--border-active` | `#5EEAD4` (teal-300) | Focus rings, active borders |
| `--success` | `#16A34A` | Keep |
| `--warning` | `#D97706` | Keep |
| `--error` | `#DC2626` | Keep |
| `--violet` | `#8B5CF6` | Keep |

### Typography

- **Body:** Inter (swap from Coinbase Sans) — de facto SaaS standard
- **Mono:** JetBrains Mono (swap from Coinbase Mono) — better code readability
- **Scale:** Hero h1 `text-5xl font-semibold`, section h2 `text-3xl font-semibold`, body `text-sm`/`text-base`, labels `text-xs font-medium tracking-wide uppercase`

### Shadows (Stripe-style layered)

```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04)
--shadow-md: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)
--shadow-lg: 0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)
```

### Spacing

- Strict 4/8/12/16/24/32/48/64/96 scale
- Major landing page sections: `py-24` (96px) consistent spacing
- Border radius: 8px (buttons/badges), 12px (cards), 16px (large panels)

## Component Designs

### Navbar (Extra Attention)

- Clean horizontal bar, no heavy borders — use subtle `shadow-sm` instead of `border-b`
- Logo: "Xenga" in font-semibold teal, no icon
- Nav links: `text-sm font-medium`, teal underline indicator on active (not bg highlight)
- Right side: chain badge (subtle pill), health dot, mobile hamburger
- Height: `h-14` (56px) — slightly more compact
- Background: `bg-white/80 backdrop-blur-xl` — glassmorphism on scroll

### Dashboard Sidebar (Extra Attention)

- Width: `w-60` (240px) — slightly wider for breathing room
- No border-right — use subtle shadow instead: `shadow-[1px_0_0_0_rgba(0,0,0,0.04)]`
- Logo area: `h-14` matching navbar, teal "Xenga" wordmark
- Nav items: `rounded-lg` with `bg-accent-light text-accent` for active, `text-text-secondary` for inactive
- Active indicator: left teal bar (3px rounded) in addition to background highlight
- Section labels: `text-[11px] font-medium uppercase tracking-wider text-text-tertiary` above groups
- "Coming soon" items: lighter opacity with subtle "Soon" badge
- Bottom: wallet address with avatar circle (jazzicon-style colored dot), disconnect as icon-only
- Mobile: slide-in overlay with backdrop blur

### Landing Page Sections

All sections keep current content but get:
- Doubled whitespace between sections
- Consistent heading hierarchy (uppercase label → h2 → subtitle)
- Softer card styling with layered shadows
- Teal accent color throughout
- Code blocks with teal-themed syntax highlighting
- Gradient text using teal spectrum for hero h1

### Playground Pages

- Same teal design system applied
- Step tracker: teal active states
- Terminal: keep dark terminal aesthetic but use teal for highlights
- Inspector: teal tab indicators

### Dashboard Pages

- StatsRow cards: subtle shadow, teal accent for key numbers
- OrderTable: cleaner row styling, teal status badges
- Forms: teal focus rings, refined input styling
