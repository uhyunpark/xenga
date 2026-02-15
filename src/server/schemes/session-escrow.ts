import type { PaymentScheme, PaymentRequirement, SettleResult } from "../../shared/schemes.js";
import type { SessionPaymentPayload } from "../../shared/types.js";
import type { Address } from "viem";
import { verifyEscrowPayment } from "../facilitator/verifier.js";
import { config } from "../config.js";

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
    if (!config.sessionEscrowAddress) {
      return { valid: false, error: "Session escrow contract not configured" };
    }
    // Same ERC-3009 signature verification, but targeting the SessionEscrow contract
    return verifyEscrowPayment(payload as any, config.sessionEscrowAddress as Address);
  },

  async settle(_payload): Promise<SettleResult> {
    // Session settlement uses the /api/sessions/:id/settle endpoint, not the facilitator
    return {
      success: false,
      network: "base-sepolia",
      error: "Session settlement uses the /api/sessions/:id/settle endpoint, not the facilitator",
    };
  },
};
