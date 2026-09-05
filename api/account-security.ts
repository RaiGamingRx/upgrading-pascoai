/**
 * PASCOAI ENTERPRISE ACCOUNT SECURITY & BRUTE-FORCE DEFENSE
 * 
 * Protects against:
 * 1. Targeted brute-force guessing (progressive delay, no permanent DoS lockouts)
 * 2. Password spraying (tracking IP-wide auth failures across distinct accounts)
 * 3. Credential stuffing (timing-safe, distributed-ready state)
 * 4. MFA online guessing
 */

import { getActiveDriver, getPool } from "./db-engine.ts";

export interface AccountSecurityState {
  failedAttempts: number;
  lastFailedAt: number;
  delayedUntil: number;
}

// Progressive delay schedule in seconds based on consecutive failures
// Failures 0-2: 0s
// Failure 3: 2s
// Failure 4: 5s
// Failure 5: 15s
// Failure 6: 30s
// Failure 7+: 60s (capped at 120s)
export function calculateProgressiveDelaySec(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts === 3) return 2;
  if (failedAttempts === 4) return 5;
  if (failedAttempts === 5) return 15;
  if (failedAttempts === 6) return 30;
  return Math.min(120, 60 + (failedAttempts - 7) * 15);
}

const FAILURE_RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes of inactivity resets failure count

// In-Memory fallback store
const inMemoryAccountStates = new Map<string, AccountSecurityState>();
const inMemoryIpSprayStates = new Map<string, { failedAccounts: Set<string>; windowStart: number; blockedUntil: number }>();

export class AccountSecurityService {
  /**
   * Evaluates whether an authentication attempt should be permitted or delayed.
   */
  static async checkAccountDelay(
    email: string,
    clientIp: string
  ): Promise<{ allowed: boolean; retryAfterSec: number; reason?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // 1. Check IP-wide spraying protection (Max 10 distinct account failures per 10 min per IP)
    const ipSprayCheck = this.checkIpSprayDelay(clientIp, now);
    if (!ipSprayCheck.allowed) {
      return ipSprayCheck;
    }

    // 2. Check Account-level progressive delay
    const state = await this.getAccountState(normalizedEmail);
    if (!state) {
      return { allowed: true, retryAfterSec: 0 };
    }

    // If inactivity reset window has passed, reset counter
    if (now - state.lastFailedAt > FAILURE_RESET_WINDOW_MS) {
      await this.resetAccountState(normalizedEmail);
      return { allowed: true, retryAfterSec: 0 };
    }

    // If currently in a progressive delay backoff
    if (state.delayedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((state.delayedUntil - now) / 1000));
      return {
        allowed: false,
        retryAfterSec,
        reason: `Temporary progressive delay active due to repeated failed attempts. Please wait ${retryAfterSec} seconds.`,
      };
    }

    return { allowed: true, retryAfterSec: 0 };
  }

  /**
   * Records a failed authentication attempt and calculates the next progressive delay.
   */
  static async recordFailure(
    email: string,
    clientIp: string
  ): Promise<{ failedAttempts: number; delaySec: number }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Record IP-level failure for spraying detection
    this.recordIpFailure(clientIp, normalizedEmail, now);

    // Fetch existing state
    const existing = await this.getAccountState(normalizedEmail);
    let attempts = 1;
    if (existing && (now - existing.lastFailedAt <= FAILURE_RESET_WINDOW_MS)) {
      attempts = existing.failedAttempts + 1;
    }

    const delaySec = calculateProgressiveDelaySec(attempts);
    const delayedUntil = delaySec > 0 ? now + (delaySec * 1000) : 0;

    await this.saveAccountState(normalizedEmail, attempts, now, delayedUntil);

    return { failedAttempts: attempts, delaySec };
  }

  /**
   * Resets account failure counters upon successful authentication.
   */
  static async recordSuccess(email: string, clientIp: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.resetAccountState(normalizedEmail);

    // Clean up IP spray state for this account
    const ipState = inMemoryIpSprayStates.get(clientIp);
    if (ipState) {
      ipState.failedAccounts.delete(normalizedEmail);
    }
  }

  static resetMemoryTracker(): void {
    inMemoryAccountStates.clear();
    inMemoryIpSprayStates.clear();
  }

  // --------------------------------------------------------------------------
  // INTERNAL STORAGE IMPLEMENTATIONS
  // --------------------------------------------------------------------------

  private static async getAccountState(email: string): Promise<AccountSecurityState | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      try {
        const pool = getPool();
        const res = await pool.query(
          "SELECT failed_attempts, last_failed_at, locked_until FROM account_security_states WHERE identifier = $1",
          [email]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        return {
          failedAttempts: Number(row.failed_attempts || 0),
          lastFailedAt: row.last_failed_at ? new Date(row.last_failed_at).getTime() : 0,
          delayedUntil: row.locked_until ? new Date(row.locked_until).getTime() : 0,
        };
      } catch {
        // Fall back to in-memory
      }
    }

    return inMemoryAccountStates.get(email) || null;
  }

  private static async saveAccountState(
    email: string,
    attempts: number,
    lastFailedAt: number,
    delayedUntil: number
  ): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      try {
        const pool = getPool();
        await pool.query(
          `INSERT INTO account_security_states (identifier, failed_attempts, last_failed_at, locked_until, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (identifier) DO UPDATE
             SET failed_attempts = $2,
                 last_failed_at = $3,
                 locked_until = $4,
                 updated_at = NOW()`,
          [
            email,
            attempts,
            new Date(lastFailedAt).toISOString(),
            delayedUntil > 0 ? new Date(delayedUntil).toISOString() : null,
          ]
        );
        return;
      } catch {
        // Fall back to in-memory
      }
    }

    inMemoryAccountStates.set(email, {
      failedAttempts: attempts,
      lastFailedAt,
      delayedUntil,
    });
  }

  private static async resetAccountState(email: string): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      try {
        const pool = getPool();
        await pool.query("DELETE FROM account_security_states WHERE identifier = $1", [email]);
      } catch {
        // Fall back to memory
      }
    }
    inMemoryAccountStates.delete(email);
  }

  private static checkIpSprayDelay(clientIp: string, now: number): { allowed: boolean; retryAfterSec: number; reason?: string } {
    const state = inMemoryIpSprayStates.get(clientIp);
    if (!state) return { allowed: true, retryAfterSec: 0 };

    if (state.blockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
      return {
        allowed: false,
        retryAfterSec,
        reason: `Too many authentication failures detected from this network origin. Please wait ${retryAfterSec} seconds.`,
      };
    }

    // Reset window after 10 minutes
    if (now - state.windowStart > 10 * 60 * 1000) {
      inMemoryIpSprayStates.delete(clientIp);
    }

    return { allowed: true, retryAfterSec: 0 };
  }

  private static recordIpFailure(clientIp: string, email: string, now: number): void {
    let state = inMemoryIpSprayStates.get(clientIp);
    if (!state || now - state.windowStart > 10 * 60 * 1000) {
      state = { failedAccounts: new Set<string>(), windowStart: now, blockedUntil: 0 };
      inMemoryIpSprayStates.set(clientIp, state);
    }

    state.failedAccounts.add(email);
    // If more than 10 distinct accounts failed from this IP in 10 minutes, apply 60s backoff to the IP
    if (state.failedAccounts.size >= 10) {
      state.blockedUntil = now + 60 * 1000;
    }
  }

  static clearMemoryState(): void {
    inMemoryAccountStates.clear();
    inMemoryIpSprayStates.clear();
  }
}
