import type { ServiceType, EscrowParams, CounterpartyReputation } from "./index.js";
import {
  MARKETPLACE_RELEASE_WINDOW,
} from "../../shared/constants.js";

/**
 * P2P Marketplace service type
 * - 7-day auto-release window
 * - 3-day dispute window (configured in smart contract)
 * - Manual delivery confirmation by seller
 * - No auto-verify: buyer must release or dispute
 */
export const marketplaceServiceType: ServiceType = {
  name: "marketplace",
  releaseWindow: MARKETPLACE_RELEASE_WINDOW,
  autoVerify: false,
  description:
    "P2P marketplace with 7-day release window and 3-day dispute period",

  adjustParams(params: EscrowParams, rep: CounterpartyReputation): EscrowParams {
    // Both high-confidence + high-reputation → shorten release window
    if (
      rep.buyerScore >= 80 &&
      rep.sellerScore >= 80 &&
      rep.buyerConfidence === "high" &&
      rep.sellerConfidence === "high"
    ) {
      return { ...params, releaseWindow: 3 * 24 * 60 * 60 }; // 7d → 3d
    }
    // Low-reputation seller with enough data → extend window
    if (rep.sellerScore < 40 && rep.sellerConfidence !== "low") {
      return { ...params, releaseWindow: 14 * 24 * 60 * 60 }; // 7d → 14d
    }
    return params;
  },
};
