import type { Address, Hash } from "viem";
import type {
  EscrowPaymentPayload,
  EscrowPaymentRequired,
  EscrowPaymentResponse,
  Order,
  ReputationScore,
  SellerReputationInfo,
} from "../../shared/types.js";
import type { ServiceType } from "../service-types/index.js";

// ──────────── Framework-independent request/response abstraction ────────────

/**
 * Minimal request context for the payment core logic.
 * Framework adapters (Express, Next.js) convert their native request into this shape.
 */
export interface PaymentContext {
  /** Get a request header (case-insensitive). */
  getHeader(name: string): string | undefined;
  /** Route params, e.g. { id: "abc-123" }. */
  params: Record<string, string>;
  /** Request URL (for x402 `resource` field). */
  url?: string;
  /** HTTP method (GET, POST, etc.). */
  method?: string;
  /** Content-Type header value. */
  contentType?: string;
}

/**
 * Result produced by processEscrowPayment().
 * Framework adapters convert this into their native response.
 */
export interface PaymentResult {
  /** HTTP status code. */
  status: number;
  /** JSON-serialisable response body. */
  body: unknown;
  /** Headers to set on the response (header name → value). */
  headers: Record<string, string>;
  /**
   * `true` when the core logic has fully handled the request (402, 400, 409, 500, or idempotent 200).
   * `false` when payment was accepted and the request should continue to downstream handlers (Express `next()`).
   */
  handled: boolean;
  /** Present only when payment was successfully processed or idempotently returned. */
  payment?: EscrowPaymentResponse;
  /** Present only when the order was found. */
  order?: Order;
}

// ──────────── Dependency injection interfaces ────────────

/** Logger interface — matches the shape of the existing logger module. */
export interface Logger {
  debug(component: string, message: string, data?: Record<string, unknown>): void;
  info(component: string, message: string, data?: Record<string, unknown>): void;
  warn(component: string, message: string, data?: Record<string, unknown>): void;
  error(component: string, message: string, data?: Record<string, unknown>): void;
}

/** Update payload for order status changes after settlement. */
export interface OrderStatusUpdate {
  status: "escrowed";
  buyerAddress: Address;
  escrowId: number;
  txHash: `0x${string}`;
  contentMetadata?: string;
  contentHash?: Hash;
}

/**
 * All external dependencies needed by the payment core.
 *
 * Consumers (Express server, Next.js route handlers, tests) provide their own
 * implementations — the core never imports DB, config, or chain adapters directly.
 */
export interface PaymentDeps {
  // ── Order storage ──
  getOrderById(orderId: string): Order | undefined;
  updateOrderStatus(id: string, update: OrderStatusUpdate): void;
  /**
   * Atomically transition an order from `created` → `pending_payment`.
   * Must return `true` if the transition succeeded, `false` if the order was already claimed.
   */
  claimOrder(id: string): boolean;
  /** Revert a claimed order back to `created` (called on settlement failure). */
  revertOrderClaim(id: string): void;

  // ── Service types ──
  getServiceType(name: string): ServiceType | undefined;

  // ── Facilitator (verify + settle) ──
  verify(
    payload: EscrowPaymentPayload,
    requirement: EscrowPaymentRequired
  ): Promise<{ valid: boolean; error?: string }>;
  settle(
    payload: EscrowPaymentPayload,
    requirement: EscrowPaymentRequired,
    contentHash?: Hash
  ): Promise<{ txHash: string; escrowId: number }>;

  // ── Reputation (optional) ──
  computeReputation?(address: Address): Promise<ReputationScore>;

  // ── Config ──
  config: {
    escrowVaultAddress: Address;
    usdcAddress: Address;
    feeBps: number;
    flatFee: bigint;
    /** Network identifier for xenga headers (e.g. "base-sepolia", "base") */
    network?: string;
    /** On-chain disputeWindow (seconds) — used to clamp releaseWindow */
    disputeWindow?: number;
  };

  // ── Logging (optional) ──
  logger?: Logger;
}
