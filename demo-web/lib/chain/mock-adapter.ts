import type { Address, Hash } from "viem";
import type { ChainAdapter } from "./types";
import type { EscrowPaymentPayload } from "@shared/types.js";
import { EscrowState } from "@shared/types.js";
import { MARKETPLACE_DISPUTE_WINDOW } from "@shared/constants.js";
import { getServiceType } from "@server/service-types/index.js";
import { config } from "@server/config.js";
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
import { fakeTxHash } from "./mock-utils";

export class MockChainAdapter implements ChainAdapter {
  readonly isMock = true;

  async settleEscrow(
    payload: EscrowPaymentPayload
  ): Promise<{ txHash: Hash; escrowId: number }> {
    const feeBps = config.feeBps;
    const fee = (BigInt(payload.value) * BigInt(feeBps)) / 10000n;

    const escrowId = createMockEscrow({
      orderId: payload.orderId,
      buyer: payload.from,
      seller: payload.sellerAddress,
      amount: payload.value,
      serviceType: payload.serviceType,
      releaseWindow: payload.releaseWindow,
      // MARKETPLACE_DISPUTE_WINDOW matches the on-chain DEFAULT_DISPUTE_WINDOW (3 days) — global for all escrow types
      disputeWindow: MARKETPLACE_DISPUTE_WINDOW,
      facilitatorFee: fee.toString(),
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

  async fileDispute(escrowId: number): Promise<Hash> {
    updateMockEscrowState(escrowId, EscrowState.Disputed);
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

  startEventListener(): void {
    console.log("[MockChain] Event listener skipped (mock mode)");
  }
}
