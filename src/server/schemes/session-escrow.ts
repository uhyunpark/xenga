import type { PaymentScheme, PaymentRequirement, SettleResult } from "../../shared/schemes.js";
import type { SessionPaymentPayload } from "../../shared/types.js";
import { verifyEscrowPayment } from "../facilitator/verifier.js";

export const sessionEscrowScheme: PaymentScheme = {
  name: "session-escrow",

  buildRequirement(params): PaymentRequirement {
    return {
      scheme: "session-escrow",
      network: "base-sepolia",
      sessionContract: params.sessionContract,
      asset: params.asset,
      maxAmount: params.maxAmount,
      sellerAddress: params.sellerAddress,
      duration: params.duration,
      pricePerUse: params.pricePerUse,
    };
  },

  async verify(payload) {
    // Same ERC-3009 signature verification as escrow scheme
    // The signature targets the SessionEscrow contract address instead of EscrowVault
    return verifyEscrowPayment(payload as any);
  },

  async settle(_payload): Promise<SettleResult> {
    // Session settlement is handled by the session middleware directly
    // This method is not used in the normal flow
    throw new Error("Session settle is handled by session middleware, not via facilitator");
  },
};
