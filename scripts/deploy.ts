#!/usr/bin/env bun
/**
 * Deploy contracts to Base Sepolia or local Anvil.
 *
 * Usage:
 *   bun run deploy              # Base Sepolia
 *   bun run deploy:local        # Local Anvil (localhost:8545)
 *
 * Loads .env automatically. Validates required env vars before running forge.
 */
import { resolve } from "path";
import { existsSync } from "fs";
import { config } from "dotenv";

const ROOT = resolve(import.meta.dir, "..");
const CONTRACTS = resolve(ROOT, "contracts");

// --- Load .env from project root ---
const envPath = resolve(ROOT, ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
}

// --- Parse args ---
const isLocal = process.argv.includes("--local");

// --- Validate ---
if (!isLocal && !process.env.PRIVATE_KEY) {
  console.error(
    "\x1b[31mError: PRIVATE_KEY is not set.\x1b[0m\n" +
      "Set it in .env or export it:\n" +
      "  export PRIVATE_KEY=0x...\n"
  );
  process.exit(1);
}

// --- Build forge command ---
const script = isLocal ? "script/DeployLocal.s.sol" : "script/Deploy.s.sol";
const rpcUrl = isLocal
  ? "http://localhost:8545"
  : process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";

const args = [
  "script",
  script,
  "--fork-url",
  rpcUrl,
  "--broadcast",
];

// For testnet deploy, add --verify if ETHERSCAN_API_KEY is set
if (!isLocal && process.env.ETHERSCAN_API_KEY) {
  args.push("--verify");
}

console.log(`\n\x1b[36m=== Deploying to ${isLocal ? "Local Anvil" : "Base Sepolia"} ===\x1b[0m`);
console.log(`RPC:    ${rpcUrl}`);
console.log(`Script: ${script}`);
if (!isLocal) {
  console.log(`Key:    ${process.env.PRIVATE_KEY!.slice(0, 6)}...${process.env.PRIVATE_KEY!.slice(-4)}`);
}
console.log();

// --- Run forge ---
const proc = Bun.spawn(["forge", ...args], {
  cwd: CONTRACTS,
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    // Ensure forge's vm.envUint/vm.envOr can read these
  },
});

const exitCode = await proc.exited;
process.exit(exitCode);
