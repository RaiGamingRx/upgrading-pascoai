-- ==============================================================================
-- PASCOAI ENTERPRISE OS — FORWARD MIGRATION 004: AUTH SECURITY, RATE LIMITS & AUDIT
-- MILESTONE 1 / PART 2: BRUTE-FORCE DEFENSE, RATE LIMITING, AUDIT TRAIL & CONCURRENCY
-- ==============================================================================

-- 1. Ensure Schema Migrations tracking table exists
CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Additive columns for users table (Safe for existing production databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(512) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[] DEFAULT '{}';

-- 3. Additive columns for refresh_tokens
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(64) NULL;

-- 4. Password reset tokens table (Single-use, short-lived, hashed at rest)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_token_user ON password_reset_tokens(user_id);

-- 5. Email verification tokens table (Single-use, hashed at rest)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verify_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id);

-- 6. Consumed MFA Challenges table (Replay resistance)
CREATE TABLE IF NOT EXISTS consumed_mfa_challenges (
    jti VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expires ON consumed_mfa_challenges(expires_at);

-- 7. MFA Challenge failed attempt counters
CREATE TABLE IF NOT EXISTS mfa_challenge_attempts (
    jti VARCHAR(64) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Distributed / Clustered Auth Rate Limits table (Atomic sliding-window)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON auth_rate_limits(expires_at);

-- 9. Account Security & Progressive Delay States table (Anti-spraying, no permanent DoS lockout)
CREATE TABLE IF NOT EXISTS account_security_states (
    identifier VARCHAR(320) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    last_failed_at TIMESTAMPTZ NULL,
    locked_until TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_sec_locked ON account_security_states(locked_until);

-- 10. Audit logs nullability adjustment for pre-auth security events
ALTER TABLE audit_logs ALTER COLUMN organization_id DROP NOT NULL;

-- 11. Structured Security Events Table (SIEM & Abuse Monitoring)
CREATE TABLE IF NOT EXISTS auth_security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    actor_ip VARCHAR(45) NOT NULL,
    actor_id UUID NULL,
    target_identifier VARCHAR(320) NULL,
    organization_id UUID NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'failure', 'blocked')),
    reason VARCHAR(128) NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sec_events_type ON auth_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON auth_security_events(actor_ip);
CREATE INDEX IF NOT EXISTS idx_sec_events_target ON auth_security_events(target_identifier);
CREATE INDEX IF NOT EXISTS idx_sec_events_created ON auth_security_events(created_at);
