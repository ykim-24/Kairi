import { getLogger } from "./logger.js";

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryOn = () => true,
  } = opts;
  const log = getLogger();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts || !retryOn(error)) throw error;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      log.warn({ attempt, maxAttempts, delayMs: Math.round(jitter) }, "Retrying after error");
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw new Error("unreachable");
}
