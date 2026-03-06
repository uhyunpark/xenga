import { createHmac, randomUUID } from "crypto";
import { getDb } from "../db/index.js";
import { logger } from "./logger.js";

// ──────────── Types ────────────

export type WebhookEventType =
  | "escrow.created"
  | "escrow.released"
  | "escrow.auto_released"
  | "escrow.disputed"
  | "escrow.resolved"
  | "escrow.refunded"
  | "delivery.confirmed";

export const ALL_EVENT_TYPES: WebhookEventType[] = [
  "escrow.created",
  "escrow.released",
  "escrow.auto_released",
  "escrow.disputed",
  "escrow.resolved",
  "escrow.refunded",
  "delivery.confirmed",
];

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  eventTypes: WebhookEventType[];
  createdAt: number;
}

export interface WebhookEvent {
  type: WebhookEventType;
  escrowId: number;
  orderId?: string;
  txHash?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ──────────── Registration ────────────

export function registerWebhook(
  url: string,
  secret: string,
  eventTypes: WebhookEventType[],
  sellerAddress?: string
): Webhook {
  const db = getDb();
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO webhooks (id, url, secret, event_types, seller_address, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, url, secret, JSON.stringify(eventTypes), sellerAddress || null, now);

  return { id, url, secret, eventTypes, createdAt: now };
}

export function listWebhooks(sellerAddress?: string): Webhook[] {
  const db = getDb();
  if (sellerAddress) {
    const rows = db.prepare("SELECT * FROM webhooks WHERE seller_address = ? ORDER BY created_at DESC").all(sellerAddress) as any[];
    return rows.map(toWebhook);
  }
  const rows = db.prepare("SELECT * FROM webhooks ORDER BY created_at DESC").all() as any[];
  return rows.map(toWebhook);
}

export function deleteWebhook(id: string, sellerAddress?: string): boolean {
  const db = getDb();
  if (sellerAddress) {
    const result = db.prepare("DELETE FROM webhooks WHERE id = ? AND seller_address = ?").run(id, sellerAddress);
    return result.changes > 0;
  }
  const result = db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
  return result.changes > 0;
}

function toWebhook(row: any): Webhook {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    eventTypes: JSON.parse(row.event_types),
    createdAt: row.created_at,
  };
}

// ──────────── Dispatch ────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 25000]; // 1s, 5s, 25s

/**
 * Dispatch a webhook event to all registered webhooks that match the event type.
 * Non-blocking — fires and forgets with retries.
 */
export function dispatchWebhookEvent(event: WebhookEvent): void {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM webhooks").all() as any[];
    const webhooks = rows.map(toWebhook);

    for (const webhook of webhooks) {
      if (!webhook.eventTypes.includes(event.type)) continue;
      deliverWithRetry(webhook, event, 0);
    }
  } catch (err) {
    logger.error(
      "webhooks",
      `Failed to dispatch webhook event: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function deliverWithRetry(
  webhook: Webhook,
  event: WebhookEvent,
  attempt: number
): Promise<void> {
  const payload = JSON.stringify(event);
  const signature = createHmac("sha256", webhook.secret)
    .update(payload)
    .digest("hex");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": event.type,
        "X-Webhook-Id": webhook.id,
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok && attempt < MAX_RETRIES) {
      logger.warn(
        "webhooks",
        `Webhook ${webhook.id} returned ${response.status}, retrying (${attempt + 1}/${MAX_RETRIES})`
      );
      setTimeout(() => deliverWithRetry(webhook, event, attempt + 1), RETRY_DELAYS[attempt]);
      return;
    }

    if (response.ok) {
      logger.debug("webhooks", `Delivered ${event.type} to ${webhook.url}`);
    } else {
      logger.error(
        "webhooks",
        `Webhook ${webhook.id} failed after ${MAX_RETRIES} retries (last status: ${response.status})`
      );
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      logger.warn(
        "webhooks",
        `Webhook ${webhook.id} delivery error, retrying (${attempt + 1}/${MAX_RETRIES}): ${err instanceof Error ? err.message : String(err)}`
      );
      setTimeout(() => deliverWithRetry(webhook, event, attempt + 1), RETRY_DELAYS[attempt]);
    } else {
      logger.error(
        "webhooks",
        `Webhook ${webhook.id} failed after ${MAX_RETRIES} retries: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// ──────────── Event name mapping ────────────

/** Map on-chain event names to webhook event types */
export function chainEventToWebhookType(eventName: string): WebhookEventType | undefined {
  const map: Record<string, WebhookEventType> = {
    EscrowCreated: "escrow.created",
    EscrowReleased: "escrow.released",
    EscrowAutoReleased: "escrow.auto_released",
    EscrowDisputed: "escrow.disputed",
    DisputeResolved: "escrow.resolved",
    EscrowRefunded: "escrow.refunded",
    DeliveryConfirmed: "delivery.confirmed",
  };
  return map[eventName];
}
