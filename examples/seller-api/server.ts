/**
 * Seller API — standalone server providing a paid text analysis endpoint.
 *
 * Demonstrates how any service provider can sell an API behind x402 escrow
 * using the facilitator as the payment backend.
 *
 * Usage:
 *   FACILITATOR_URL=http://localhost:3000 \
 *   SELLER_ADDRESS=0x... \
 *   bun examples/seller-api/server.ts
 */
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { analyzeText } from "./services/analyze.js";

// ──────────────────────── Config ────────────────────────

const PORT = parseInt(process.env.SELLER_PORT || "4000", 10);
const FACILITATOR_URL = (
  process.env.FACILITATOR_URL || "http://localhost:3000"
).replace(/\/$/, "");
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;
const SELLER_API_KEY = process.env.SELLER_API_KEY || ""; // API key for facilitator order creation
const PRICE_USDC = parseFloat(process.env.PRICE_USDC || "0.01");

if (!SELLER_ADDRESS) {
  console.error("SELLER_ADDRESS is required");
  process.exit(1);
}

// ──────────────────────── Paywall Middleware ────────────────────────

/**
 * Map from on-chain orderId (bytes32) to facilitator UUID + creation time.
 * When the client retries with a PAYMENT-SIGNATURE, we extract the orderId
 * from the signed payload and look up the UUID to forward the payment.
 * Entries expire after 15 minutes to prevent memory leaks from abandoned flows.
 */
const orderIdMap = new Map<string, { id: string; createdAt: number }>();
const ORDER_MAP_TTL_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of orderIdMap) {
    if (now - entry.createdAt > ORDER_MAP_TTL_MS) orderIdMap.delete(key);
  }
}, 60_000);

interface PaywallConfig {
  facilitatorUrl: string;
  apiKey: string;
  sellerAddress: string;
  price: number;
  serviceType: string;
  title: string;
}

/**
 * Reusable paywall middleware for any seller endpoint.
 *
 * Flow:
 * 1. No PAYMENT-SIGNATURE header → create order on facilitator → proxy 402 back
 * 2. Has PAYMENT-SIGNATURE header → forward to facilitator → on 200, call next()
 */
function createPaywall(config: PaywallConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader =
      req.headers["payment-signature"] ?? req.headers["x-payment"];

    if (!paymentHeader) {
      // ── No payment: create order and return 402 ──
      try {
        // Create order on facilitator
        const createRes = await fetch(`${config.facilitatorUrl}/api/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { "X-API-KEY": config.apiKey } : {}),
          },
          body: JSON.stringify({
            title: config.title,
            description: config.title,
            price: config.price,
            serviceType: config.serviceType,
            sellerAddress: config.sellerAddress,
          }),
        });

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          console.error("Failed to create order:", err);
          return res.status(502).json({ error: "Failed to create payment order" });
        }

        const order = (await createRes.json()) as {
          id: string;
          orderId: string;
        };

        // Get 402 from facilitator's pay endpoint (no payment header → 402)
        const payRes = await fetch(
          `${config.facilitatorUrl}/api/orders/${order.id}/pay`,
          { method: "POST" }
        );

        if (payRes.status !== 402) {
          // Order might already be paid (idempotent) or error
          if (payRes.ok) {
            return next();
          }
          const err = await payRes.json().catch(() => ({}));
          console.error("Unexpected pay response:", payRes.status, err);
          return res.status(502).json({ error: "Unexpected payment response" });
        }

        // Store mapping: on-chain orderId (bytes32) → facilitator UUID
        orderIdMap.set(order.orderId.toLowerCase(), {
          id: order.id,
          createdAt: Date.now(),
        });

        // Proxy the 402 response back to client with all headers
        const headers: Record<string, string> = {};
        for (const key of [
          "payment-required",
          "x-payment-required",
        ]) {
          const val = payRes.headers.get(key);
          if (val) headers[key] = val;
        }

        const body = await payRes.json().catch(() => ({}));
        return res.status(402).set(headers).json(body);
      } catch (err) {
        console.error("Paywall error:", err);
        return res.status(502).json({ error: "Payment service unavailable" });
      }
    }

    // ── Has payment: forward to facilitator ──
    try {
      const headerValue = Array.isArray(paymentHeader)
        ? paymentHeader[0]
        : (paymentHeader as string);

      // Decode the base64 payload to extract orderId
      const payload = JSON.parse(
        Buffer.from(headerValue, "base64").toString("utf-8")
      );
      const onChainOrderId = (payload.orderId as string)?.toLowerCase();

      if (!onChainOrderId) {
        return res.status(400).json({ error: "Missing orderId in payment payload" });
      }

      const entry = orderIdMap.get(onChainOrderId);
      if (!entry) {
        return res.status(400).json({
          error: "Unknown orderId — payment request must be preceded by a 402",
        });
      }

      // Forward payment to facilitator
      const payRes = await fetch(
        `${config.facilitatorUrl}/api/orders/${entry.id}/pay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": headerValue,
            "X-PAYMENT": headerValue,
          },
        }
      );

      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        console.error("Payment failed:", payRes.status, err);
        return res
          .status(payRes.status)
          .json(err as Record<string, unknown>);
      }

      // Payment succeeded — forward payment response headers
      for (const key of ["payment-response", "x-payment-response"]) {
        const val = payRes.headers.get(key);
        if (val) res.set(key, val);
      }

      // Clean up mapping
      orderIdMap.delete(onChainOrderId);

      // Continue to the actual endpoint handler
      next();
    } catch (err) {
      console.error("Payment processing error:", err);
      return res.status(500).json({ error: "Payment processing failed" });
    }
  };
}

// ──────────────────────── Express App ────────────────────────

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-API-KEY"
  );
  res.set(
    "Access-Control-Expose-Headers",
    "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE"
  );
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Discovery endpoint ──
app.get("/", (_req, res) => {
  res.json({
    name: "Text Analysis API",
    description:
      "Deterministic text analysis: word count, readability, keywords, and more.",
    endpoints: [
      {
        path: "/analyze",
        method: "POST",
        description: "Analyze text content",
        pricing: `${PRICE_USDC} USDC per request`,
        body: { text: "string (required)" },
      },
    ],
    pricing: { currency: "USDC", perRequest: PRICE_USDC },
    sellerAddress: SELLER_ADDRESS,
    paymentProtocol: "x402-escrow",
  });
});

// ── Paid analysis endpoint ──
const analyzePaywall = createPaywall({
  facilitatorUrl: FACILITATOR_URL,
  apiKey: SELLER_API_KEY,
  sellerAddress: SELLER_ADDRESS,
  price: PRICE_USDC,
  serviceType: "tool-call",
  title: "Text Analysis",
});

app.post("/analyze", analyzePaywall, (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing required field: text" });
  }
  if (text.length > 100_000) {
    return res
      .status(400)
      .json({ error: "Text too long (max 100,000 characters)" });
  }

  const result = analyzeText(text);
  res.json(result);
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\nSeller API running on http://localhost:${PORT}`);
  console.log(`  Facilitator:  ${FACILITATOR_URL}`);
  console.log(`  Seller:       ${SELLER_ADDRESS}`);
  console.log(`  Price:        ${PRICE_USDC} USDC per analysis\n`);
  console.log("Endpoints:");
  console.log(`  GET  /         — Discovery`);
  console.log(`  POST /analyze  — Paid text analysis (x402 paywall)\n`);
});
