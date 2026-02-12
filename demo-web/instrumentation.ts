export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic imports to avoid bundling server code in the client
    const { registerServiceType } = await import(
      "@server/service-types/index"
    );
    const { marketplaceServiceType } = await import(
      "@server/service-types/marketplace"
    );
    const { agentServiceType } = await import(
      "@server/service-types/agent-service"
    );
    const { getDb } = await import("@server/db/index");
    const { validateConfig } = await import("@server/config");
    const { startEventListener } = await import(
      "@server/services/eventListener"
    );

    // Validate config
    try {
      validateConfig();
    } catch (e) {
      console.warn("[instrumentation] Config validation warning:", e);
    }

    // Register service types
    registerServiceType(marketplaceServiceType);
    registerServiceType(agentServiceType);

    // Initialize DB
    getDb();

    // Start event listener
    startEventListener();

    console.log("[instrumentation] x402 escrow server initialized");
  }
}
