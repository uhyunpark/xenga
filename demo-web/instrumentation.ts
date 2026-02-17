export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Dynamic imports to avoid bundling server code in the client
      const { registerServiceType } = await import(
        "@server/service-types/index.js"
      );
      const { registerScheme } = await import("@shared/schemes.js");
      const { marketplaceServiceType } = await import(
        "@server/service-types/marketplace.js"
      );
      const { agentServiceType } = await import(
        "@server/service-types/agent-service.js"
      );
      const { escrowScheme } = await import("@server/schemes/escrow.js");
      const { getDb } = await import("@server/db/index.js");
      const { getChainAdapter, isMockChain } = await import("@/lib/chain");

      // Validate config (skip in mock mode — no real private key needed)
      if (!isMockChain()) {
        const { validateConfig } = await import("@server/config.js");
        try {
          validateConfig();
        } catch (e) {
          console.warn("[instrumentation] Config validation warning:", e);
        }
      }

      // Register service types
      registerServiceType(marketplaceServiceType);
      registerServiceType(agentServiceType);

      // Register payment schemes
      registerScheme(escrowScheme);

      // Initialize DB
      getDb();

      // Start event listener (no-op in mock mode)
      getChainAdapter().startEventListener();

      console.log(
        `[instrumentation] x402 escrow server initialized (mock=${isMockChain()})`
      );
    } catch (err) {
      console.error("[instrumentation] Failed to initialize:", err);
    }
  }
}
