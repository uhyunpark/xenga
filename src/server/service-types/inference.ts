import type { ServiceType, EscrowParams, CounterpartyReputation } from "./index.js";
import {
  REPUTATION_HIGH_THRESHOLD,
  REPUTATION_LOW_THRESHOLD,
} from "../../shared/constants.js";

/**
 * LLM Inference service type
 * - 5-minute release window (sub-second delivery, short dispute window for quality)
 * - Auto-verify delivery
 * - Designed for pay-per-call LLM API endpoints
 */
export const inferenceServiceType: ServiceType = {
  name: "inference",
  releaseWindow: 5 * 60, // 5 minutes
  autoVerify: true,
  description: "LLM inference calls with 5-minute auto-release and auto-verification",

  async verifyDelivery(): Promise<boolean> {
    // Auto-verify: the HTTP response itself is the delivery proof
    return true;
  },

  adjustParams(params: EscrowParams, rep: CounterpartyReputation): EscrowParams {
    // High-trust pair → near-instant release
    if (
      rep.buyerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerConfidence === "high"
    ) {
      return { ...params, releaseWindow: 60 }; // 1 minute
    }
    // Low-reputation provider → extend window for dispute time
    if (rep.sellerScore < REPUTATION_LOW_THRESHOLD && rep.sellerConfidence !== "low") {
      return { ...params, releaseWindow: 30 * 60 }; // 30 minutes
    }
    return params;
  },
};
