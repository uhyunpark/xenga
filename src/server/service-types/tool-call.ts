import type { ServiceType, EscrowParams, CounterpartyReputation } from "./index.js";
import {
  REPUTATION_HIGH_THRESHOLD,
  REPUTATION_LOW_THRESHOLD,
} from "../../shared/constants.js";

/**
 * Tool Call service type
 * - 1-minute release window (single API call, near-instant delivery)
 * - Auto-verify delivery
 * - Designed for single tool/API invocations (search, compute, translate, etc.)
 */
export const toolCallServiceType: ServiceType = {
  name: "tool-call",
  releaseWindow: 60, // 1 minute
  autoVerify: true,
  description: "Single tool/API invocation with 1-minute auto-release",

  async verifyDelivery(): Promise<boolean> {
    return true;
  },

  adjustParams(params: EscrowParams, rep: CounterpartyReputation): EscrowParams {
    // High-trust pair → near-instant
    if (
      rep.sellerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerConfidence === "high"
    ) {
      return { ...params, releaseWindow: 30 }; // 30 seconds
    }
    // Low-reputation provider → extend
    if (rep.sellerScore < REPUTATION_LOW_THRESHOLD && rep.sellerConfidence !== "low") {
      return { ...params, releaseWindow: 5 * 60 }; // 5 minutes
    }
    return params;
  },
};
