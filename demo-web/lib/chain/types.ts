import type { Address, Hash } from "viem";
import type { EscrowPaymentPayload, OnChainEscrow, OnChainSession, SessionPaymentPayload, Stats } from "@shared/types.js";

export interface SettleResult {
  txHash: Hash;
  escrowId: number;
}

export interface SessionCreateResult {
  txHash: Hash;
  sessionId: number;
  expiresAt: number;
}

export interface ChainAdapter {
  settleEscrow(payload: EscrowPaymentPayload): Promise<SettleResult>;
  confirmDelivery(escrowId: number): Promise<Hash>;
  resolveDispute(escrowId: number, buyerPct: number): Promise<Hash>;
  getEscrow(escrowId: number): Promise<OnChainEscrow>;
  isReleasable(escrowId: number): Promise<boolean>;
  fundWallet(address: Address): Promise<{ usdcTx: Hash; ethTx: Hash }>;
  getSellerStats(seller: Address): Promise<Stats>;
  getServiceTypeStats(serviceType: string): Promise<Stats>;
  startEventListener(): void;

  // Session micropayments
  createSession(payload: SessionPaymentPayload): Promise<SessionCreateResult>;
  captureSession(sessionId: number, amount: bigint): Promise<Hash>;
  settleSession(sessionId: number, finalAmount: bigint): Promise<Hash>;
  getSessionOnChain(sessionId: number): Promise<OnChainSession>;

  readonly isMock: boolean;
}
