import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

/**
 * Simple in-memory rate limiter.
 * For production with multiple instances, replace with Redis-backed limiter.
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
    message = "Too many requests, please try again later",
  } = options;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every minute
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 60_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
