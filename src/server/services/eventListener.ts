import { createPublicClient, http } from "viem";
import type { Hash } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import type { OrderStatus } from "../../shared/types.js";
import {
  CHAIN,
  AUTO_VERIFY_DELAY_MS,
  EVENT_LISTENER_MAX_RETRIES,
  EVENT_LISTENER_BASE_BACKOFF_MS,
  EVENT_LISTENER_MAX_BACKOFF_MS,
  EVENT_LISTENER_POLL_INTERVAL_MS,
} from "../../shared/constants.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { updateOrderStatus, getOrderByOrderId } from "./orderService.js";
import { getServiceType } from "../service-types/index.js";
import { logger } from "./logger.js";
import { dispatchWebhookEvent, chainEventToWebhookType } from "./webhookService.js";
import { confirmDeliveryOnChain, resolveDisputeOnChain } from "../facilitator/settler.js";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(config.rpcUrl),
    pollingInterval: EVENT_LISTENER_POLL_INTERVAL_MS,
  });
  return _publicClient;
};

// Track the last processed block for reconciliation
let _lastProcessedBlock: bigint = 0n;

export function getLastProcessedBlock(): bigint {
  return _lastProcessedBlock;
}

/**
 * Watch on-chain events and sync to local DB
 * Uses viem's watchContractEvent for real-time indexing
 */
export function startEventListener() {
  const client = getPublicClient();
  const contractAddress = config.escrowVaultAddress;

  if (!contractAddress) {
    logger.info("events", "No ESCROW_VAULT_ADDRESS set, skipping event listener");
    return;
  }

  logger.info("events", `Watching events on ${contractAddress}`);

  // Run reconciliation on startup
  reconcileMissedEvents(client).catch((err) => {
    logger.error("events", `Startup reconciliation failed: ${(err as Error).message}`);
  });

  // Single consolidated watcher for all EscrowVault events (saves ~7x RPC calls)
  const statusMap: Record<string, OrderStatus> = {
    EscrowCreated: "escrowed",
    DeliveryConfirmed: "delivery_confirmed",
    EscrowReleased: "completed",
    EscrowAutoReleased: "completed",
    EscrowDisputed: "disputed",
    DisputeResolved: "resolved",
    EscrowRefunded: "refunded",
  };

  watchWithReconnect(client, (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      const eventName = (log as any).eventName as string;

      if (!statusMap[eventName]) continue; // skip unknown events (e.g. owner/config events)

      logger.info("events", `${eventName}: escrowId=${args.escrowId}${eventName === "EscrowCreated" ? `, orderId=${args.orderId}` : ""}`);
      trackBlock(log.blockNumber);
      saveEvent(eventName, Number(args.escrowId), log);

      const orderId = eventName === "EscrowCreated"
        ? args.orderId
        : getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, statusMap[eventName]);

      if (eventName === "EscrowCreated") {
        scheduleAutoVerify(Number(args.escrowId), args.orderId);
      }

      if (eventName === "EscrowDisputed") {
        scheduleAutoResolve(Number(args.escrowId));
      }
    }
  });
}

function trackBlock(blockNumber: bigint) {
  if (blockNumber > _lastProcessedBlock) {
    _lastProcessedBlock = blockNumber;
  }
}

function watchWithReconnect(
  client: ReturnType<typeof createPublicClient>,
  onLogs: (logs: any[]) => void
) {
  const contractAddress = config.escrowVaultAddress;
  let retryCount = 0;

  const startWatching = () => {
    if (retryCount >= EVENT_LISTENER_MAX_RETRIES) {
      logger.error("events", `Max retries (${EVENT_LISTENER_MAX_RETRIES}) reached for event watcher. Giving up.`);
      return;
    }

    client.watchContractEvent({
      address: contractAddress,
      abi: escrowVaultAbi,
      onLogs: (logs) => {
        retryCount = 0; // Reset on successful data
        onLogs(logs);
      },
      onError: (error) => {
        retryCount++;
        const backoffMs = Math.min(EVENT_LISTENER_BASE_BACKOFF_MS * Math.pow(2, retryCount - 1), EVENT_LISTENER_MAX_BACKOFF_MS);
        logger.error("events", `Error watching events, retrying in ${backoffMs}ms (attempt ${retryCount}/${EVENT_LISTENER_MAX_RETRIES})`, {
          error: (error as Error).message,
        });
        setTimeout(startWatching, backoffMs);
      },
    });
  };

  startWatching();
}

function saveEvent(eventName: string, escrowId: number, log: any) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO events (event_name, escrow_id, block_number, tx_hash, log_index, data)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      eventName,
      escrowId,
      Number(log.blockNumber),
      log.transactionHash,
      Number(log.logIndex),
      JSON.stringify(log.args ?? {})
    );

    // Dispatch webhook for this event (non-blocking, scoped to seller)
    const webhookType = chainEventToWebhookType(eventName);
    if (webhookType) {
      const orderId = getEscrowOrderId(escrowId);
      const sellerAddress = eventName === "EscrowCreated"
        ? (log.args?.seller as string | undefined)?.toLowerCase()
        : getEscrowSellerAddress(escrowId);
      dispatchWebhookEvent({
        type: webhookType,
        escrowId,
        orderId: orderId ?? undefined,
        sellerAddress,
        txHash: log.transactionHash,
        data: log.args ?? {},
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
  } catch (err) {
    logger.error("events", `Failed to save event: ${(err as Error).message}`);
  }
}

function syncOrderStatus(orderId: `0x${string}`, status: OrderStatus) {
  try {
    const order = getOrderByOrderId(orderId as Hash);
    if (order) {
      updateOrderStatus(order.id, { status });
      logger.info("events", `Updated order ${order.id} to ${status}`);
    }
  } catch (err) {
    logger.error("events", `Failed to sync order status: ${(err as Error).message}`);
  }
}

function getEscrowSellerAddress(escrowId: number): string | undefined {
  const db = getDb();
  // Look up seller from EscrowCreated event first (authoritative)
  const eventRow = db.prepare(
    "SELECT data FROM events WHERE escrow_id = ? AND event_name = 'EscrowCreated' ORDER BY id DESC LIMIT 1"
  ).get(escrowId) as any;
  if (eventRow?.data) {
    try {
      const parsed = JSON.parse(eventRow.data);
      if (parsed.seller) return (parsed.seller as string).toLowerCase();
    } catch {}
  }
  // Fallback: query orders table
  const row = db.prepare(
    "SELECT seller_address FROM orders WHERE escrow_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(escrowId) as any;
  return row?.seller_address?.toLowerCase();
}

function getEscrowOrderId(escrowId: number): Hash | undefined {
  const db = getDb();
  // Look up the orderId from the EscrowCreated event first — this is authoritative
  // because the event carries the orderId directly from the contract.
  // Falling back to the orders table can return stale rows if escrowIds are reused
  // across redeployments (escrow_id is not unique).
  const eventRow = db.prepare(
    "SELECT data FROM events WHERE escrow_id = ? AND event_name = 'EscrowCreated' ORDER BY id DESC LIMIT 1"
  ).get(escrowId) as any;
  if (eventRow?.data) {
    try {
      const parsed = JSON.parse(eventRow.data);
      if (parsed.orderId) return parsed.orderId as Hash;
    } catch {}
  }
  // Fallback: query orders table (most recent match)
  const row = db.prepare(
    "SELECT order_id FROM orders WHERE escrow_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).get(escrowId) as any;
  return row?.order_id;
}

function scheduleAutoVerify(escrowId: number, orderId: `0x${string}`) {
  try {
    const order = getOrderByOrderId(orderId as Hash);
    if (!order) return;

    const serviceType = getServiceType(order.serviceType);
    if (!serviceType?.autoVerify) return;

    logger.info("events", `Scheduling auto-verify for escrow ${escrowId} (${order.serviceType})`);

    // Auto-confirm delivery after a short delay (simulating service completion)
    setTimeout(async () => {
      try {
        // Re-check order status — may have been confirmed already via API
        const freshOrder = getOrderByOrderId(orderId as Hash);
        if (freshOrder && freshOrder.status !== "escrowed") {
          logger.info("events", `Skipping auto-verify for escrow ${escrowId}: order already ${freshOrder.status}`);
          return;
        }

        if (serviceType.verifyDelivery) {
          const verified = await serviceType.verifyDelivery(escrowId, order.id);
          if (!verified) {
            logger.warn("events", `Auto-verify failed for escrow ${escrowId}`);
            return;
          }
        }

        const txHash = await confirmDeliveryOnChain(escrowId);
        if (!txHash) {
          logger.info("events", `Auto-verify skipped for escrow ${escrowId}: already confirmed on-chain`);
          return;
        }
        logger.info("events", `Auto-verified delivery for escrow ${escrowId}: ${txHash}`);
      } catch (err) {
        logger.error("events", `Auto-verify tx failed for escrow ${escrowId}: ${(err as Error).message}`);
      }
    }, AUTO_VERIFY_DELAY_MS);
  } catch (err) {
    logger.error("events", `Failed to schedule auto-verify: ${(err as Error).message}`);
  }
}

function scheduleAutoResolve(escrowId: number) {
  logger.info("events", `Scheduling auto-resolve for escrow ${escrowId} (100% buyer refund)`);

  setTimeout(async () => {
    try {
      const txHash = await resolveDisputeOnChain(escrowId, 100);
      logger.info("events", `Auto-resolved dispute for escrow ${escrowId}: ${txHash}`);

      // Update dispute record in DB
      try {
        const db = getDb();
        db.prepare(
          `UPDATE disputes SET status = 'resolved', buyer_pct = 100, resolved_at = ? WHERE escrow_id = ? AND status = 'open'`
        ).run(Math.floor(Date.now() / 1000), escrowId);
      } catch (dbErr) {
        logger.error("events", `Failed to update dispute record for escrow ${escrowId}: ${(dbErr as Error).message}`);
      }
    } catch (err) {
      logger.error("events", `Auto-resolve tx failed for escrow ${escrowId}: ${(err as Error).message}`);
    }
  }, 3000);
}

// ──────────── Event Reconciliation (Fix 9) ────────────

/**
 * Reconcile missed events on startup by querying historical logs
 * from the last known block. Handles downtime gaps.
 */
async function reconcileMissedEvents(client: ReturnType<typeof createPublicClient>) {
  const db = getDb();

  // Find the highest block number we've already processed
  const lastRow = db.prepare(
    "SELECT MAX(block_number) as maxBlock FROM events"
  ).get() as { maxBlock: number | null } | undefined;

  const fromBlock = lastRow?.maxBlock ? BigInt(lastRow.maxBlock) + 1n : undefined;

  if (!fromBlock) {
    logger.info("events", "No previous events found, skipping reconciliation");
    return;
  }

  logger.info("events", `Reconciling events from block ${fromBlock}`);

  try {
    const logs = await client.getContractEvents({
      address: config.escrowVaultAddress,
      abi: escrowVaultAbi,
      fromBlock,
    });

    let reconciled = 0;
    for (const log of logs) {
      const args = log.args as any;
      const eventName = log.eventName;

      saveEvent(eventName, Number(args.escrowId ?? 0), log);

      // Sync order status based on event type
      const statusMap: Record<string, OrderStatus> = {
        EscrowCreated: "escrowed",
        DeliveryConfirmed: "delivery_confirmed",
        EscrowReleased: "completed",
        EscrowAutoReleased: "completed",
        EscrowDisputed: "disputed",
        DisputeResolved: "resolved",
        EscrowRefunded: "refunded",
      };

      const status = statusMap[eventName];
      if (status) {
        const orderId = eventName === "EscrowCreated"
          ? args.orderId
          : getEscrowOrderId(Number(args.escrowId));
        if (orderId) syncOrderStatus(orderId, status);
        reconciled++;
      }

      trackBlock(log.blockNumber);
    }

    if (reconciled > 0) {
      logger.info("events", `Reconciled ${reconciled} missed events`);
    }
  } catch (err) {
    logger.error("events", `Reconciliation failed: ${(err as Error).message}`);
  }
}
