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
export { inferenceServiceType } from "../../../src/server/service-types/inference.js";
export { dataPipelineServiceType } from "../../../src/server/service-types/data-pipeline.js";
export { toolCallServiceType } from "../../../src/server/service-types/tool-call.js";

// Facilitator dispatch
export {
  verifyViaFacilitator,
  settleViaFacilitator,
} from "../../../src/server/facilitator/dispatch.js";

// Lifecycle hooks
export {
  registerHook,
  clearHooks,
  executeHooks,
  getRegisteredHooks,
} from "../../../src/server/hooks.js";
export type {
  HookPoint,
  HookContext,
  HookFn,
} from "../../../src/server/hooks.js";

// Scheme registry
export {
  registerScheme,
  getScheme,
  getAllSchemes,
} from "../../../src/shared/schemes.js";
export type { PaymentScheme } from "../../../src/shared/schemes.js";
