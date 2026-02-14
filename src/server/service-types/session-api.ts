import type { ServiceType } from "./index.js";

export const sessionApiServiceType: ServiceType = {
  name: "session-api",
  releaseWindow: 3600,
  autoVerify: true,
  description: "Session-based API with authorize-once, use-many pattern. Optimized for high-frequency micropayments.",
};
