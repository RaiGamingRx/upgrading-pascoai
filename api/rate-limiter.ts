/**
 * PASCOAI ENTERPRISE RATE LIMITING SUBSYSTEM
 * 
 * Implements a distributed-ready, multi-backend rate limiter:
 * 1. PostgresRateLimitStore: Durable, atomic sliding-window in PostgreSQL
 * 2. MemoryRateLimitStore: Fast sliding-window for tests / development
 * 3. Pluggable Store Boundary: Clean abstraction for external Redis / distributed cluster
 */

import { getActiveDriver, getPool } from "./db-engine.ts";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  close?(): Promise<void>;
}

// ----------------------------------------------------------------------------
// 1. IN-MEMORY SLIDING-WINDOW STORE
// ----------------------------------------------------------------------------
export class MemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, { count: number; windowStart: number; expiresAt: number }>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || entry.expiresAt <= now) {
      const resetAt = now + windowMs;
      this.entries.set(key, { count: 1, windowStart: now, expiresAt: resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSec: 0,
        resetAt,
      };
    }

    entry.count += 1;
    this.entries.set(key, entry);

    const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);

    return {
      allowed,
      remaining,
      retryAfterSec: allowed ? 0 : retryAfterSec,
      resetAt: entry.expiresAt,
    };
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

// ----------------------------------------------------------------------------
// 2. POSTGRESQL ATOMIC DURABLE RATE LIMIT STORE
// ----------------------------------------------------------------------------
export class PostgresRateLimitStore implements RateLimitStore {
  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const pool = getPool();
    const nowMs = Date.now();

    const query = `
      INSERT INTO auth_rate_limits (key, points, window_start, expires_at)
      VALUES ($1, 1, NOW(), NOW() + ($2 || ' milliseconds')::INTERVAL)
      ON CONFLICT (key) DO UPDATE
        SET points = CASE
          WHEN auth_rate_limits.expires_at <= NOW() THEN 1
          ELSE auth_rate_limits.points + 1
        END,
        window_start = CASE
          WHEN auth_rate_limits.expires_at <= NOW() THEN NOW()
          ELSE auth_rate_limits.window_start
        END,
        expires_at = CASE
          WHEN auth_rate_limits.expires_at <= NOW() THEN NOW() + ($2 || ' milliseconds')::INTERVAL
          ELSE auth_rate_limits.expires_at
        END
      RETURNING points, expires_at;
    `;

    try {
      const res = await pool.query(query, [key, windowMs]);
      const row = res.rows[0];
      const points = Number(row.points);
      const expiresAt = new Date(row.expires_at).getTime();
      const retryAfterSec = Math.max(1, Math.ceil((expiresAt - nowMs) / 1000));
      const allowed = points <= limit;
      const remaining = Math.max(0, limit - points);

      return {
        allowed,
        remaining,
        retryAfterSec: allowed ? 0 : retryAfterSec,
        resetAt: expiresAt,
      };
    } catch {
      // If Postgres rate limit query fails (e.g. table not yet initialized), fail-safe to memory
      return defaultMemoryStore.consume(key, limit, windowMs);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      const pool = getPool();
      await pool.query("DELETE FROM auth_rate_limits WHERE key = $1", [key]);
    } catch {
      await defaultMemoryStore.reset(key);
    }
  }
}

// ----------------------------------------------------------------------------
// 3. STORE FACTORY & CONFIGURATION BOUNDARY
// ----------------------------------------------------------------------------
const defaultMemoryStore = new MemoryRateLimitStore();
const defaultPostgresStore = new PostgresRateLimitStore();
let customStore: RateLimitStore | null = null;

/**
 * Configure a custom distributed store (e.g. Redis adapter) for production clusters.
 */
export function setCustomRateLimitStore(store: RateLimitStore | null): void {
  customStore = store;
}

export function getActiveRateLimitStore(): RateLimitStore {
  if (customStore) return customStore;
  if (getActiveDriver() === "postgres") return defaultPostgresStore;
  return defaultMemoryStore;
}

/**
 * Helper to check rate limit for an action and return allowed/retryAfter.
 */
export async function checkAuthRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const key = `ratelimit:${scope}:${identifier}`;
  const store = getActiveRateLimitStore();
  const res = await store.consume(key, limit, windowMs);
  return {
    allowed: res.allowed,
    retryAfterSec: res.retryAfterSec,
  };
}

/**
 * Helper to reset a rate limit key (e.g. after successful auth)
 */
export async function resetAuthRateLimit(scope: string, identifier: string): Promise<void> {
  const key = `ratelimit:${scope}:${identifier}`;
  const store = getActiveRateLimitStore();
  await store.reset(key);
}

export function clearMemoryRateLimits(): void {
  defaultMemoryStore.clear();
}
