import type { Hash } from "viem";

// ──────────────────────── Payment Scheme Interface ────────────────────────

export interface PaymentRequirement {
  scheme: string;
  network: string;
  [key: string]: unknown;
}

export type PaymentRequirements = PaymentRequirement[];

export interface SettleResult {
  success: boolean;
  txHash?: Hash;
  network?: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = { [key: string]: any };

export interface PaymentScheme {
  name: string;

  /** Build a PaymentRequirement for the 402 response */
  buildRequirement(params: AnyPayload): PaymentRequirement;

  /** Server-side: verify the payload off-chain */
  verify(payload: AnyPayload): Promise<{ valid: boolean; error?: string }>;

  /** Server-side: settle on-chain */
  settle(payload: AnyPayload, contentHash?: Hash): Promise<SettleResult>;
}

// ──────────────────────── Registry ────────────────────────
// Use globalThis with Symbol.for() so the registry survives webpack module duplication

const REGISTRY_KEY = Symbol.for("xenga.schemeRegistry");

function getRegistry(): Map<string, PaymentScheme> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, PaymentScheme>();
  }
  return g[REGISTRY_KEY] as Map<string, PaymentScheme>;
}

export function registerScheme(scheme: PaymentScheme) {
  getRegistry().set(scheme.name, scheme);
}

export function getScheme(name: string): PaymentScheme | undefined {
  return getRegistry().get(name);
}

export function getAllSchemes(): PaymentScheme[] {
  return Array.from(getRegistry().values());
}
