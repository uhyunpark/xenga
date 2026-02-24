# @x402/server

Server SDK for x402 escrow payments — middleware, service type registry, and facilitator dispatch. Framework-agnostic core with Express and Next.js adapters.

## Install

```bash
npm install @x402/server viem
```

## Quick start

### Express middleware

```ts
import express from "express";
import { escrowPaymentMiddleware } from "@x402/server/express";

const app = express();

// Protect any route with x402 escrow payments
app.post("/api/premium",
  escrowPaymentMiddleware({
    facilitatorUrl: "https://facilitator.example.com",
    price: "5000000",        // 5 USDC (6 decimals)
    sellerAddress: "0x...",
    serviceType: "agent-service",
  }),
  (req, res) => {
    // Only reached after payment is verified and settled on-chain
    res.json({ data: "premium content" });
  }
);
```

### Next.js Route Handler

```ts
import { handleEscrowPayment, toNextResponse } from "@x402/server/nextjs";

export async function POST(request: Request) {
  const result = await handleEscrowPayment(request, {
    facilitatorUrl: "https://facilitator.example.com",
    price: "5000000",
    sellerAddress: "0x...",
    serviceType: "marketplace",
  });

  if (result.status === 402) return toNextResponse(result);

  // Payment verified — return content
  return Response.json({ data: "premium content" });
}
```

### Framework-agnostic core

```ts
import { processEscrowPayment } from "@x402/server";
import type { PaymentContext, PaymentDeps } from "@x402/server";

const result = await processEscrowPayment(context, deps);
// result.status: 200 | 402 | 400 | 500
// result.headers: Record<string, string>
// result.body: object
```

## Service types

Built-in service types define escrow parameters per use case:

```ts
import {
  registerServiceType,
  marketplaceServiceType,
  agentServiceType,
} from "@x402/server";

// Register built-ins
registerServiceType(marketplaceServiceType);  // 7-day release window
registerServiceType(agentServiceType);        // 1-hour release window

// Register custom service type
registerServiceType({
  name: "saas-subscription",
  defaultReleaseWindow: 86400,  // 1 day
  autoVerify: false,
  adjustParams(params, reputation) {
    // Shorten window for high-trust counterparties
    if (reputation?.seller?.score > 80) {
      params.releaseWindow = 43200; // 12 hours
    }
    return params;
  },
});
```

## Exports

| Import path | Contents |
|-------------|----------|
| `@x402/server` | `processEscrowPayment`, service type registry, facilitator dispatch |
| `@x402/server/express` | `escrowPaymentMiddleware` for Express |
| `@x402/server/nextjs` | `handleEscrowPayment`, `toNextResponse` for Next.js |

## Peer dependencies

- `viem` ^2.21.0
- `express` ^4.18.0 || ^5.0.0 (optional — only needed for Express adapter)
