/**
 * ServiceType plugin interface
 * Each service type defines its escrow parameters and verification logic
 */
export interface ServiceType {
  /** Unique identifier (e.g., "marketplace", "agent-service") */
  name: string;

  /** Escrow release window in seconds */
  releaseWindow: number;

  /** Whether delivery can be auto-verified (no human confirmation needed) */
  autoVerify: boolean;

  /** Description for display */
  description: string;

  /**
   * Verify delivery for auto-verify service types
   * Returns true if the service/product was delivered successfully
   */
  verifyDelivery?(escrowId: number, orderId: string): Promise<boolean>;
}

// ──────────── Registry ────────────
// Use globalThis with Symbol.for() so the registry survives webpack module duplication
// (e.g. instrumentation.ts importing without .js vs route handlers importing with .js)

const REGISTRY_KEY = Symbol.for("x402.serviceTypeRegistry");

function getRegistry(): Map<string, ServiceType> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, ServiceType>();
  }
  return g[REGISTRY_KEY] as Map<string, ServiceType>;
}

export function registerServiceType(serviceType: ServiceType) {
  getRegistry().set(serviceType.name, serviceType);
}

export function getServiceType(name: string): ServiceType | undefined {
  return getRegistry().get(name);
}

export function getAllServiceTypes(): ServiceType[] {
  return Array.from(getRegistry().values());
}
