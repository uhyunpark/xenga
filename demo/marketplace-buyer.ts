/**
 * Demo: P2P Marketplace — Buyer
 *
 * 1. Views listing
 * 2. Pays via x402 escrow flow (ERC-3009 gasless)
 * 3. Waits for delivery confirmation
 * 4. Releases funds to seller
 *
 * Usage: BUYER_PRIVATE_KEY=0x... ORDER_ID=... bun demo/marketplace-buyer.ts
 */
import "dotenv/config";
import { createEscrowClient } from "../src/client/index.js";
import type { Hex, Address } from "viem";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY as Hex;
const ORDER_ID = process.env.ORDER_ID;

async function main() {
  if (!BUYER_PRIVATE_KEY) {
    console.error("Set BUYER_PRIVATE_KEY in .env");
    process.exit(1);
  }
  if (!ORDER_ID) {
    console.error("Set ORDER_ID as environment variable");
    process.exit(1);
  }

  console.log("=== P2P Marketplace — Buyer ===\n");

  const client = createEscrowClient({
    privateKey: BUYER_PRIVATE_KEY,
    serverUrl: SERVER_URL,
    usdcAddress: process.env.USDC_ADDRESS as Address | undefined,
  });

  console.log(`Buyer address: ${client.address}\n`);

  // Step 1: View the order
  console.log("1. Viewing order...");
  const order = await client.getOrder(ORDER_ID);
  console.log(`   Title: ${order.title}`);
  console.log(`   Price: ${order.priceUsdc} USDC`);
  console.log(`   Seller: ${order.sellerAddress}`);
  console.log(`   Status: ${order.status}`);

  if (order.status !== "created") {
    console.log("   Order already in progress, skipping payment.");
    return;
  }

  // Step 2: Pay with x402 escrow
  console.log("\n2. Paying with x402 escrow...");
  const { order: paidOrder, payment } = await client.payForOrder(ORDER_ID);
  console.log(`   Payment successful!`);
  console.log(`   TX: ${payment.txHash}`);
  console.log(`   Escrow ID: ${payment.escrowId}`);
  console.log(`   Status: ${paidOrder.status}`);

  // Step 3: Wait for delivery confirmation
  console.log("\n3. Waiting for seller to confirm delivery...");
  let confirmed = false;
  while (!confirmed) {
    await new Promise((r) => setTimeout(r, 3000));
    const updated = await client.getOrder(ORDER_ID);
    if (updated.status === "delivery_confirmed") {
      console.log("   Delivery confirmed by seller!");
      confirmed = true;
    } else {
      process.stdout.write(".");
    }
  }

  // Step 4: Release funds
  console.log("\n4. Releasing funds to seller...");
  const result = await client.releaseEscrow(ORDER_ID);
  console.log(`   ${result.message}`);

  console.log("\n=== Transaction Complete ===");
}

main().catch(console.error);
