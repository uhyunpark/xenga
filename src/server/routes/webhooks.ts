import { Router } from "express";
import {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  ALL_EVENT_TYPES,
  type WebhookEventType,
} from "../services/webhookService.js";
import { apiKeyAuth } from "../middleware/auth.js";

const router = Router();

// All webhook management endpoints require API key auth
router.use(apiKeyAuth());

// ──────────── Register webhook ────────────
router.post("/", (req, res) => {
  const { url, secret, eventTypes } = req.body as {
    url?: string;
    secret?: string;
    eventTypes?: string[];
  };

  if (!url || !secret) {
    return res.status(400).json({ error: "url and secret are required" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "url must be a valid URL" });
  }

  if (secret.length < 16) {
    return res.status(400).json({ error: "secret must be at least 16 characters" });
  }

  // Validate event types (default to all if not specified)
  const types: WebhookEventType[] = eventTypes
    ? eventTypes.filter((t): t is WebhookEventType => ALL_EVENT_TYPES.includes(t as WebhookEventType))
    : [...ALL_EVENT_TYPES];

  if (eventTypes && types.length === 0) {
    return res.status(400).json({
      error: `No valid event types provided. Valid types: ${ALL_EVENT_TYPES.join(", ")}`,
    });
  }

  const webhook = registerWebhook(url, secret, types);

  res.status(201).json({
    id: webhook.id,
    url: webhook.url,
    eventTypes: webhook.eventTypes,
    createdAt: webhook.createdAt,
    // Don't echo back the secret
  });
});

// ──────────── List webhooks ────────────
router.get("/", (_req, res) => {
  const webhooks = listWebhooks().map((w) => ({
    id: w.id,
    url: w.url,
    eventTypes: w.eventTypes,
    createdAt: w.createdAt,
    // Don't include secret in list response
  }));
  res.json(webhooks);
});

// ──────────── Delete webhook ────────────
router.delete("/:id", (req, res) => {
  const deleted = deleteWebhook(req.params.id as string);
  if (!deleted) return res.status(404).json({ error: "Webhook not found" });
  res.json({ message: "Webhook deleted" });
});

export default router;
