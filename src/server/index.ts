import express from "express";
import { config, validateConfig } from "./config.js";
import { getDb, closeDb } from "./db/index.js";
import {
  registerServiceType,
  getAllServiceTypes,
} from "./service-types/index.js";
import { marketplaceServiceType } from "./service-types/marketplace.js";
import { agentServiceType } from "./service-types/agent-service.js";
import ordersRouter from "./routes/orders.js";
import disputesRouter from "./routes/disputes.js";
import escrowsRouter from "./routes/escrows.js";
import metricsRouter from "./routes/metrics.js";
import { startEventListener } from "./services/eventListener.js";

// ──────────── Bootstrap ────────────

validateConfig();

// Register service types
registerServiceType(marketplaceServiceType);
registerServiceType(agentServiceType);

// Initialize DB
getDb();

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP");
  res.setHeader("Access-Control-Expose-Headers", "X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE");
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

// ──────────── Start ────────────

const server = app.listen(config.port, () => {
  console.log(`
  x402 Escrow Server running on http://localhost:${config.port}

  Escrow Contract: ${config.escrowVaultAddress}
  USDC:            ${config.usdcAddress}
  Chain:           Base Sepolia (84532)

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
