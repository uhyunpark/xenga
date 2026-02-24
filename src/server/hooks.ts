/**
 * Lifecycle hooks for payment processing.
 *
 * Hooks let integrators inject custom logic (compliance checks, rate limiting,
 * logging, analytics) at key points in the escrow payment lifecycle without
 * modifying core payment code.
 *
 * Usage:
 * ```ts
 * import { registerHook } from "./hooks.js";
 *
 * registerHook("beforeSettlement", async (ctx) => {
 *   await checkSanctions(ctx.buyerAddress);
 *   if (ctx.amount > 10_000_000_000n) { // > $10k
 *     throw new Error("Amount exceeds compliance threshold");
 *   }
 * });
 * ```
 *
 * Throwing from a hook aborts the operation and returns the error to the caller.
 */

import type { Address } from "viem";
import type { Order, EscrowPaymentPayload, EscrowPaymentRequired } from "../shared/types.js";

// ──────────────────────── Types ────────────────────────

export type HookPoint =
  | "beforePaymentRequired"  // Before returning 402 (can block price/terms)
  | "beforeSettlement"       // After signature verified, before on-chain settle
  | "afterSettlement"        // After on-chain settle (non-blocking by default)
  | "beforeDispute"          // Before a dispute is filed
  | "afterDispute";          // After dispute is filed (non-blocking by default)

export interface HookContext {
  /** The hook point being executed */
  hookPoint: HookPoint;
  /** The order being processed */
  order: Order;
  /** Buyer address (available after payment header is parsed) */
  buyerAddress?: Address;
  /** Seller address */
  sellerAddress: Address;
  /** Amount in USDC atomic units (6 decimals) */
  amount: bigint;
  /** Service type name */
  serviceType: string;
  /** Full payment payload (only for beforeSettlement/afterSettlement) */
  payload?: EscrowPaymentPayload;
  /** Payment requirements (only for beforePaymentRequired/beforeSettlement) */
  requirement?: EscrowPaymentRequired;
  /** Escrow ID (only for afterSettlement) */
  escrowId?: number;
  /** Transaction hash (only for afterSettlement) */
  txHash?: string;
  /** Dispute reason (only for beforeDispute/afterDispute) */
  disputeReason?: string;
}

export type HookFn = (context: HookContext) => Promise<void>;

interface RegisteredHook {
  name: string;
  fn: HookFn;
  priority: number;
}

// ──────────────────────── Registry ────────────────────────

const hooks = new Map<HookPoint, RegisteredHook[]>();

/**
 * Register a hook at a lifecycle point.
 *
 * @param point - When to execute (e.g. "beforeSettlement")
 * @param fn - Async function. Throw to abort the operation.
 * @param options.name - Human-readable name for logging (default: "anonymous")
 * @param options.priority - Lower runs first (default: 100)
 */
export function registerHook(
  point: HookPoint,
  fn: HookFn,
  options?: { name?: string; priority?: number }
): void {
  const entry: RegisteredHook = {
    name: options?.name ?? "anonymous",
    fn,
    priority: options?.priority ?? 100,
  };
  const existing = hooks.get(point) ?? [];
  existing.push(entry);
  existing.sort((a, b) => a.priority - b.priority);
  hooks.set(point, existing);
}

/**
 * Remove all hooks for a given point, or all hooks if no point specified.
 * Useful for testing.
 */
export function clearHooks(point?: HookPoint): void {
  if (point) {
    hooks.delete(point);
  } else {
    hooks.clear();
  }
}

/**
 * Execute all hooks registered at a given point, in priority order.
 *
 * For "after*" hooks, errors are caught and logged but don't abort the operation.
 * For "before*" hooks, the first error aborts execution and is propagated.
 *
 * @returns `{ ok: true }` or `{ ok: false, error: string }` if a blocking hook threw
 */
export async function executeHooks(
  point: HookPoint,
  context: HookContext,
  logger?: { warn(component: string, msg: string, data?: Record<string, unknown>): void }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const registered = hooks.get(point);
  if (!registered || registered.length === 0) {
    return { ok: true };
  }

  const isNonBlocking = point.startsWith("after");

  for (const hook of registered) {
    try {
      await hook.fn(context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isNonBlocking) {
        logger?.warn("hooks", `Non-blocking hook "${hook.name}" at ${point} failed: ${message}`);
        continue;
      }
      return { ok: false, error: message };
    }
  }

  return { ok: true };
}

/**
 * Get all registered hooks (for debugging/introspection).
 */
export function getRegisteredHooks(): Record<string, Array<{ name: string; priority: number }>> {
  const result: Record<string, Array<{ name: string; priority: number }>> = {};
  for (const [point, registered] of hooks.entries()) {
    result[point] = registered.map((h) => ({ name: h.name, priority: h.priority }));
  }
  return result;
}
