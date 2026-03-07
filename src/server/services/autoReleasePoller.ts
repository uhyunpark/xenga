import { getDb } from "../db/index.js";
import { batchIsReleasable } from "./escrowService.js";
import { autoReleaseOnChain, batchAutoReleaseOnChain } from "../facilitator/settler.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 60_000; // 1 minute
const MAX_BATCH_SIZE = 50; // Safety cap per batch transaction

/**
 * Periodically checks for escrows eligible for auto-release and triggers them.
 *
 * Uses batch RPC calls (batchIsReleasable) to check eligibility in a single
 * call, then submits a single batchAutoRelease transaction for all releasable
 * escrows. Falls back to individual autoRelease calls if batch fails.
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

      const escrowIds = rows.map((r) => r.escrow_id);

      // Single RPC call to check all candidates
      let releasableFlags: boolean[];
      try {
        releasableFlags = await batchIsReleasable(escrowIds);
      } catch (err) {
        logger.error(
          "auto-release",
          `batchIsReleasable failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      const releasableIds = escrowIds.filter((_, i) => releasableFlags[i]);
      if (releasableIds.length === 0) return;

      logger.info("auto-release", `Found ${releasableIds.length} releasable escrow(s)`);

      // Process in batches of MAX_BATCH_SIZE
      for (let i = 0; i < releasableIds.length; i += MAX_BATCH_SIZE) {
        const batch = releasableIds.slice(i, i + MAX_BATCH_SIZE);

        if (batch.length === 1) {
          // Single escrow — use direct call (cheaper, no self-call overhead)
          try {
            const txHash = await autoReleaseOnChain(batch[0]);
            logger.info("auto-release", `Auto-released escrow ${batch[0]}: ${txHash}`);
          } catch (err) {
            logger.error(
              "auto-release",
              `Failed to auto-release escrow ${batch[0]}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          continue;
        }

        try {
          const { txHash, released } = await batchAutoReleaseOnChain(batch);
          logger.info(
            "auto-release",
            `Batch auto-released ${released}/${batch.length} escrows: ${txHash}`
          );
        } catch (err) {
          // Batch failed — fall back to individual calls
          logger.error(
            "auto-release",
            `Batch auto-release failed, falling back to individual calls: ${err instanceof Error ? err.message : String(err)}`
          );
          for (const escrowId of batch) {
            try {
              const txHash = await autoReleaseOnChain(escrowId);
              logger.info("auto-release", `Auto-released escrow ${escrowId}: ${txHash}`);
            } catch (innerErr) {
              logger.error(
                "auto-release",
                `Failed to auto-release escrow ${escrowId}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`
              );
            }
          }
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
