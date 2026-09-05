-- ==============================================================================
-- PASCOAI ENTERPRISE OS — AUTHENTICATION, MFA CHALLENGE REPLAY RESISTANCE & ATOMIC CONSUMPTION
-- STAGE 8.2 / MILESTONE 1: CONCURRENCY HARDENING, REPLAY PROTECTION & TOKEN REVOCATION
-- ==============================================================================

-- 1. Consumed MFA Challenges table for single-use / replay resistance
CREATE TABLE IF NOT EXISTS consumed_mfa_challenges (
    jti VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expires ON consumed_mfa_challenges(expires_at);

-- 2. MFA Challenge failed attempt counters for brute-force mitigation
CREATE TABLE IF NOT EXISTS mfa_challenge_attempts (
    jti VARCHAR(64) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
