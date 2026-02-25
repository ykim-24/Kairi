import { getLogger } from "./logger.js";

interface RateLimitState {
  remaining: number;
  reset: number; // epoch seconds
}

const state: Map<string, RateLimitState> = new Map();

export function updateRateLimit(
  key: string,
  headers: Record<string, string | undefined>
): void {
  const remaining = parseInt(headers["x-ratelimit-remaining"] ?? "", 10);
  const reset = parseInt(headers["x-ratelimit-reset"] ?? "", 10);
  if (!isNaN(remaining) && !isNaN(reset)) {
    state.set(key, { remaining, reset });
  }
}

export async function waitIfNeeded(key: string): Promise<void> {
  const limit = state.get(key);
  if (!limit || limit.remaining > 10) return;

  const waitMs = Math.max(0, limit.reset * 1000 - Date.now()) + 1000;
  if (waitMs > 0 && waitMs < 120_000) {
    getLogger().warn({ key, waitMs, remaining: limit.remaining }, "Rate limit low, waiting");
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

export function getRateLimitState(key: string): RateLimitState | undefined {
  return state.get(key);
}
