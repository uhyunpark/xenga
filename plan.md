# SEO Improvements Plan for demo-web

## Current State

The demo-web Next.js 15 app has **minimal SEO**: just a basic `title` and `description` in the root `layout.tsx`. There are no OpenGraph tags, no Twitter cards, no sitemap, no robots.txt, no favicon, no structured data, no page-level metadata, and no `public/` directory.

---

## Plan

### 1. Enhance root metadata in `app/layout.tsx`

Expand the existing `metadata` export with:

- **`metadataBase`** — canonical base URL via `process.env.NEXT_PUBLIC_BASE_URL` with a sensible fallback (e.g. `http://localhost:3000`)
- **`openGraph`** — `title`, `description`, `siteName: "Zenga"`, `type: "website"`, `locale: "en_US"`
- **`twitter`** — `card: "summary"` (not `summary_large_image` since we have no OG image), `title`, `description`
- **`robots`** — `index: true, follow: true`
- **`authors`** / **`creator`** — project attribution

Note: `keywords` meta tag is intentionally omitted — Google ignores it and it provides no ranking benefit.

### 2. Add page-level metadata for `/marketplace` and `/agent`

Both pages currently have `"use client"` at the top, which prevents exporting `metadata` (a server-only API). The standard Next.js pattern: split each into a thin server-component `page.tsx` wrapper + a client component.

**Marketplace:**
- Rename existing `app/marketplace/page.tsx` → `app/marketplace/MarketplacePage.tsx` (keep `"use client"` and all existing code)
- New `app/marketplace/page.tsx`: exports `metadata` (`title: "Marketplace Demo — Zenga"`, marketplace-specific description + OG/twitter) and renders `<MarketplacePage />`

**Agent:**
- Rename existing `app/agent/page.tsx` → `app/agent/AgentPage.tsx` (keep `"use client"` and all existing code)
- New `app/agent/page.tsx`: exports `metadata` (`title: "Agent Service Demo — Zenga"`, agent-specific description + OG/twitter) and renders `<AgentPage />`

### 3. Add `app/sitemap.ts`

Static sitemap using Next.js `MetadataRoute.Sitemap`:

```
/              priority: 1.0   changeFrequency: weekly
/marketplace   priority: 0.8   changeFrequency: weekly
/agent         priority: 0.8   changeFrequency: weekly
```

Uses `metadataBase` or env var for the URL prefix.

### 4. Add `app/robots.ts`

Using Next.js `MetadataRoute.Robots`:
- Allow all user agents on `/`
- Disallow `/api/*` (API routes should not be indexed)
- Reference the sitemap URL

### 5. Add favicon

Create `app/icon.svg` — a simple SVG favicon with an escrow/shield motif in the app's accent color scheme. Next.js auto-discovers `icon.svg` in the `app/` directory and serves it as the favicon with correct headers.

Skip `apple-icon.png` for now — generating a real PNG requires design tooling or `ImageResponse` overhead. Can be added later.

### 6. Add `app/manifest.ts`

Web app manifest via Next.js `MetadataRoute.Manifest`:
- `name: "Zenga"`, `short_name: "Zenga"`
- `description` matching the root metadata
- `start_url: "/"`, `display: "standalone"`
- `theme_color` and `background_color` matching the dark theme (`#0a0a0f` / `#12121a`)

### 7. Add JSON-LD structured data to the landing page

Add a `<script type="application/ld+json">` block to `app/page.tsx`:
- `@type: "WebApplication"`
- `name`, `description`, `url`, `applicationCategory: "DeveloperApplication"`
- `operatingSystem: "Web"`

The landing page is already a server component, so this is a simple inline script addition.

### 8. Minor config tweaks in `next.config.ts`

- **`poweredByHeader: false`** — removes `X-Powered-By: Next.js` header (security hygiene, minor Lighthouse benefit)

Note: Security headers (X-Frame-Options, CSP, etc.) are out of scope — they improve Lighthouse scores but aren't SEO per se.

---

## Files to Create/Modify

| File | Action | Details |
|------|--------|---------|
| `demo-web/app/layout.tsx` | **Modify** | Expand `metadata` with OG, twitter, robots, metadataBase |
| `demo-web/app/marketplace/MarketplacePage.tsx` | **Create** | Move existing client component here (rename, no code changes) |
| `demo-web/app/marketplace/page.tsx` | **Rewrite** | Server wrapper: metadata export + `<MarketplacePage />` |
| `demo-web/app/agent/AgentPage.tsx` | **Create** | Move existing client component here (rename, no code changes) |
| `demo-web/app/agent/page.tsx` | **Rewrite** | Server wrapper: metadata export + `<AgentPage />` |
| `demo-web/app/page.tsx` | **Modify** | Add JSON-LD structured data script |
| `demo-web/app/sitemap.ts` | **Create** | Static sitemap for 3 pages |
| `demo-web/app/robots.ts` | **Create** | Allow public pages, disallow `/api/*` |
| `demo-web/app/icon.svg` | **Create** | SVG favicon |
| `demo-web/app/manifest.ts` | **Create** | Web app manifest |
| `demo-web/next.config.ts` | **Modify** | Add `poweredByHeader: false` |

**Total: 6 modified/rewritten, 5 new files**

## Out of Scope

- **OG image generation** (`opengraph-image.tsx`) — requires design assets; upgrade twitter card to `summary_large_image` when added
- **`apple-icon.png`** — needs `ImageResponse` or design tooling
- **`keywords` meta tag** — Google ignores it
- **Security headers** (CSP, X-Frame-Options) — not SEO, separate concern
- **Analytics / Search Console** — deployment-dependent
- **i18n** — single-language project
- **Performance** (image optimization, font subsetting) — separate concern
