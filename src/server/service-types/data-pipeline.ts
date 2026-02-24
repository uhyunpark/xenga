import type { ServiceType, EscrowParams, CounterpartyReputation } from "./index.js";
import {
  REPUTATION_HIGH_THRESHOLD,
  REPUTATION_LOW_THRESHOLD,
} from "../../shared/constants.js";

/**
 * Data Pipeline service type
 * - 1-hour release window (batch processing takes time)
 * - Manual verification (output quality needs human/agent review)
 * - Designed for ETL jobs, batch processing, data enrichment
 */
export const dataPipelineServiceType: ServiceType = {
  name: "data-pipeline",
  releaseWindow: 60 * 60, // 1 hour
  autoVerify: false,
  description: "Batch data processing with 1-hour release and manual verification",

  adjustParams(params: EscrowParams, rep: CounterpartyReputation): EscrowParams {
    // Both well-established → shorter window
    if (
      rep.buyerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerScore >= REPUTATION_HIGH_THRESHOLD &&
      rep.sellerConfidence === "high"
    ) {
      return { ...params, releaseWindow: 30 * 60 }; // 30 minutes
    }
    // Unknown or low-reputation provider → give more time to verify output
    if (rep.sellerScore < REPUTATION_LOW_THRESHOLD && rep.sellerConfidence !== "low") {
      return { ...params, releaseWindow: 4 * 60 * 60 }; // 4 hours
    }
    return params;
  },
};
