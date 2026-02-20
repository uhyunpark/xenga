import "dotenv/config";
import type { Address, Hex } from "viem";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_RPC, USDC_ADDRESS } from "../shared/constants.js";

// Deterministic placeholder address for mock mode (no real chain interaction)
const MOCK_ESCROW_VAULT_ADDRESS =
  "0x1111111111111111111111111111111111111111" as Address;

function resolveAddress(
  envValue: string | undefined,
  fallback: Address | undefined
): Address {
  if (envValue && isAddress(envValue)) return envValue;
  if (fallback) return fallback;
  return envValue as Address; // may be invalid; caught by validateConfig()
}

const isMock = process.env.MOCK_CHAIN === "true";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  privateKey: process.env.PRIVATE_KEY as Hex,
  rpcUrl: process.env.BASE_SEPOLIA_RPC || DEFAULT_RPC,
  usdcAddress: resolveAddress(process.env.USDC_ADDRESS, USDC_ADDRESS as Address),
  escrowVaultAddress: resolveAddress(
    process.env.ESCROW_VAULT_ADDRESS,
    isMock ? MOCK_ESCROW_VAULT_ADDRESS : undefined
  ),
  sessionEscrowAddress: process.env.SESSION_ESCROW_ADDRESS as Address | undefined,
  facilitatorUrl: process.env.FACILITATOR_URL as string | undefined,
  feeBps: parseInt(process.env.FEE_BPS || "0", 10),
  flatFee: BigInt(process.env.FEE_FLAT_USDC || "0"),
  feeRecipient: (process.env.FEE_RECIPIENT || undefined) as Address | undefined,
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
  if (!isAddress(config.escrowVaultAddress)) {
    throw new Error(
      `ESCROW_VAULT_ADDRESS "${config.escrowVaultAddress}" is not a valid Ethereum address. ` +
      `Address must be a hex value of 20 bytes (40 hex characters), e.g. 0x1234...abcd`
    );
  }
  if (!isAddress(config.usdcAddress)) {
    throw new Error(
      `USDC_ADDRESS "${config.usdcAddress}" is not a valid Ethereum address. ` +
      `Address must be a hex value of 20 bytes (40 hex characters), e.g. 0x1234...abcd`
    );
  }
  if (config.feeBps < 0 || config.feeBps > 1000) {
    throw new Error("FEE_BPS must be between 0 and 1000 (0-10%)");
  }
  if (config.flatFee < 0n || config.flatFee > 50_000_000n) {
    throw new Error("FEE_FLAT_USDC must be between 0 and 50000000 (0-50 USDC)");
  }
  if ((config.feeBps > 0 || config.flatFee > 0n) && !config.feeRecipient) {
    throw new Error("FEE_RECIPIENT is required when FEE_BPS > 0 or FEE_FLAT_USDC > 0");
  }
}

let _arbiterAddress: Address | undefined;
export function getArbiterAddress(): Address {
  if (!_arbiterAddress) {
    _arbiterAddress = privateKeyToAccount(config.privateKey).address;
  }
  return _arbiterAddress;
}
