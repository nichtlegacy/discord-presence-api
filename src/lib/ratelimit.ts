/**
 * Fixed-window limiter, per client address.
 *
 * ponytail: in-memory counters, single instance. Move to Redis only if this
 * ever runs more than one replica — a personal deployment does not.
 */
import { config } from "../config.ts";

const windows = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + config.limits.rateWindowMs });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > config.limits.rateLimit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Keeps the map from growing without bound on a long-lived process. */
export function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (entry.resetAt < now) windows.delete(key);
  }
}
