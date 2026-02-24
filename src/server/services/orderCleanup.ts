import { getDb } from "../db/index.js";
import { logger } from "./logger.js";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_S = 10 * 60; // 10 minutes

/**
 * Periodically reverts orders stuck in `pending_payment` back to `created`.
 *
 * This handles the edge case where the server crashes between claimOrder()
 * (which transitions created → pending_payment) and settlement completion
 * (or revertOrderClaim on failure). Without cleanup, these orders would be
 * permanently unpayable.
 */
export function startOrderCleanup() {
  const run = () => {
    try {
      const db = getDb();
      const cutoff = Math.floor(Date.now() / 1000) - STALE_THRESHOLD_S;
      const result = db
        .prepare(
          "UPDATE orders SET status = 'created', updated_at = ? WHERE status = 'pending_payment' AND updated_at < ?"
        )
        .run(Math.floor(Date.now() / 1000), cutoff);

      if (result.changes > 0) {
        logger.info(
          "cleanup",
          `Reverted ${result.changes} stuck pending_payment order(s) to created`
        );
      }
    } catch (err) {
      logger.error(
        "cleanup",
        `Order cleanup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // Run once immediately on startup, then periodically
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
  logger.info("cleanup", "Order cleanup started (every 5 min, 10 min threshold)");
}
