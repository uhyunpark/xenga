import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../shared/constants.js";
import type { EscrowPaymentResponse, Order, ReputationScore } from "../shared/types.js";
import { escrowVaultAbi } from "../shared/abi.js";
import { escrowFetch } from "./escrowFetch.js";

export { signEscrowPayment } from "./escrowScheme.js";
export { escrowFetch } from "./escrowFetch.js";

export interface EscrowClientConfig {
  privateKey: Hex;
  serverUrl: string;
  rpcUrl?: string;
  usdcAddress?: Address;
  escrowVaultAddress?: Address;
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
    async payForOrder(
      orderId: string
    ): Promise<{ order: Order & { priceUsdc: number }; payment: EscrowPaymentResponse }> {
      const { response, payment } = await escrowFetch(
        `${baseUrl}/api/orders/${orderId}/pay`,
        { method: "POST" },
        { walletClient, usdcAddress: config.usdcAddress }
      );

      const body = await response.json() as any;
      if (!response.ok) {
        throw new Error(
          `Payment failed: ${body.error ?? response.statusText}`
        );
      }

      return { order: body.order, payment: payment ?? body.payment };
    },

    /**
     * Release escrowed funds (buyer confirms receipt)
     */
    async releaseEscrow(orderId: string): Promise<{ message: string; order: any }> {
      const response = await fetch(`${baseUrl}/api/orders/${orderId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json() as any;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return body;
    },

    /**
     * File a dispute
     */
    async disputeEscrow(orderId: string, reason: string): Promise<{ message: string; disputeId: string }> {
      const response = await fetch(
        `${baseUrl}/api/disputes/${orderId}/dispute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      const body = await response.json() as any;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return body;
    },

    /**
     * Get order details
     */
    async getOrder(orderId: string): Promise<Order & { priceUsdc: number }> {
      const response = await fetch(`${baseUrl}/api/orders/${orderId}`);
      const body = await response.json() as any;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return body;
    },

    /**
     * Get on-chain escrow details
     */
    async getEscrow(escrowId: number): Promise<any> {
      const response = await fetch(`${baseUrl}/api/escrows/${escrowId}`);
      const body = await response.json() as any;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
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
      const response = await fetch(`${baseUrl}/api/reputation/${address}`);
      const body = (await response.json()) as any;
      if (!response.ok) {
        throw new Error(body.error ?? response.statusText);
      }
      return body;
    },
  };
}
