/**
 * Cache Adapter Interface
 *
 * Abstracts over in-memory Map (default) and Redis so the
 * application can use either backend depending on config.
 *
 * To enable Redis:
 *   1. Install `ioredis`: bun add ioredis
 *   2. Set REDIS_URL env var (e.g. redis://localhost:6379)
 *   3. Uncomment the Redis implementation below
 */

export interface CacheAdapter<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// ──────────── In-Memory LRU Cache (default) ────────────

export class InMemoryLruCache<T> implements CacheAdapter<T> {
  private store = new Map<string, { data: T; expiresAt: number }>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;

    // Periodic cleanup every 5 minutes
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.expiresAt <= now) {
          this.store.delete(key);
        }
      }
    }, 5 * 60_000);
    interval.unref();
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // LRU: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.delete(key);
    if (this.store.size >= this.maxSize) {
      const lruKey = this.store.keys().next().value;
      if (lruKey) this.store.delete(lruKey);
    }
    this.store.set(key, { data: value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// ──────────── Redis Cache (stub) ────────────
//
// To implement:
//
// import Redis from "ioredis";
//
// export class RedisCacheAdapter<T> implements CacheAdapter<T> {
//   private redis: Redis;
//   private prefix: string;
//
//   constructor(redisUrl: string, prefix: string = "xenga:") {
//     this.redis = new Redis(redisUrl);
//     this.prefix = prefix;
//   }
//
//   async get(key: string): Promise<T | undefined> {
//     const raw = await this.redis.get(this.prefix + key);
//     return raw ? JSON.parse(raw) : undefined;
//   }
//
//   async set(key: string, value: T, ttlMs: number): Promise<void> {
//     await this.redis.set(this.prefix + key, JSON.stringify(value), "PX", ttlMs);
//   }
//
//   async delete(key: string): Promise<void> {
//     await this.redis.del(this.prefix + key);
//   }
// }

/**
 * Factory: returns Redis adapter if REDIS_URL is set, otherwise in-memory.
 */
export function createCache<T>(maxSize: number = 1000): CacheAdapter<T> {
  // Uncomment when ioredis is installed:
  // if (process.env.REDIS_URL) {
  //   return new RedisCacheAdapter<T>(process.env.REDIS_URL);
  // }
  return new InMemoryLruCache<T>(maxSize);
}
