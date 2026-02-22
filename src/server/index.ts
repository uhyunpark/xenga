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
import reputationRouter from "./routes/reputation.js";
import webhooksRouter from "./routes/webhooks.js";
import { startEventListener } from "./services/eventListener.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { logger } from "./services/logger.js";
import { startWalletMonitor, getLastWalletStatus } from "./services/walletMonitor.js";
import { startOrderCleanup } from "./services/orderCleanup.js";

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP, X-API-KEY");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE");
  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ──────────── Rate Limiting ────────────

const paymentLimiter = rateLimit({ windowMs: 60_000, max: 20, message: "Too many payment requests" });
const reputationLimiter = rateLimit({ windowMs: 60_000, max: 30, message: "Too many reputation lookups" });
const disputeLimiter = rateLimit({ windowMs: 60_000, max: 10, message: "Too many dispute requests" });
const generalLimiter = rateLimit({ windowMs: 60_000, max: 60 });

// ──────────── Routes ────────────

app.get("/health", (_req, res) => {
  const walletStatus = getLastWalletStatus();
  res.json({
    status: walletStatus?.isLow ? "degraded" : "ok",
    chain: config.chainConfig.network,
    chainId: config.chainConfig.chainId,
    escrowContract: config.escrowVaultAddress,
    operator: walletStatus ? {
      address: walletStatus.address,
      ethBalance: walletStatus.ethBalance,
      isLow: walletStatus.isLow,
      checkedAt: walletStatus.checkedAt,
    } : undefined,
    serviceTypes: getAllServiceTypes().map((st) => ({
      name: st.name,
      releaseWindow: st.releaseWindow,
      autoVerify: st.autoVerify,
      description: st.description,
    })),
  });
});

app.use("/api/orders", paymentLimiter, ordersRouter);
app.use("/api/disputes", disputeLimiter, disputesRouter);
app.use("/api/escrows", generalLimiter, escrowsRouter);
app.use("/api/metrics", generalLimiter, metricsRouter);
app.use("/facilitator", paymentLimiter, facilitatorRouter);
app.use("/api/reputation", reputationLimiter, reputationRouter);
app.use("/api/webhooks", generalLimiter, webhooksRouter);

// ──────────── Start ────────────

const server = app.listen(config.port, () => {
  logger.info("server", `x402 Escrow Server running on http://localhost:${config.port}`);
  logger.info("server", `Escrow Contract: ${config.escrowVaultAddress}`);
  logger.info("server", `USDC: ${config.usdcAddress} | Chain: ${config.chainConfig.network} (${config.chainConfig.chainId})`);
});

// Start event listener for on-chain events
startEventListener();

// Start operator wallet balance monitor
startWalletMonitor();

// Start stuck order cleanup
startOrderCleanup();

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("server", "Shutting down...");
  server.close();
  closeDb();
  process.exit(0);
});
