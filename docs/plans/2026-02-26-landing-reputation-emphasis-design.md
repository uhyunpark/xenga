# Landing Page: Reputation Emphasis Update

**Date:** 2026-02-26
**Goal:** Elevate on-chain reputation to equal prominence with escrow across the landing page.

## Approach: "Weave & Elevate"

Update copy across existing sections, reorder ReputationSection higher, add ProtocolFlow step. No new components.

## Changes

### Hero Section (`HeroSection.tsx`)

- **Badge pill:** "Escrow-Secured Checkout" → "Escrow + Reputation Protocol"
- **Headline:** "On-chain escrow for humans and autonomous agents" → "On-chain escrow and reputation for humans and autonomous agents"
- **Subtext:** "Explore the escrow lifecycle with on-chain settlement, signed USDC authorization, and programmable release logic." → "Escrow settlement and reputation scoring on-chain — every transaction builds a permissionless credit history that shapes future terms." (Mock variant: "Simulated escrow settlement...")
- **Stats row:** Remove `Settlement: Base Sepolia`. Add `Reputation: On-Chain`. Keep other 4 (`Buyer Gas Cost: $0`, `Escrow Visibility: Realtime`, `Authorization: EIP-712`, `Asset: USDC`).

### ProtocolFlow (`ProtocolFlow.tsx`)

Add step 8 after "Release":

| Step | Label | Description |
|---|---|---|
| 8 | Reputation | On-chain reputation score updated |

Use success/green accent color to distinguish as the outcome/reward step.

### DemoCards (`DemoCards.tsx`)

**Agent Service card:**
- Description: → "Autonomous machine-to-machine payments with reputation-gated escrow terms."
- Add highlight: "Reputation updated on completion"

**Human Escrow card:**
- Description: → "Buyer-driven escrow checkout with delivery confirmation, disputes, and reputation tracking."
- Add highlight: "On-chain reputation scoring"

### Section Reorder (`page.tsx`)

Move ReputationSection from position 6 to position 4:

1. HeroSection
2. ProtocolFlow
3. DemoCards
4. **ReputationSection** (was 6)
5. HowItWorks
6. AdaptabilitySection
7. Footer

### Footer (`Footer.tsx`)

Tagline: "Agentic payments with on-chain escrow protection." → "Agentic payments with on-chain escrow and reputation."
