import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hash } from "viem";
import { escrowVaultAbi } from "../../shared/abi.js";
import type { OrderStatus } from "../../shared/types.js";
import { CHAIN } from "../../shared/constants.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { updateOrderStatus, getOrderByOrderId } from "./orderService.js";
import { getServiceType } from "../service-types/index.js";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;
const getPublicClient = () => {
  if (!_publicClient) _publicClient = createPublicClient({ chain: CHAIN, transport: http(config.rpcUrl) });
  return _publicClient;
};

/**
 * Watch on-chain events and sync to local DB
 * Uses viem's watchContractEvent for real-time indexing
 */
export function startEventListener() {
  const client = getPublicClient();
  const contractAddress = config.escrowVaultAddress;

  if (!contractAddress) {
    console.log(
      "[EventListener] No ESCROW_VAULT_ADDRESS set, skipping event listener"
    );
    return;
  }

  console.log(
    `[EventListener] Watching events on ${contractAddress}`
  );

  // Watch EscrowCreated events
  watchWithReconnect(client, "EscrowCreated", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] EscrowCreated: escrowId=${args.escrowId}, orderId=${args.orderId}`
      );
      saveEvent("EscrowCreated", Number(args.escrowId), log);
      syncOrderStatus(args.orderId, "escrowed");
      scheduleAutoVerify(Number(args.escrowId), args.orderId);
    }
  });

  // Watch DeliveryConfirmed events
  watchWithReconnect(client, "DeliveryConfirmed", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] DeliveryConfirmed: escrowId=${args.escrowId}`
      );
      saveEvent("DeliveryConfirmed", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "delivery_confirmed");
    }
  });

  // Watch EscrowReleased events
  watchWithReconnect(client, "EscrowReleased", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] EscrowReleased: escrowId=${args.escrowId}`
      );
      saveEvent("EscrowReleased", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "completed");
    }
  });

  // Watch EscrowAutoReleased events
  watchWithReconnect(client, "EscrowAutoReleased", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] EscrowAutoReleased: escrowId=${args.escrowId}`
      );
      saveEvent("EscrowAutoReleased", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "completed");
    }
  });

  // Watch EscrowDisputed events
  watchWithReconnect(client, "EscrowDisputed", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] EscrowDisputed: escrowId=${args.escrowId}`
      );
      saveEvent("EscrowDisputed", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "disputed");
    }
  });

  // Watch DisputeResolved events
  watchWithReconnect(client, "DisputeResolved", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] DisputeResolved: escrowId=${args.escrowId}`
      );
      saveEvent("DisputeResolved", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "resolved");
    }
  });

  // Watch EscrowRefunded events
  watchWithReconnect(client, "EscrowRefunded", (logs) => {
    for (const log of logs) {
      const args = log.args as any;
      console.log(
        `[Event] EscrowRefunded: escrowId=${args.escrowId}`
      );
      saveEvent("EscrowRefunded", Number(args.escrowId), log);
      const orderId = getEscrowOrderId(Number(args.escrowId));
      if (orderId) syncOrderStatus(orderId, "refunded");
    }
  });
}

function watchWithReconnect(
  client: ReturnType<typeof createPublicClient>,
  eventName: string,
  onLogs: (logs: any[]) => void
) {
  const contractAddress = config.escrowVaultAddress;

  const startWatching = () => {
    client.watchContractEvent({
      address: contractAddress,
      abi: escrowVaultAbi,
      eventName: eventName as any,
      onLogs,
      onError: (error) => {
        console.error(`[EventListener] Error watching ${eventName}:`, error);
        setTimeout(startWatching, 5000);
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
    console.error(`[EventListener] Failed to save event: ${err}`);
  }
}

function syncOrderStatus(orderId: `0x${string}`, status: OrderStatus) {
  try {
    const order = getOrderByOrderId(orderId as Hash);
    if (order) {
      updateOrderStatus(order.id, { status });
      console.log(`[EventListener] Updated order ${order.id} to ${status}`);
    }
  } catch (err) {
    console.error(`[EventListener] Failed to sync order status: ${err}`);
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

    console.log(`[EventListener] Scheduling auto-verify for escrow ${escrowId} (${order.serviceType})`);

    // Auto-confirm delivery after a short delay (simulating service completion)
    setTimeout(async () => {
      try {
        if (serviceType.verifyDelivery) {
          const verified = await serviceType.verifyDelivery(escrowId, order.id);
          if (!verified) {
            console.log(`[EventListener] Auto-verify failed for escrow ${escrowId}`);
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
        console.log(`[EventListener] Auto-verified delivery for escrow ${escrowId}: ${txHash}`);
      } catch (err) {
        console.error(`[EventListener] Auto-verify tx failed for escrow ${escrowId}:`, err);
      }
    }, 5000); // 5 second delay to simulate service completion
  } catch (err) {
    console.error(`[EventListener] Failed to schedule auto-verify: ${err}`);
  }
}
