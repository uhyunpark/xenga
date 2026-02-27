import type { Address, Hash, Hex } from "viem";

// ──────────────────────── Escrow States ────────────────────────

export enum EscrowState {
  None = 0,
  Active = 1,
  DeliveryConfirmed = 2,
  Completed = 3,
  AutoReleased = 4,
  Disputed = 5,
  Resolved = 6,
  Refunded = 7,
}

// ──────────────────────── Order ────────────────────────

export type OrderStatus =
  | "created"
  | "pending_payment"
  | "escrowed"
  | "delivery_confirmed"
  | "completed"
  | "disputed"
  | "resolved"
  | "refunded";

export interface Order {
  id: string;
  orderId: Hash; // bytes32 on-chain order ID
  title: string;
  description: string;
  price: bigint; // in USDC smallest unit (6 decimals)
  serviceType: string;
  sellerAddress: Address;
  buyerAddress?: Address;
  status: OrderStatus;
  escrowId?: number;
  txHash?: Hash;
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────── On-chain Escrow ────────────────────────

export interface OnChainEscrow {
  orderId: Hash;
  buyer: Address;
  seller: Address;
  amount: bigint;
  serviceType: string;
  state: EscrowState;
  createdAt: bigint;
  releaseWindow: bigint;
  deliveryConfirmedAt: bigint;
  disputeWindow: bigint;
  facilitatorFee: bigint;
}

// ──────────────────────── Stats ────────────────────────

export interface Stats {
  totalEscrows: bigint;
  totalAmount: bigint;
  completedCount: bigint;
  completedAmount: bigint;
  disputedCount: bigint;
  disputedAmount: bigint;
  resolvedCount: bigint;
  refundedCount: bigint;
  refundedAmount: bigint;
}

// ──────────────────────── Dispute ────────────────────────

export interface Dispute {
  id: string;
  escrowId: number;
  orderId: string;
  filedBy: Address;
  reason: string;
  status: "open" | "resolved";
  resolution?: string;
  buyerPct?: number;
  createdAt: number;
  resolvedAt?: number;
}

// ──────────────────────── Xenga Payment Types ────────────────────────

// Re-export scheme registry base types for convenience
export type {
  PaymentRequirement,
  PaymentRequirements,
} from "./schemes.js";

export interface EscrowPaymentRequired {
  scheme: "escrow";
  network: string;
  escrowContract: Address;
  asset: Address;
  amount: string; // stringified bigint
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
  facilitatorFee?: string; // informational: stringified bigint
  feeBps?: number; // informational: basis points (100 = 1%)
  flatFee?: string; // informational: stringified bigint (USDC smallest unit)
}

export interface EscrowPaymentPayload {
  scheme: "escrow";
  network: string;
  // ERC-3009 receiveWithAuthorization params
  from: Address;
  to: Address; // escrow contract
  value: string; // stringified bigint
  validAfter: string;
  validBefore: string;
  nonce: Hash;
  signature: {
    v: number;
    r: Hash;
    s: Hash;
  };
  // Escrow params
  orderId: Hash;
  sellerAddress: Address;
  releaseWindow: number;
  serviceType: string;
}

export interface EscrowPaymentResponse {
  success: boolean;
  txHash: Hash;
  escrowId: number;
}

// ──────────────────────── x402 Protocol Types ────────────────────────

/** x402 PaymentRequirements envelope (402 response body/header) */
export interface X402PaymentRequirements {
  x402Version: 1;
  error?: string;
  accepts: X402PaymentOption[];
}

/** Single payment option in the x402 accepts array */
export interface X402PaymentOption {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: object | null;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra?: Record<string, unknown>;
}

/** x402 PaymentPayload (client → server via PAYMENT-SIGNATURE header) */
export interface X402PaymentPayload {
  x402Version: 1;
  scheme: string;
  network: string;
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hash;
    };
  };
}

/** x402 SettlementResponse (server → client via PAYMENT-RESPONSE header) */
export interface X402SettlementResponse {
  success: boolean;
  transaction: Hash;
  network: string;
  payer: Address;
  escrowId?: number;
}

// ──────────────────────── API Request/Response ────────────────────────

export interface CreateOrderRequest {
  title: string;
  description: string;
  price: number; // USDC amount (e.g., 5.0)
  serviceType: string;
  sellerAddress: Address;
}

export interface DisputeRequest {
  reason: string;
}

export interface ResolveDisputeRequest {
  buyerPct: number; // 0–100
  resolution: string;
}

// ──────────────────────── Reputation ────────────────────────

/** Lightweight seller reputation info included in 402 responses */
export interface SellerReputationInfo {
  score: number;
  confidence: string;
  disputeRate: number;
}

export interface ReputationScore {
  address: Address;
  overall: number; // 0-100
  confidence: "low" | "medium" | "high";

  seller?: SellerReputation;
  buyer?: BuyerReputation;

  updatedAt: number; // unix timestamp
}

export interface SellerReputation {
  score: number; // 0-100
  completionRate: number; // 0-1
  disputeRate: number; // 0-1
  refundRate: number; // 0-1
  resolutionFairness: number; // 0-1 (arbiter ruled in seller's favor)
  totalVolume: string; // USDC bigint as string
  totalEscrows: number;
  firstSeen: number; // unix timestamp
}

export interface BuyerReputation {
  score: number; // 0-100
  disputeRate: number; // 0-1
  frivolousDisputeRate: number; // 0-1 (arbiter gave buyer <30%)
  completionRate: number; // 0-1
  totalVolume: string;
  totalEscrows: number;
  firstSeen: number;
}
