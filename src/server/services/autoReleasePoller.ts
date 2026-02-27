import { getDb } from "../db/index.js";
import { isReleasable } from "./escrowService.js";
import { autoReleaseOnChain } from "../facilitator/settler.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 60_000; // 1 minute

/**
 * Periodically checks for escrows eligible for auto-release and triggers them.
 *
 * Replaces any external automation (e.g. Chainlink Keepers). The facilitator
 * server is already the operator paying gas — it simply calls the permissionless
 * `autoRelease()` on EscrowVault when `isReleasable()` returns true.
 *
 * Query: orders in "escrowed" or "delivery_confirmed" status with a non-null
 * escrow_id are candidates. For each, call the on-chain `isReleasable` view —
 * if true, submit the `autoRelease` tx.
 */
export function startAutoReleasePoller() {
  const run = async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT escrow_id FROM orders WHERE status IN ('escrowed', 'delivery_confirmed') AND escrow_id IS NOT NULL"
        )
        .all() as { escrow_id: number }[];

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          const releasable = await isReleasable(row.escrow_id);
          if (!releasable) continue;

          logger.info("auto-release", `Triggering autoRelease for escrow ${row.escrow_id}`);
          const txHash = await autoReleaseOnChain(row.escrow_id);
          logger.info("auto-release", `Auto-released escrow ${row.escrow_id}: ${txHash}`);
        } catch (err) {
          // Log and continue — don't let one failure block others
          logger.error(
            "auto-release",
            `Failed to auto-release escrow ${row.escrow_id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch (err) {
      logger.error(
        "auto-release",
        `Poller failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // Run once on startup, then periodically
  run();
  setInterval(run, POLL_INTERVAL_MS).unref();
  logger.info("auto-release", "Auto-release poller started (every 60s)");
}
