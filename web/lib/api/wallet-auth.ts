import type { WalletClient, Address } from "viem";
import { facilitatorFetch } from "./client";

/**
 * Build wallet auth headers for the facilitator API.
 * Server expects: X-WALLET-ADDRESS, X-WALLET-SIGNATURE, X-WALLET-TIMESTAMP
 * Message format: "xenga-auth:{routeId}:{timestamp}"
 */
export async function buildWalletAuthHeaders(
  walletClient: WalletClient,
  address: Address,
  routeId: string
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `xenga-auth:${routeId}:${timestamp}`;

  const signature = await walletClient.signMessage({
    account: address,
    message,
  });

  return {
    "X-WALLET-ADDRESS": address,
    "X-WALLET-SIGNATURE": signature,
    "X-WALLET-TIMESTAMP": timestamp,
  };
}

/**
 * Authenticated facilitator fetch — adds wallet auth headers automatically.
 */
export async function authenticatedFetch(
  path: string,
  walletClient: WalletClient,
  address: Address,
  options?: RequestInit
): Promise<Response> {
  // Use the path as routeId (server uses req.path as fallback)
  const routeId = path.split("?")[0]; // strip query params
  const authHeaders = await buildWalletAuthHeaders(walletClient, address, routeId);

  return facilitatorFetch(path, {
    ...options,
    headers: {
      ...options?.headers,
      ...authHeaders,
    },
  });
}
