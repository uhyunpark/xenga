# Seller Dashboard Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

The current seller tab (`/seller`) has an identity crisis. It lives alongside demo pages (Agent, Marketplace) in the same nav but tries to be a real operational tool. Key issues:

- Auth is broken in production — "Confirm Delivery" calls an API-key-protected route without a key
- No seller registration UI (backend endpoint exists, frontend never calls it)
- No order creation or payment link generation
- Earnings are misleading (includes unfinished escrows, ignores fees)
- Anyone can view any seller's orders (no auth on `GET /api/orders?seller=`)
- No refund, dispute visibility, or webhook management

## Solution

A dedicated seller dashboard at `/dashboard` with its own sidebar navigation, wallet-based authentication, and self-service operational tools. The showcase site (demos, landing page) remains separate.

## Audience

Both technical integrators (API-first) and non-technical merchants (dashboard-first), served progressively. The dashboard is useful standalone; API keys are available for programmatic integration.

## Architecture

### Navigation

**Main site nav** replaces "Seller" with "Dashboard →":

```
[Xenga]  Agent  Human Escrow  [Dashboard →]  [Wallet]
```

**Dashboard** uses a sidebar layout:

```
┌──────────────────┬──────────────────────────────────┐
│  Xenga           │                                  │
│                  │  [Page title]      [Wallet pill]  │
│  Overview        │                                  │
│  Orders          │  ┌────────────────────────────┐  │
│  Payment Links*  │  │                            │  │
│  ─────────       │  │   Main content area        │  │
│  Settings        │  │                            │  │
│  API Keys        │  │                            │  │
│  Webhooks*       │  └────────────────────────────┘  │
│                  │                                  │
│  ← Back to site  │                                  │
└──────────────────┴──────────────────────────────────┘

* = "Coming soon" placeholder in v1
```

- Sidebar collapses to hamburger on mobile
- Wallet connection required — unauthenticated users see a connect-wallet gate
- Old `/seller` route redirects to `/dashboard`

### Authentication

Wallet-native. Sellers authenticate by connecting their browser wallet. All dashboard API calls include walletAuth (EIP-191 signature). On-chain actions (confirm delivery, refund) are signed directly by the seller's wallet via `walletClient.writeContract`.

No API keys needed for dashboard usage. API key self-service is available in settings for sellers who also want programmatic access.

## V1 Pages

### Overview (`/dashboard`)

**Stats row** (4 cards):
- Active Escrows — count of orders in `escrowed` status
- Pending Release — count in `delivery_confirmed`
- Net Earnings — total completed payouts (gross - facilitator fees), USDC
- Reputation Score — score/100 with confidence badge

**Recent activity feed:**
- Last 10 order events (created, paid, delivered, completed, disputed, refunded)
- Each row: order title, status change, timestamp, amount
- "View all orders →" link

**Quick actions:**
- "Create Payment Link" → placeholder, links to "Coming soon" page
- "View API Docs" → external link

### Orders (`/dashboard/orders`)

**List view** with status filter tabs: All | Active | Completed | Disputed

**Each order row:** title, amount (USDC), status badge, buyer address (shortened), created date

**Actions** (contextual by status):

| Status | Actions |
|---|---|
| `escrowed` | Confirm Delivery, Refund |
| `delivery_confirmed` | Refund |
| `disputed` | View only |
| `completed` / `auto_released` / `refunded` | View only |

**Action mechanics:**
- Confirm Delivery: seller signs `confirmDelivery(escrowId)` on-chain via browser wallet
- Refund: seller signs `refund(escrowId)` on-chain via browser wallet
- Both show a confirmation modal, then pending state while tx confirms

**Inline detail panel** (click to expand): escrow ID, tx hash, gross amount, fee, net payout

### Settings (`/dashboard/settings`)

- Seller registration: display name (create/update via `POST /api/sellers` with walletAuth)
- Payout address: read-only display of connected wallet address

### API Keys (`/dashboard/api-keys`)

- Generate new API key (wallet-signed request)
- List active keys (masked display, created date, last-used timestamp)
- Revoke a key

## Backend Changes

### New: `seller_api_keys` table

```sql
CREATE TABLE IF NOT EXISTS seller_api_keys (
  id TEXT PRIMARY KEY,
  seller_address TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,    -- first 8 chars for display
  name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
```

### New endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/seller-api-keys` | walletAuth | Generate new API key |
| GET | `/api/seller-api-keys` | walletAuth | List keys for connected wallet |
| DELETE | `/api/seller-api-keys/:id` | walletAuth | Revoke a key |

### Modified endpoints

- `GET /api/orders?seller=` — add walletAuth requirement (verify requester matches `seller` param)
- `POST /api/orders/:id/confirm-delivery` — add walletAuth as alternative to apiKeyAuth
- Add `facilitatorFee` to order API responses for net earnings calculation

## Deferred to V2

- Payment Links page (create/manage shareable checkout URLs)
- Webhooks management page
- Standalone Reputation page with history chart
- Order detail pages (separate route, not inline expand)
- Dispute response UI
- Auto-release countdown display
- Earnings charts / analytics

## File Structure

```
web/app/dashboard/
  layout.tsx            # Sidebar + wallet gate
  page.tsx              # Overview
  orders/page.tsx       # Orders list
  settings/page.tsx     # Profile settings
  api-keys/page.tsx     # API key management

web/components/dashboard/
  DashboardSidebar.tsx
  WalletGate.tsx
  StatsRow.tsx
  ActivityFeed.tsx
  OrderTable.tsx
  OrderActions.tsx      # Confirm delivery + refund via wallet
  ApiKeyManager.tsx
  SellerProfile.tsx
```
