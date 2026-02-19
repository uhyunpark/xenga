// @x402/client — Re-exports the client SDK
// Source of truth: src/client/ (to maintain compatibility with existing imports)

export { escrowFetch } from "../../../src/client/escrowFetch.js";
export type { EscrowFetchOptions } from "../../../src/client/escrowFetch.js";
export { signEscrowPayment } from "../../../src/client/escrowScheme.js";
export { createEscrowClient } from "../../../src/client/index.js";
export type { EscrowClientConfig } from "../../../src/client/index.js";
