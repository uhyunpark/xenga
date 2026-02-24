/**
 * Demo: AI Agent Commerce
 *
 * An AI agent autonomously:
 * 1. Discovers an API service
 * 2. Creates an order
 * 3. Pays via x402 escrow (gasless ERC-3009)
 * 4. Receives the service
 * 5. Auto-verifies delivery
 * 6. Releases funds (or waits for 1hr auto-release)
 *
 * Usage: AGENT_PRIVATE_KEY=0x... bun demo/agent-service.ts
 */
import "dotenv/config";
import { createEscrowClient } from "../src/client/index.js";
import type { Hex, Address } from "viem";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex;
const SERVICE_PROVIDER = process.env.SERVICE_PROVIDER as Address;

async function main() {
  if (!AGENT_PRIVATE_KEY) {
    console.error("Set AGENT_PRIVATE_KEY in .env");
    process.exit(1);
  }
  if (!SERVICE_PROVIDER) {
    console.error("Set SERVICE_PROVIDER address in .env");
    process.exit(1);
  }

  console.log("=== AI Agent Commerce Demo ===\n");

  const agent = createEscrowClient({
    privateKey: AGENT_PRIVATE_KEY,
    serverUrl: SERVER_URL,
    usdcAddress: process.env.USDC_ADDRESS as Address | undefined,
    escrowVaultAddress: process.env.ESCROW_VAULT_ADDRESS as Address | undefined,
  });

  console.log(`Agent address: ${agent.address}\n`);

  // Step 1: Agent discovers and orders an API service
  console.log("1. Creating service order...");
  const createRes = await fetch(`${SERVER_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "GPT-4 API Credit Pack — 100k tokens",
      description: "100,000 tokens of GPT-4 API access",
      price: 2.0, // 2 USDC
      serviceType: "agent-service",
      sellerAddress: SERVICE_PROVIDER,
    }),
  });
  const order: any = await createRes.json();
  console.log(`   Order: ${order.id}`);
  console.log(`   Service: ${order.title}`);
  console.log(`   Price: ${order.priceUsdc} USDC`);
  console.log(`   Release window: 1 hour (auto-release)`);

  // Step 2: Pay via x402 escrow
  console.log("\n2. Paying via x402 escrow...");
  const { order: paidOrder, payment } = await agent.payForOrder(order.id);
  console.log(`   TX: ${payment.txHash}`);
  console.log(`   Escrow ID: ${payment.escrowId}`);

  // Step 3: Simulate receiving the service
  console.log("\n3. Receiving API service...");
  await new Promise((r) => setTimeout(r, 1000)); // Simulate API call
  console.log("   API tokens received and validated");

  // Step 4: Auto-verify delivery
  console.log("\n4. Auto-verifying delivery...");
  // In the agent-service type, delivery is auto-verified
  // The agent can immediately release funds
  console.log("   Delivery auto-verified (agent-service type)");

  // Step 5: Release funds immediately (don't wait for 1hr auto-release)
  console.log("\n5. Releasing funds to service provider...");
  if (payment.escrowId) {
    const txHash = await agent.releaseOnChain(payment.escrowId);
    console.log(`   Released on-chain: ${txHash}`);
  }

  // Step 6: Verify final state
  console.log("\n6. Final state check...");
  const finalOrder = await agent.getOrder(order.id);
  console.log(`   Order status: ${finalOrder.status}`);

  if (payment.escrowId) {
    const escrow = await agent.getEscrow(payment.escrowId);
    console.log(`   Escrow state: ${escrow.state}`);
  }

  console.log("\n=== Agent Commerce Complete ===");
  console.log("Full cycle: discover → pay → receive → verify → release");
  console.log("No human intervention required!");
}

main().catch(console.error);
