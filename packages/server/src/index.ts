// @x402/server — Core server SDK (framework-agnostic)
// Exports: payment core logic, types, service type registry, facilitator dispatch

// Payment core
export { processEscrowPayment } from "../../../src/server/middleware/paymentCore.js";
export type {
  PaymentContext,
  PaymentResult,
  PaymentDeps,
  OrderStatusUpdate,
  Logger,
} from "../../../src/server/middleware/types.js";

// Service type registry
export {
  registerServiceType,
  getServiceType,
  getAllServiceTypes,
} from "../../../src/server/service-types/index.js";
export type {
  ServiceType,
  EscrowParams,
  CounterpartyReputation,
} from "../../../src/server/service-types/index.js";

// Built-in service types
export { marketplaceServiceType } from "../../../src/server/service-types/marketplace.js";
export { agentServiceType } from "../../../src/server/service-types/agent-service.js";

// Facilitator dispatch
export {
  verifyViaFacilitator,
  settleViaFacilitator,
} from "../../../src/server/facilitator/dispatch.js";

// Scheme registry
export {
  registerScheme,
  getScheme,
  getAllSchemes,
} from "../../../src/shared/schemes.js";
export type { PaymentScheme } from "../../../src/shared/schemes.js";
