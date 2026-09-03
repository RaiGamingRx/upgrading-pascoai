-- ==============================================================================
-- PASCOAI ENTERPRISE OS — AUTHENTICATION, MFA & SESSION SECURITY REMEDIATION
-- STAGE 8.2 / MILESTONE 1: SESSION REVOCATION, MFA, PASSWORD RESET & VERIFICATION
-- ==============================================================================

-- 1. Users table enhancements for session invalidation, email verification, and MFA
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(512) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[] DEFAULT '{}';

-- 2. Refresh tokens revocation reason tracking
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(64) NULL;

-- 3. Password reset tokens table (Hashed at rest with single-use & short expiry)
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

-- 4. Email verification tokens table (Hashed at rest with single-use)
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
