// @xenga/client — Re-exports the client SDK
// Source of truth: src/client/ (to maintain compatibility with existing imports)

export { escrowFetch } from "../../../src/client/escrowFetch.js";
export type { EscrowFetchOptions } from "../../../src/client/escrowFetch.js";
export { signEscrowPayment } from "../../../src/client/escrowScheme.js";
export { createEscrowClient } from "../../../src/client/index.js";
export type { EscrowClientConfig } from "../../../src/client/index.js";
export { withRetry, isRetryableError } from "../../../src/shared/retry.js";
export type { RetryOptions } from "../../../src/shared/retry.js";

// Agent-specific helpers
export { discoverServices, screenSeller, autoPayAndVerify } from "../../../src/client/agent.js";
export type { DiscoverResult, ScreenResult, AutoPayResult, ServiceInfo } from "../../../src/client/agent.js";
