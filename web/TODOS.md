# Visual Polish — Deferred Items

## 1. Tracking timeline self-draw animation

**What:** Replace the static `w-px bg-border-default` div connectors in `TrackingStep.tsx` with SVG `<line>` elements that animate via `stroke-dashoffset`, drawing downward as new tracking events appear.

**Why:** The tracking timeline is the second-longest-visible screen in the marketplace demo (after browse). Self-drawing lines + ripple dots + a checkmark in the delivered dot would make this feel substantially more alive. Currently the dots just pop in.

**Context:** `web/components/marketplace/TrackingStep.tsx` renders 4 `TRACKING_EVENTS` with timed delays (0s, 3s, 6s, 9s). Each has a `motion.div` with fade+slide. The connecting line between dots is a plain `<div className="w-px flex-1 bg-border-default" />`. The `animate-pulse-glow` and `animate-draw-check` CSS classes from globals.css can be reused here.

**Depends on:** CSS keyframes from globals.css (draw-check, animate-pulse-glow already exist).

## 2. Agent demo scenario picker cards

**What:** Replace the 4 flat inline scenario buttons in `AgentTerminal.tsx` with a 2x2 grid of visual card-style buttons — each with a colored icon, title, 1-line description, and hover lift animation.

**Why:** The scenario selection is the first interaction in the agent demo. Cards with descriptions help users understand what each scenario demonstrates before clicking. The current buttons are functional but don't communicate what will happen.

**Context:** `web/components/agent/AgentTerminal.tsx` has 4 scenarios: happy (teal), dispute (red), reputation (purple), screening (amber). Each currently renders as a `<button>` with colored border/bg. The card upgrade would use `motion.button` with `whileHover` for lift effect. After selection, cards should collapse and terminal should expand via `AnimatePresence`.

Scenario descriptions:
- Happy: "Watch a successful escrow payment end-to-end"
- Dispute: "See how disputes and arbiter resolution work"
- Reputation: "Watch scores change across 5 rounds"
- Screening: "See agents gated by reputation threshold"

**Depends on:** Nothing — standalone change.

## 3. Buyer dispute management UI

**What:** Build a buyer-facing UI for filing disputes on escrowed orders.

**Why:** Disputes are filed by buyers, not sellers. The current seller dashboard can't support this — a separate buyer surface is needed.

**Context:** Backend is complete (`POST /api/disputes/:orderId` for filing, `POST /api/disputes/:disputeId/resolve` for arbiter resolution). Filing route uses `apiKeyAuth()` — needs `apiKeyOrSessionAuth()` when a buyer surface is built.

**Depends on:** Decision on buyer interaction surface (buyer dashboard vs marketplace playground vs standalone page).

## 4. Webhook per-seller event filtering

**What:** Filter webhook dispatch to only send events for a seller's own escrows.

**Why:** Currently webhook dispatch sends ALL escrow events to all registered webhooks. After adding seller scoping to CRUD, a seller manages their own webhooks but still receives events for all sellers' escrows.

**Context:** Fix requires matching `event.escrowId → order.seller_address → webhook.seller_address` in `webhookService.ts:dispatchWebhookEvent()`.

**Depends on:** Webhook seller scoping (completed).
