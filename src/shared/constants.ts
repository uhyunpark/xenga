import { type Chain } from "viem";
import { baseSepolia, base } from "viem/chains";

// ──────────────────────── Chain Configuration ────────────────────────

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  usdcAddress: `0x${string}`;
  /** USDC contract's EIP-712 domain name (varies by chain deployment) */
  usdcDomainName: string;
  defaultRpc: string;
  /** Network name used in xenga payment headers */
  network: string;
  /** Whether this is a testnet (enables faucet, etc.) */
  isTestnet: boolean;
}

/** Known chain configurations */
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  84532: {
    chain: baseSepolia,
    chainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDomainName: "USDC",
    defaultRpc: "https://sepolia.base.org",
    network: "base-sepolia",
    isTestnet: true,
  },
  8453: {
    chain: base,
    chainId: 8453,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDomainName: "USD Coin",
    defaultRpc: "https://mainnet.base.org",
    network: "base",
    isTestnet: false,
  },
};

/**
 * Get chain configuration by chain ID.
 * Returns Base Sepolia config if the chain ID is unknown.
 */
export function getChainConfig(chainId?: number): ChainConfig {
  if (chainId && CHAIN_CONFIGS[chainId]) return CHAIN_CONFIGS[chainId];
  return CHAIN_CONFIGS[84532]; // default: Base Sepolia
}

/**
 * Resolve a network string (from xenga headers) to a chain ID.
 */
export function networkToChainId(network: string): number {
  for (const config of Object.values(CHAIN_CONFIGS)) {
    if (config.network === network) return config.chainId;
  }
  return 84532; // default: Base Sepolia
}

// ──────────────────────── Default Exports (backward compat) ────────────────────────

/** @deprecated Use `getChainConfig()` for configurable chain support */
export const CHAIN: Chain = baseSepolia;
/** @deprecated Use `getChainConfig()` for configurable chain support */
export const CHAIN_ID = 84532;
/** @deprecated Use `getChainConfig()` for configurable chain support */
export const USDC_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const USDC_DECIMALS = 6;

// EIP-712 domain for USDC on Base Sepolia
/** @deprecated Use `getUsdcEip712Domain()` from eip712.ts with explicit chainId */
export const USDC_EIP712_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: CHAIN_ID,
  // verifyingContract is USDC_ADDRESS — set dynamically in signing code
} as const;

/** @deprecated Use `getChainConfig()` for configurable chain support */
export const DEFAULT_RPC = "https://sepolia.base.org";

// Service type constants
export const SERVICE_TYPE_MARKETPLACE = "marketplace";
export const SERVICE_TYPE_AGENT = "agent-service";
export const SERVICE_TYPE_INFERENCE = "inference";
export const SERVICE_TYPE_DATA_PIPELINE = "data-pipeline";
export const SERVICE_TYPE_TOOL_CALL = "tool-call";

// Time constants (seconds)
export const MARKETPLACE_RELEASE_WINDOW = 7 * 24 * 60 * 60; // 7 days
export const MARKETPLACE_DISPUTE_WINDOW = 3 * 24 * 60 * 60; // 3 days
export const AGENT_RELEASE_WINDOW = 60 * 60; // 1 hour
export const INFERENCE_RELEASE_WINDOW = 5 * 60; // 5 minutes
export const DATA_PIPELINE_RELEASE_WINDOW = 60 * 60; // 1 hour
export const TOOL_CALL_RELEASE_WINDOW = 60; // 1 minute

// ──────────────────────── Reputation Thresholds ────────────────────────

export const REPUTATION_HIGH_THRESHOLD = 80;
export const REPUTATION_LOW_THRESHOLD = 40;

// ──────────────────────── Cache & Timing Defaults ────────────────────────

export const REPUTATION_CACHE_TTL_MS = 60_000; // 1 minute
export const REPUTATION_CACHE_MAX_SIZE = 1000;
export const AUTO_VERIFY_DELAY_MS = 5_000; // 5 seconds

// ──────────────────────── Event Listener ────────────────────────

export const EVENT_LISTENER_MAX_RETRIES = 20;
export const EVENT_LISTENER_BASE_BACKOFF_MS = 5_000;
export const EVENT_LISTENER_MAX_BACKOFF_MS = 60_000;
export const EVENT_LISTENER_POLL_INTERVAL_MS = 10_000;
