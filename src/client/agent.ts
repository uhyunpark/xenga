/**
 * Agent-specific helpers for machine-to-machine x402 payments.
 *
 * These utilities make it easy for autonomous agents (LLMs, bots, pipelines)
 * to discover, evaluate, and pay for services protected by x402 escrow.
 */

import type { Address } from "viem";
import type { ReputationScore } from "../shared/types.js";
import { NetworkError } from "../shared/errors.js";
import { escrowFetch, type EscrowFetchOptions } from "./escrowFetch.js";

// ──────────────────────── Types ────────────────────────

export interface ServiceInfo {
  name: string;
  releaseWindow: number;
  autoVerify: boolean;
  description: string;
}

export interface DiscoverResult {
  facilitatorUrl: string;
  chain: string;
  chainId: number;
  escrowContract: string;
  serviceTypes: ServiceInfo[];
}

export interface ScreenResult {
  address: Address;
  score: number;
  confidence: "low" | "medium" | "high";
  acceptable: boolean;
  reputation: ReputationScore;
}

export interface AutoPayResult {
  response: Response;
  data: unknown;
  escrowId?: number;
  txHash?: string;
}

// ──────────────────────── Functions ────────────────────────

/**
 * Discover available services and capabilities from a facilitator.
 */
export async function discoverServices(
  facilitatorUrl: string
): Promise<DiscoverResult> {
  const url = `${facilitatorUrl.replace(/\/$/, "")}/api/health`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new NetworkError(
      `Failed to reach facilitator at ${url}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }
  if (!res.ok) {
    throw new Error(`Facilitator health check failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    chain: string;
    chainId: number;
    escrowContract: string;
    serviceTypes: ServiceInfo[];
  };
  return {
    facilitatorUrl,
    chain: data.chain,
    chainId: data.chainId,
    escrowContract: data.escrowContract,
    serviceTypes: data.serviceTypes ?? [],
  };
}

/**
 * Screen a seller's reputation before paying.
 * Returns whether the seller meets the minimum reputation threshold.
 */
export async function screenSeller(
  facilitatorUrl: string,
  address: Address,
  minScore = 50
): Promise<ScreenResult> {
  const url = `${facilitatorUrl.replace(/\/$/, "")}/api/reputation/${address}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new NetworkError(
      `Failed to reach reputation API: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }
  if (!res.ok) {
    throw new Error(`Reputation lookup failed: ${res.status}`);
  }
  const reputation = (await res.json()) as ReputationScore;
  const score = reputation.overall ?? 0;
  const confidence = reputation.confidence ?? "low";

  return {
    address,
    score,
    confidence,
    acceptable: score >= minScore || confidence === "low", // Don't reject unknowns
    reputation,
  };
}

/**
 * One-call payment + data retrieval for agent-to-agent commerce.
 *
 * Combines:
 * 1. Optional seller reputation screening
 * 2. escrowFetch (402 → sign → settle)
 * 3. Response parsing
 *
 * ```ts
 * const result = await autoPayAndVerify(
 *   "https://api.example.com/inference",
 *   { method: "POST", body: JSON.stringify({ prompt: "hello" }) },
 *   { walletClient, minSellerReputation: 60 }
 * );
 * console.log(result.data);
 * ```
 */
export async function autoPayAndVerify(
  url: string,
  init: RequestInit | undefined,
  options: EscrowFetchOptions & {
    /** Minimum seller reputation score to proceed (default: 0 = no check) */
    minSellerReputation?: number;
  }
): Promise<AutoPayResult> {
  const minRep = options.minSellerReputation ?? 0;

  const fetchOptions: EscrowFetchOptions = {
    ...options,
    onSellerReputation: minRep > 0
      ? (rep) => rep.score >= minRep
      : options.onSellerReputation,
  };

  const { response, payment } = await escrowFetch(url, init, fetchOptions);

  let data: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    response,
    data,
    escrowId: payment?.escrowId,
    txHash: payment?.txHash,
  };
}
