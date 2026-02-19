import type { ServiceType, EscrowParams, CounterpartyReputation } from "./index.js";
import {
  AGENT_RELEASE_WINDOW,
  REPUTATION_HIGH_THRESHOLD,
  REPUTATION_LOW_THRESHOLD,
} from "../../shared/constants.js";

/**
 * AI Agent Commerce service type
 * - 1-hour auto-release window
 * - Auto-verify delivery (machine-to-machine)
 * - No manual intervention needed
 */
export const agentServiceType: ServiceType = {
  name: "agent-service",
  releaseWindow: AGENT_RELEASE_WINDOW,
  autoVerify: true,
  description: "AI agent commerce with 1-hour auto-release and auto-verification",

  async verifyDelivery(_escrowId: number, _orderId: string): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Call the service endpoint to verify the response
    // 2. Check the data quality/completeness
    // 3. Verify the API response matches expectations
    //
    // For the demo, we auto-verify all deliveries
    return true;
  },

  adjustParams(params: EscrowParams, rep: CounterpartyReputation): EscrowParams {
    // Both high-reputation, high-confidence → shorten release window
    if (
      rep.buyerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.buyerConfidence === "high" &&
      rep.sellerConfidence === "high"
    ) {
      return { ...params, releaseWindow: 30 * 60 }; // 1h → 30min
    }
    // Low-reputation seller with enough data → extend window
    if (rep.sellerScore < REPUTATION_LOW_THRESHOLD && rep.sellerConfidence !== "low") {
      return { ...params, releaseWindow: 4 * 60 * 60 }; // 1h → 4h
    }
    return params;
  },
};
