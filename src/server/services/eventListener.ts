import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hash } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import type { OrderStatus } from "../../shared/types.js";
import {
  CHAIN,
  AUTO_VERIFY_DELAY_MS,
  EVENT_LISTENER_MAX_RETRIES,
  EVENT_LISTENER_BASE_BACKOFF_MS,
  EVENT_LISTENER_MAX_BACKOFF_MS,
} from "../../shared/constants.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { updateOrderStatus, getOrderByOrderId } from "./orderService.js";
import { getServiceType } from "../service-types/index.js";
import { logger } from "./logger.js";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
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

  // Watch EscrowCreated events
  watchWithReconnect(client, "EscrowCreated", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `EscrowCreated: escrowId=${args.escrowId}, orderId=${args.orderId}`);
      trackBlock(log.blockNumber);
      saveEvent("EscrowCreated", Number(args.escrowId), log);
      syncOrderStatus(args.orderId, "escrowed");
      scheduleAutoVerify(Number(args.escrowId), args.orderId);
    }
  });

  // Watch DeliveryConfirmed events
  watchWithReconnect(client, "DeliveryConfirmed", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `DeliveryConfirmed: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("DeliveryConfirmed", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "delivery_confirmed");
    }
  });

  // Watch EscrowReleased events
  watchWithReconnect(client, "EscrowReleased", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `EscrowReleased: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("EscrowReleased", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "completed");
    }
  });

  // Watch EscrowAutoReleased events
  watchWithReconnect(client, "EscrowAutoReleased", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `EscrowAutoReleased: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("EscrowAutoReleased", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "completed");
    }
  });

  // Watch EscrowDisputed events
  watchWithReconnect(client, "EscrowDisputed", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `EscrowDisputed: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("EscrowDisputed", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "disputed");
    }
  });

  // Watch DisputeResolved events
  watchWithReconnect(client, "DisputeResolved", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `DisputeResolved: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("DisputeResolved", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "resolved");
    }
  });

  // Watch EscrowRefunded events
  watchWithReconnect(client, "EscrowRefunded", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      logger.info("events", `EscrowRefunded: escrowId=${args.escrowId}`);
      trackBlock(log.blockNumber);
      saveEvent("EscrowRefunded", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "refunded");
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
  eventName: string,
  onLogs: (logs: any[]) => void
) {
  const contractAddress = config.escrowVaultAddress;
  let retryCount = 0;

  const startWatching = () => {
    if (retryCount >= EVENT_LISTENER_MAX_RETRIES) {
      logger.error("events", `Max retries (${EVENT_LISTENER_MAX_RETRIES}) reached for ${eventName}. Giving up.`);
      return;
    }

    client.watchContractEvent({
      address: contractAddress,
      abi: escrowVaultAbi,
      eventName: eventName as any,
      onLogs: (logs) => {
        retryCount = 0; // Reset on successful data
        onLogs(logs);
      },
      onError: (error) => {
        retryCount++;
        const backoffMs = Math.min(EVENT_LISTENER_BASE_BACKOFF_MS * Math.pow(2, retryCount - 1), EVENT_LISTENER_MAX_BACKOFF_MS);
        logger.error("events", `Error watching ${eventName}, retrying in ${backoffMs}ms (attempt ${retryCount}/${EVENT_LISTENER_MAX_RETRIES})`, {
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

function getEscrowOrderId(escrowId: number): Hash | undefined {
  const db = getDb();
  const row = db.prepare("SELECT order_id FROM orders WHERE escrow_id = ?").get(escrowId) as any;
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
        if (serviceType.verifyDelivery) {
          const verified = await serviceType.verifyDelivery(escrowId, order.id);
          if (!verified) {
            logger.warn("events", `Auto-verify failed for escrow ${escrowId}`);
            return;
          }
        }

        const account = privateKeyToAccount(config.privateKey);
        const walletClient = createWalletClient({
          chain: CHAIN,
          transport: http(config.rpcUrl),
          account,
        });

        const txHash = await walletClient.writeContract({
          address: config.escrowVaultAddress,
          abi: escrowVaultAbi,
          functionName: "confirmDelivery",
          args: [BigInt(escrowId)],
        });
        logger.info("events", `Auto-verified delivery for escrow ${escrowId}: ${txHash}`);
      } catch (err) {
        logger.error("events", `Auto-verify tx failed for escrow ${escrowId}: ${(err as Error).message}`);
      }
    }, AUTO_VERIFY_DELAY_MS);
  } catch (err) {
    logger.error("events", `Failed to schedule auto-verify: ${(err as Error).message}`);
  }
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
