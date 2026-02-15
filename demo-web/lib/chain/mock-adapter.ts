import type { Address, Hash } from "viem";
import type { ChainAdapter } from "./types";
import type { EscrowPaymentPayload, OnChainSession, SessionPaymentPayload, Stats } from "@shared/types.js";
import { EscrowState } from "@shared/types.js";
import { MARKETPLACE_DISPUTE_WINDOW } from "@shared/constants.js";
import { getServiceType } from "@server/service-types/index.js";
import {
  getOrderByOrderId,
  updateOrderStatus,
} from "@server/services/orderService.js";
import {
  createMockEscrow,
  getMockEscrow,
  updateMockEscrowState,
  isMockReleasable,
} from "./mock-escrow-store";
import {
  createMockSession,
  getMockSession,
  captureMockSession,
  settleMockSession,
} from "./mock-session-store";
import { fakeTxHash } from "./mock-utils";

export class MockChainAdapter implements ChainAdapter {
  readonly isMock = true;

  async settleEscrow(
    payload: EscrowPaymentPayload
  ): Promise<{ txHash: Hash; escrowId: number }> {
    const escrowId = createMockEscrow({
      orderId: payload.orderId,
      buyer: payload.from,
      seller: payload.sellerAddress,
      amount: payload.value,
      serviceType: payload.serviceType,
      releaseWindow: payload.releaseWindow,
      // MARKETPLACE_DISPUTE_WINDOW matches the on-chain DEFAULT_DISPUTE_WINDOW (3 days) — global for all escrow types
      disputeWindow: MARKETPLACE_DISPUTE_WINDOW,
    });

    const txHash = fakeTxHash();

    // Schedule auto-verify for agent-service types
    const serviceType = getServiceType(payload.serviceType);
    if (serviceType?.autoVerify) {
      setTimeout(() => {
        try {
          updateMockEscrowState(escrowId, EscrowState.DeliveryConfirmed, {
            deliveryConfirmedAt: Math.floor(Date.now() / 1000),
          });
          const order = getOrderByOrderId(payload.orderId);
          if (order) {
            updateOrderStatus(order.id, { status: "delivery_confirmed" });
          }
          console.log(
            `[MockChain] Auto-verified delivery for escrow ${escrowId}`
          );
        } catch (err) {
          console.error(
            `[MockChain] Auto-verify failed for escrow ${escrowId}:`,
            err
          );
        }
      }, 5000);
    }

    return { txHash, escrowId };
  }

  async confirmDelivery(escrowId: number): Promise<Hash> {
    updateMockEscrowState(escrowId, EscrowState.DeliveryConfirmed, {
      deliveryConfirmedAt: Math.floor(Date.now() / 1000),
    });
    return fakeTxHash();
  }

  async resolveDispute(escrowId: number, _buyerPct: number): Promise<Hash> {
    updateMockEscrowState(escrowId, EscrowState.Resolved);
    return fakeTxHash();
  }

  async getEscrow(escrowId: number) {
    return getMockEscrow(escrowId);
  }

  async isReleasable(escrowId: number): Promise<boolean> {
    return isMockReleasable(escrowId);
  }

  async fundWallet(address: Address): Promise<{ usdcTx: Hash; ethTx: Hash }> {
    console.log(`[MockChain] Mock-funded wallet ${address}`);
    return { usdcTx: fakeTxHash(), ethTx: fakeTxHash() };
  }

  async getSellerStats(_seller: Address): Promise<Stats> {
    return zeroStats();
  }

  async getServiceTypeStats(_serviceType: string): Promise<Stats> {
    return zeroStats();
  }

  startEventListener(): void {
    console.log("[MockChain] Event listener skipped (mock mode)");
  }

  // ──────────── Session Methods ────────────

  async createSession(
    payload: SessionPaymentPayload
  ): Promise<{ txHash: Hash; sessionId: number; expiresAt: number }> {
    const sessionId = createMockSession({
      buyer: payload.from,
      seller: payload.sellerAddress,
      depositAmount: payload.value,
      duration: payload.duration,
    });

    const txHash = fakeTxHash();
    const expiresAt = Math.floor(Date.now() / 1000) + payload.duration;

    console.log(`[MockChain] Created session ${sessionId} for ${payload.from}`);
    return { txHash, sessionId, expiresAt };
  }

  async captureSession(sessionId: number, amount: bigint): Promise<Hash> {
    captureMockSession(sessionId, amount);
    return fakeTxHash();
  }

  async settleSession(sessionId: number, finalAmount: bigint): Promise<Hash> {
    settleMockSession(sessionId, finalAmount);
    return fakeTxHash();
  }

  async getSessionOnChain(sessionId: number): Promise<OnChainSession> {
    return getMockSession(sessionId);
  }
}

function zeroStats(): Stats {
  return {
    totalEscrows: 0n,
    totalAmount: 0n,
    completedCount: 0n,
    completedAmount: 0n,
    disputedCount: 0n,
    disputedAmount: 0n,
    resolvedCount: 0n,
    refundedCount: 0n,
    refundedAmount: 0n,
  };
}
