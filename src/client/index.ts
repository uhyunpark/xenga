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
  EscrowState,
  OnChainEscrow,
  Order,
  ReputationScore,
  Stats,
} from "../shared/types.js";
import { NetworkError } from "../shared/errors.js";
import { escrowVaultAbi } from "../shared/abi.js";
import { escrowFetch } from "./escrowFetch.js";

export { signEscrowPayment } from "./escrowScheme.js";
export { escrowFetch } from "./escrowFetch.js";
export type { EscrowFetchOptions } from "./escrowFetch.js";

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
 * Create an x402 escrow client.
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

  return {
    address,
    walletClient,

    /**
     * Pay for an order using x402 escrow flow
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
     * Pre-checks ETH balance before submitting.
     */
    async releaseOnChain(escrowId: number): Promise<Hash> {
      await ensureBalance();
      return walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "releaseFunds",
        args: [BigInt(escrowId)],
      });
    },

    /**
     * Dispute on-chain directly (buyer calls dispute).
     * Pre-checks ETH balance before submitting.
     */
    async disputeOnChain(escrowId: number): Promise<Hash> {
      await ensureBalance();
      return walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "dispute",
        args: [BigInt(escrowId)],
      });
    },

    /**
     * Confirm delivery on-chain directly (seller calls confirmDelivery).
     * Pre-checks ETH balance before submitting.
     */
    async confirmDeliveryOnChain(escrowId: number): Promise<Hash> {
      await ensureBalance();
      return walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "confirmDelivery",
        args: [BigInt(escrowId)],
      });
    },

    /**
     * Refund an escrow on-chain (seller or arbiter).
     * Pre-checks ETH balance before submitting.
     */
    async refundOnChain(escrowId: number): Promise<Hash> {
      await ensureBalance();
      return walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "refund",
        args: [BigInt(escrowId)],
      });
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

  /** Pre-check that the wallet has enough ETH for gas */
  async function ensureBalance(): Promise<void> {
    if (!config.escrowVaultAddress) {
      throw new Error("escrowVaultAddress is required for on-chain calls");
    }
    const balance = await publicClient.getBalance({ address });
    // Require at least 0.001 ETH for gas
    if (balance < 1_000_000_000_000_000n) {
      throw new Error(
        `Insufficient ETH for gas. Balance: ${formatEther(balance)} ETH. ` +
        `Fund ${address} with at least 0.001 ETH to submit transactions.`
      );
    }
  }
}
