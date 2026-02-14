import "dotenv/config";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_RPC, USDC_ADDRESS } from "../shared/constants.js";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  privateKey: process.env.PRIVATE_KEY as Hex,
  rpcUrl: process.env.BASE_SEPOLIA_RPC || DEFAULT_RPC,
  usdcAddress: (process.env.USDC_ADDRESS || USDC_ADDRESS) as Address,
  escrowVaultAddress: process.env.ESCROW_VAULT_ADDRESS as Address,
  sessionEscrowAddress: process.env.SESSION_ESCROW_ADDRESS as Address | undefined,
  facilitatorUrl: process.env.FACILITATOR_URL as string | undefined,
};

export function validateConfig() {
  if (!config.privateKey) {
    throw new Error("PRIVATE_KEY is required in .env");
  }
  if (!config.privateKey.startsWith("0x") || config.privateKey.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(config.privateKey)) {
    throw new Error("PRIVATE_KEY must be a valid 32-byte hex string starting with 0x (66 characters total)");
  }
  if (!config.escrowVaultAddress) {
    throw new Error("ESCROW_VAULT_ADDRESS is required in .env");
  }
}

let _arbiterAddress: Address | undefined;
export function getArbiterAddress(): Address {
  if (!_arbiterAddress) {
    _arbiterAddress = privateKeyToAccount(config.privateKey).address;
  }
  return _arbiterAddress;
}
