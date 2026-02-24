/**
 * Retry logic with exponential backoff for transient blockchain/network failures.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms — doubles each attempt (default: 2000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 16000) */
  maxDelayMs?: number;
  /** Custom predicate to decide if an error is retryable (default: isRetryableError) */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 16000;

/**
 * Determine if an error is likely transient and worth retrying.
 * Covers RPC timeouts, rate limits, nonce errors, and network failures.
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("nonce too low") ||
    lower.includes("replacement underpriced") ||
    lower.includes("already known") ||
    lower.includes("intrinsic gas too low")
  );
}

/**
 * Execute `fn` with exponential backoff retries on transient errors.
 *
 * ```ts
 * const result = await withRetry(() => submitTransaction(), { maxRetries: 3 });
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = options?.isRetryable ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError; // unreachable, but satisfies TS
}
