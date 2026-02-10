/**
 * Demo: P2P Marketplace — Seller
 *
 * 1. Lists an item for sale
 * 2. Waits for payment (escrow)
 * 3. Confirms delivery
 * 4. Funds released when buyer confirms
 *
 * Usage: bun demo/marketplace-seller.ts
 */
import "dotenv/config";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

async function main() {
  if (!SELLER_ADDRESS) {
    console.error("Set SELLER_ADDRESS in .env");
    process.exit(1);
  }

  console.log("=== P2P Marketplace — Seller ===\n");

  // Step 1: Create a listing
  console.log("1. Creating listing...");
  const createRes = await fetch(`${SERVER_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Vintage Camera — Contax T2",
      description: "Excellent condition, comes with case and strap",
      price: 5.0, // 5 USDC
      serviceType: "marketplace",
      sellerAddress: SELLER_ADDRESS,
    }),
  });

  const order: any = await createRes.json();
  console.log(`   Order created: ${order.id}`);
  console.log(`   Price: ${order.priceUsdc} USDC`);
  console.log(`   Status: ${order.status}`);
  console.log(`\n   Share this order ID with the buyer: ${order.id}\n`);

  // Step 2: Poll for payment
  console.log("2. Waiting for buyer payment...");
  let paid = false;
  while (!paid) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${SERVER_URL}/api/orders/${order.id}`);
    const updated: any = await res.json();
    if (updated.status === "escrowed") {
      console.log(`   Payment received! Buyer: ${updated.buyerAddress}`);
      console.log(`   Escrow ID: ${updated.escrowId}`);
      console.log(`   TX: ${updated.txHash}`);
      paid = true;
    } else {
      process.stdout.write(".");
    }
  }

  // Step 3: Confirm delivery
  console.log("\n3. Confirming delivery...");
  const confirmRes = await fetch(
    `${SERVER_URL}/api/orders/${order.id}/confirm-delivery`,
    { method: "POST" }
  );
  const confirmed: any = await confirmRes.json();
  console.log(`   ${confirmed.message}`);
  console.log(`   Status: ${confirmed.order.status}`);

  // Step 4: Wait for buyer release
  console.log("\n4. Waiting for buyer to release funds...");
  let released = false;
  while (!released) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${SERVER_URL}/api/orders/${order.id}`);
    const updated: any = await res.json();
    if (updated.status === "completed") {
      console.log("   Funds released! Transaction complete.");
      released = true;
    } else if (updated.status === "disputed") {
      console.log("   Buyer filed a dispute!");
      released = true;
    } else {
      process.stdout.write(".");
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
