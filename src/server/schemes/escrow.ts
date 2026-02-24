import type { PaymentScheme, PaymentRequirement, SettleResult } from "../../shared/schemes.js";
import type { EscrowPaymentPayload } from "../../shared/types.js";
import { verifyEscrowPayment } from "../facilitator/verifier.js";
import { settleEscrow } from "../facilitator/settler.js";
import { config } from "../config.js";

export const escrowScheme: PaymentScheme = {
  name: "escrow",

  buildRequirement(params): PaymentRequirement {
    return {
      scheme: "escrow",
      network: config.chainConfig.network,
      escrowContract: params.escrowContract,
      asset: params.asset,
      amount: params.amount,
      orderId: params.orderId,
      sellerAddress: params.sellerAddress,
      releaseWindow: params.releaseWindow,
      serviceType: params.serviceType,
    };
  },

  async verify(payload) {
    return verifyEscrowPayment(payload as unknown as EscrowPaymentPayload);
  },

  async settle(payload): Promise<SettleResult> {
    const { txHash, escrowId } = await settleEscrow(
      payload as unknown as EscrowPaymentPayload
    );
    return { success: true, txHash, network: config.chainConfig.network, escrowId };
  },
};
