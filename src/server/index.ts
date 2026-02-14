import express from "express";
import { config, validateConfig } from "./config.js";
import { getDb, closeDb } from "./db/index.js";
import {
  registerServiceType,
  getAllServiceTypes,
} from "./service-types/index.js";
import { registerScheme } from "../shared/schemes.js";
import { marketplaceServiceType } from "./service-types/marketplace.js";
import { agentServiceType } from "./service-types/agent-service.js";
import { escrowScheme } from "./schemes/escrow.js";
import ordersRouter from "./routes/orders.js";
import disputesRouter from "./routes/disputes.js";
import escrowsRouter from "./routes/escrows.js";
import metricsRouter from "./routes/metrics.js";
import facilitatorRouter from "./routes/facilitator.js";
import sessionsRouter from "./routes/sessions.js";
import { startEventListener } from "./services/eventListener.js";

// ──────────── Bootstrap ────────────

validateConfig();

// Register service types
registerServiceType(marketplaceServiceType);
registerServiceType(agentServiceType);

// Register payment schemes
registerScheme(escrowScheme);

// Initialize DB
getDb();

const app = express();
app.use(express.json());

// CORS (includes both standard and legacy x402 headers)
app.use((_req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-SESSION-ID, X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, X-SESSION-BALANCE");
  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ──────────── Routes ────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    chain: "base-sepolia",
    escrowContract: config.escrowVaultAddress,
    sessionContract: config.sessionEscrowAddress ?? null,
    serviceTypes: getAllServiceTypes().map((st) => ({
      name: st.name,
      releaseWindow: st.releaseWindow,
      autoVerify: st.autoVerify,
      description: st.description,
    })),
  });
});

app.use("/api/orders", ordersRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/escrows", escrowsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/facilitator", facilitatorRouter);
app.use("/api/sessions", sessionsRouter);

// ──────────── Start ────────────

const server = app.listen(config.port, () => {
  console.log(`
  x402 Escrow Server running on http://localhost:${config.port}

  Escrow Contract:  ${config.escrowVaultAddress}
  Session Contract: ${config.sessionEscrowAddress ?? "not configured"}
  USDC:             ${config.usdcAddress}
  Chain:            Base Sepolia (84532)
  Facilitator:      ${config.facilitatorUrl ?? "internal"}

  Endpoints:
    GET  /health
    GET  /api/orders
    POST /api/orders
    POST /api/orders/:id/pay          (x402 escrow flow)
    POST /api/disputes/:orderId/dispute
    GET  /api/disputes
    POST /api/disputes/:disputeId/resolve  (auth required)
    GET  /api/escrows/:escrowId
    GET  /api/metrics/disputes
    POST /facilitator/verify
    POST /facilitator/settle
    POST /api/sessions/use            (session micropayment)
    GET  /api/sessions/:sessionId
    POST /api/sessions/:sessionId/settle
  `);
});

// Start event listener for on-chain events
startEventListener();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close();
  closeDb();
  process.exit(0);
});
