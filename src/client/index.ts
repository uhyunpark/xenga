import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../shared/constants.js";
import type {
  EscrowPaymentResponse,
  OnChainEscrow,
  Order,
  ReputationScore,
} from "../shared/types.js";
import { NetworkError } from "../shared/errors.js";
import { escrowVaultAbi } from "../shared/abi.js";
import { escrowFetch } from "./escrowFetch.js";

export { signEscrowPayment } from "./escrowScheme.js";
export { escrowFetch } from "./escrowFetch.js";
export type { EscrowFetchOptions } from "./escrowFetch.js";

export interface EscrowClientConfig {
  privateKey: Hex;
  serverUrl: string;
  rpcUrl?: string;
  usdcAddress?: Address;
  /** Required for direct on-chain calls (releaseOnChain, disputeOnChain, etc.) */
  escrowVaultAddress?: Address;
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

interface ReleaseResponse {
  message: string;
  order: OrderWithPrice;
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
 * Create an x402 escrow client
 */
export function createEscrowClient(config: EscrowClientConfig) {
  const account = privateKeyToAccount(config.privateKey);
  const walletClient = createWalletClient({
    chain: CHAIN,
    transport: http(config.rpcUrl ?? CHAIN.rpcUrls.default.http[0]),
    account,
  });

  const baseUrl = config.serverUrl.replace(/\/$/, "");

  return {
    address: account.address,
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
     * Release escrowed funds (buyer confirms receipt)
     */
    async releaseEscrow(orderId: string): Promise<ReleaseResponse> {
      const response = await apiFetch(`${baseUrl}/api/orders/${orderId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json()) as ReleaseResponse & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return { message: body.message, order: body.order };
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

    /**
     * Release funds on-chain directly (buyer calls releaseFunds)
     */
    async releaseOnChain(escrowId: number): Promise<Hash> {
      const txHash = await walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "releaseFunds",
        args: [BigInt(escrowId)],
      });
      return txHash;
    },

    /**
     * Dispute on-chain directly (buyer calls dispute)
     */
    async disputeOnChain(escrowId: number): Promise<Hash> {
      const txHash = await walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "dispute",
        args: [BigInt(escrowId)],
      });
      return txHash;
    },

    /**
     * Confirm delivery on-chain directly (seller calls confirmDelivery)
     */
    async confirmDeliveryOnChain(escrowId: number): Promise<Hash> {
      const txHash = await walletClient.writeContract({
        address: config.escrowVaultAddress!,
        abi: escrowVaultAbi,
        functionName: "confirmDelivery",
        args: [BigInt(escrowId)],
      });
      return txHash;
    },

    /**
     * Get reputation score for any address
     */
    async getReputation(address: Address): Promise<ReputationScore> {
      const response = await apiFetch(`${baseUrl}/api/reputation/${address}`);
      const body = (await response.json()) as ReputationScore & ApiErrorBody;
      if (!response.ok) {
        throw new Error((body as ApiErrorBody).error ?? response.statusText);
      }
      return body;
    },
  };
}
