import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  type Address,
  type Chain,
  type Hex,
  type Hash,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../shared/constants.js";
import type {
  EscrowPaymentResponse,
  OnChainEscrow,
  Order,
  ReputationScore,
  Stats,
} from "../shared/types.js";
import { NetworkError } from "../shared/errors.js";
import { isRetryableError, withRetry, type RetryOptions } from "../shared/retry.js";
import { escrowVaultAbi } from "../shared/abi.js";
import { escrowFetch } from "./escrowFetch.js";

export { signEscrowPayment } from "./escrowScheme.js";
export { escrowFetch } from "./escrowFetch.js";
export type { EscrowFetchOptions } from "./escrowFetch.js";
export { withRetry, isRetryableError } from "../shared/retry.js";
export type { RetryOptions } from "../shared/retry.js";

export interface EscrowClientConfig {
  /** Private key for signing transactions. Provide this OR walletClient. */
  privateKey?: Hex;
  /** Pre-configured WalletClient. Provide this OR privateKey. */
  walletClient?: WalletClient;
  serverUrl: string;
  rpcUrl?: string;
  usdcAddress?: Address;
  /** Required for direct on-chain calls (releaseOnChain, disputeOnChain, etc.) */
  escrowVaultAddress?: Address;
  /** Chain ID (default: 84532 for Base Sepolia). Use 8453 for Base Mainnet. */
  chainId?: number;
  /** Retry options for on-chain write operations (default: 3 retries with exponential backoff) */
  retryOptions?: RetryOptions;
}

// ──────────────────────── API Response Types ────────────────────────

interface OrderWithPrice extends Omit<Order, "price"> {
  price: string;
  priceUsdc: number;
}

interface PayForOrderResponse {
  order: OrderWithPrice;
  payment: EscrowPaymentResponse;
}

interface DisputeResponse {
  message: string;
  disputeId: string;
}

interface ApiErrorBody {
  error?: string;
}

// ──────────────────────── Client ────────────────────────

/** Helper to perform a fetch with error wrapping */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new NetworkError(
      `Failed to reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }
}

/**
 * Create a xenga escrow client.
 *
 * Supports both buyer and seller operations. Provide either `privateKey` or
 * a pre-configured `walletClient`. Set `chainId` to target different chains.
 */
export function createEscrowClient(config: EscrowClientConfig) {
  if (!config.privateKey && !config.walletClient) {
    throw new Error("Either privateKey or walletClient must be provided");
  }

  const chainConfig = getChainConfig(config.chainId);
  const chain: Chain = chainConfig.chain;

  let walletClient: WalletClient;
  let address: Address;

  if (config.walletClient) {
    walletClient = config.walletClient;
    if (!walletClient.account) throw new Error("WalletClient must have an account");
    address = walletClient.account.address;
  } else {
    const account = privateKeyToAccount(config.privateKey!);
    address = account.address;
    walletClient = createWalletClient({
      chain,
      transport: http(config.rpcUrl ?? chainConfig.defaultRpc),
      account,
    });
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl ?? chainConfig.defaultRpc),
  });

  const baseUrl = config.serverUrl.replace(/\/$/, "");
  const retryOpts = config.retryOptions ?? {};

  /** Pre-check that the wallet has enough ETH for gas */
  async function ensureBalance(): Promise<void> {
    if (!config.escrowVaultAddress) {
      throw new Error("escrowVaultAddress is required for on-chain calls");
    }
    const balance = await publicClient.getBalance({ address });
    if (balance < 1_000_000_000_000_000n) {
      throw new Error(
        `Insufficient ETH for gas. Balance: ${formatEther(balance)} ETH. ` +
        `Fund ${address} with at least 0.001 ETH to submit transactions.`
      );
    }
  }

  /** Write to contract with retry + optional receipt waiting */
  async function writeWithRetry(
    functionName: string,
    args: unknown[],
    waitForReceipt: boolean
  ): Promise<Hash> {
    await ensureBalance();
    const txHash = await withRetry(
      () =>
        walletClient.writeContract({
          chain,
          account: walletClient.account!,
          address: config.escrowVaultAddress!,
          abi: escrowVaultAbi,
          functionName,
          args,
        } as Parameters<typeof walletClient.writeContract>[0]),
      retryOpts
    );
    if (waitForReceipt) {
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    }
    return txHash;
  }

  return {
    address,
    walletClient,

    /**
     * Pay for an order using xenga escrow flow
     */
    async payForOrder(orderId: string): Promise<PayForOrderResponse> {
      const { response, payment } = await escrowFetch(
        `${baseUrl}/api/orders/${orderId}/pay`,
        { method: "POST" },
        { walletClient, usdcAddress: config.usdcAddress }
      );

      const body = (await response.json()) as PayForOrderResponse & ApiErrorBody;
      if (!response.ok) {
        throw new Error(`Payment failed: ${body.error ?? response.statusText}`);
      }

      return { order: body.order, payment: payment ?? body.payment };
    },

    /**
     * File a dispute
     */
    async disputeEscrow(orderId: string, reason: string): Promise<DisputeResponse> {
      const response = await apiFetch(
        `${baseUrl}/api/disputes/${orderId}/dispute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      const body = (await response.json()) as DisputeResponse & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return { message: body.message, disputeId: body.disputeId };
    },

    /**
     * Get order details
     */
    async getOrder(orderId: string): Promise<OrderWithPrice> {
      const response = await apiFetch(`${baseUrl}/api/orders/${orderId}`);
      const body = (await response.json()) as OrderWithPrice & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return body;
    },

    /**
     * Get on-chain escrow details
     */
    async getEscrow(escrowId: number): Promise<OnChainEscrow> {
      const response = await apiFetch(`${baseUrl}/api/escrows/${escrowId}`);
      const body = (await response.json()) as OnChainEscrow & ApiErrorBody;
      if (!response.ok) {
        throw new Error((body as ApiErrorBody).error ?? response.statusText);
      }
      return body;
    },

    // ──────────── On-chain calls (buyer + seller) ────────────

    /**
     * Release funds on-chain directly (buyer calls releaseFunds).
     * Pre-checks ETH balance. Retries on transient failures.
     * @param waitForReceipt If true (default), waits for on-chain confirmation before returning.
     */
    async releaseOnChain(escrowId: number, waitForReceipt = true): Promise<Hash> {
      return writeWithRetry("releaseFunds", [BigInt(escrowId)], waitForReceipt);
    },

    /**
     * Dispute on-chain directly (buyer calls dispute).
     * Pre-checks ETH balance. Retries on transient failures.
     */
    async disputeOnChain(escrowId: number, waitForReceipt = true): Promise<Hash> {
      return writeWithRetry("dispute", [BigInt(escrowId)], waitForReceipt);
    },

    /**
     * Confirm delivery on-chain directly (seller calls confirmDelivery).
     * Pre-checks ETH balance. Retries on transient failures.
     */
    async confirmDeliveryOnChain(escrowId: number, waitForReceipt = true): Promise<Hash> {
      return writeWithRetry("confirmDelivery", [BigInt(escrowId)], waitForReceipt);
    },

    /**
     * Refund an escrow on-chain (seller or arbiter).
     * Pre-checks ETH balance. Retries on transient failures.
     */
    async refundOnChain(escrowId: number, waitForReceipt = true): Promise<Hash> {
      return writeWithRetry("refund", [BigInt(escrowId)], waitForReceipt);
    },

    /**
     * Poll for escrow state changes. Calls `callback` whenever state changes.
     * Returns a stop function.
     */
    watchEscrow(
      escrowId: number,
      callback: (escrow: OnChainEscrow) => void,
      pollIntervalMs = 5000
    ): { stop: () => void } {
      let lastState: number | undefined;
      let stopped = false;

      const poll = async () => {
        while (!stopped) {
          try {
            const response = await apiFetch(`${baseUrl}/api/escrows/${escrowId}`);
            if (response.ok) {
              const escrow = (await response.json()) as OnChainEscrow;
              if (lastState === undefined || escrow.state !== lastState) {
                lastState = escrow.state;
                callback(escrow);
              }
            }
          } catch {
            // Swallow polling errors, retry next interval
          }
          if (!stopped) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }
        }
      };

      poll();
      return { stop: () => { stopped = true; } };
    },

    // ──────────── Read-only helpers ────────────

    /**
     * Get reputation score for any address
     */
    async getReputation(addr: Address): Promise<ReputationScore> {
      const response = await apiFetch(`${baseUrl}/api/reputation/${addr}`);
      const body = (await response.json()) as ReputationScore & ApiErrorBody;
      if (!response.ok) {
        throw new Error((body as ApiErrorBody).error ?? response.statusText);
      }
      return body;
    },

    /**
     * Get seller stats directly from contract
     */
    async getSellerStats(addr?: Address): Promise<Stats> {
      const target = addr ?? address;
      const result = await publicClient.readContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "sellerStats",
        args: [target],
      });
      const [totalEscrows, totalAmount, completedCount, completedAmount, disputedCount, disputedAmount, resolvedCount, refundedCount, refundedAmount] = result as readonly bigint[];
      return { totalEscrows, totalAmount, completedCount, completedAmount, disputedCount, disputedAmount, resolvedCount, refundedCount, refundedAmount };
    },

    /**
     * Get buyer stats directly from contract
     */
    async getBuyerStats(addr?: Address): Promise<Stats> {
      const target = addr ?? address;
      const result = await publicClient.readContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "buyerStats",
        args: [target],
      });
      const [totalEscrows, totalAmount, completedCount, completedAmount, disputedCount, disputedAmount, resolvedCount, refundedCount, refundedAmount] = result as readonly bigint[];
      return { totalEscrows, totalAmount, completedCount, completedAmount, disputedCount, disputedAmount, resolvedCount, refundedCount, refundedAmount };
    },

    /**
     * Get the current ETH balance of the connected wallet
     */
    async getBalance(): Promise<{ eth: string; wei: bigint }> {
      const wei = await publicClient.getBalance({ address });
      return { eth: formatEther(wei), wei };
    },
  };
}
