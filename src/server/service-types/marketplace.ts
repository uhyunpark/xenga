import type { ServiceType } from "./index.js";
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
};
