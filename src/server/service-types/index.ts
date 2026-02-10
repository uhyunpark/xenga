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

const registry = new Map<string, ServiceType>();

export function registerServiceType(serviceType: ServiceType) {
  registry.set(serviceType.name, serviceType);
}

export function getServiceType(name: string): ServiceType | undefined {
  return registry.get(name);
}

export function getAllServiceTypes(): ServiceType[] {
  return Array.from(registry.values());
}
