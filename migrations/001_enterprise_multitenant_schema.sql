-- ==============================================================================
-- PASCOAI ENTERPRISE OS — MULTI-TENANT POSTGRESQL SCHEMA WITH RLS
-- STAGE 8.1: ZERO-TRUST ROW LEVEL SECURITY ARCHITECTURE
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Top-level tenant boundary)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    tier VARCHAR(32) NOT NULL DEFAULT 'enterprise',
    retention_days INT NOT NULL DEFAULT 365,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. WORKSPACES (Tenant environment partitioning)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    environment VARCHAR(32) NOT NULL DEFAULT 'production',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id);

-- ------------------------------------------------------------------------------
-- 3. USERS (Global Identity Anchor)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(320) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Argon2id hash
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ------------------------------------------------------------------------------
-- 4. WORKSPACE MEMBERSHIPS & RBAC
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('org_admin', 'security_lead', 'secops_analyst', 'compliance_auditor', 'viewer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_lookup ON workspace_members(user_id, organization_id, workspace_id);

-- ------------------------------------------------------------------------------
-- 5. REFRESH TOKENS (Rotating Token Families & Invalidation on Reuse)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 of refresh token
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

-- ------------------------------------------------------------------------------
-- 6. ASSETS (Tenant Perimeter Inventory)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_type VARCHAR(32) NOT NULL CHECK (target_type IN ('domain', 'hostname', 'public_ip', 'url_endpoint', 'email_domain')),
    target_value VARCHAR(2048) NOT NULL,
    criticality VARCHAR(32) NOT NULL DEFAULT 'tier_2_business',
    tags TEXT[] DEFAULT '{}',
    current_score INT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id);

-- ------------------------------------------------------------------------------
-- 7. SCANS (Posture Scan Runs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    triggered_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    scan_type VARCHAR(32) NOT NULL DEFAULT 'on_demand',
    execution_status VARCHAR(32) NOT NULL DEFAULT 'queued',
    overall_score INT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    raw_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_workspace ON scans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scans_asset ON scans(asset_id);

-- ------------------------------------------------------------------------------
-- 8. FINDINGS (Normalized Security Findings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    domain_category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    verification_class VARCHAR(32) NOT NULL CHECK (verification_class IN ('VERIFIED_EVIDENCE', 'DETERMINISTIC_DERIVATION', 'AI_THREAT_ANALYSIS', 'TRAINING_SIMULATION', 'IMPORTED_UNVERIFIED')),
    recommendation TEXT NOT NULL,
    remediation_status VARCHAR(32) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_workspace ON findings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS (Immutable Event Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE SET NULL,
    actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_ip VARCHAR(45) NOT NULL,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES WITH FORCE ROW LEVEL SECURITY
-- ==============================================================================

-- 1. Enable RLS and FORCE RLS on all tenant-owned tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans FORCE ROW LEVEL SECURITY;

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- 2. Organizations RLS Policy
CREATE POLICY rls_organizations_isolation ON organizations
    FOR ALL
    USING (
        id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    );

-- 3. Workspaces RLS Policy
CREATE POLICY rls_workspaces_isolation ON workspaces
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND (
            id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            OR NULLIF(current_setting('app.current_workspace_id', true), '') IS NULL
        )
    );

-- 4. Workspace Members RLS Policy
CREATE POLICY rls_workspace_members_isolation ON workspace_members
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    );

-- 5. Assets RLS Policy (Strict org + workspace match)
CREATE POLICY rls_assets_isolation ON assets
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

-- 6. Scans RLS Policy
CREATE POLICY rls_scans_isolation ON scans
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

-- 7. Findings RLS Policy
CREATE POLICY rls_findings_isolation ON findings
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

-- 8. Audit Logs RLS Policy
CREATE POLICY rls_audit_logs_isolation ON audit_logs
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    );
