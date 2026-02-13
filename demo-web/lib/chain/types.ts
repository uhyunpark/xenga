import type { Address, Hash } from "viem";
import type { EscrowPaymentPayload, OnChainEscrow, Stats } from "@shared/types.js";

export interface SettleResult {
  txHash: Hash;
  escrowId: number;
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
  readonly isMock: boolean;
}
