import { type Chain } from "viem";
import { baseSepolia } from "viem/chains";

export const CHAIN: Chain = baseSepolia;
export const CHAIN_ID = 84532;

// Base Sepolia USDC (Circle testnet)
export const USDC_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const USDC_DECIMALS = 6;

// EIP-712 domain for USDC on Base Sepolia
export const USDC_EIP712_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  // verifyingContract is USDC_ADDRESS — set dynamically in signing code
} as const;

export const DEFAULT_RPC = "https://sepolia.base.org";

// Service type constants
export const SERVICE_TYPE_MARKETPLACE = "marketplace";
export const SERVICE_TYPE_AGENT = "agent-service";

// Time constants (seconds)
export const MARKETPLACE_RELEASE_WINDOW = 7 * 24 * 60 * 60; // 7 days
export const MARKETPLACE_DISPUTE_WINDOW = 3 * 24 * 60 * 60; // 3 days
export const AGENT_RELEASE_WINDOW = 60 * 60; // 1 hour

// Session constants
export const SERVICE_TYPE_SESSION = "session-api";
export const DEFAULT_SESSION_DURATION = 60 * 60; // 1 hour
export const DEFAULT_SESSION_DEPOSIT = 10_000000; // 10 USDC
export const SESSION_PRICE_PER_USE = 100000; // 0.10 USDC per API call

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
