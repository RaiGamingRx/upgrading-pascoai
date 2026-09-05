/**
 * PASCOAI ENTERPRISE DATABASE & RLS ENGINE (STAGE 8.1)
 * 
 * Provides zero-trust, tenant-isolated data operations with strict
 * PostgreSQL Row-Level Security (RLS) enforcement and connection-pool isolation.
 * 
 * CRITICAL SECURITY GUARANTEES:
 * 1. Every tenant-owned query requires an authenticated context.
 * 2. If app.current_org_id or app.current_workspace_id is absent, queries FAIL CLOSED.
 * 3. PostgreSQL FORCE ROW LEVEL SECURITY semantics are strictly enforced by PostgreSQL.
 * 4. Tenant session settings are STRICTLY transaction-scoped (set_config(..., true))
 *    and cannot leak between pooled connections or requests.
 * 5. Production mode MANDATES DATABASE_URL and refuses to start with in-memory fallback.
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg, { type PoolClient } from "pg";
import { encryptMfaSecret, isEncryptedMfaSecret } from "./mfa-engine.ts";

const { Pool } = pg;

export interface TenantContext {
  organizationId: string;
  workspaceId: string;
  userId: string;
  role: 'org_admin' | 'security_lead' | 'secops_analyst' | 'compliance_auditor' | 'viewer';
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  tier: string;
  retention_days: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRecord {
  id: string;
  organization_id: string;
  name: string;
  environment: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  token_version: number;
  email_verified: boolean;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_backup_codes: string[];
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMemberRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  user_id: string;
  role: 'org_admin' | 'security_lead' | 'secops_analyst' | 'compliance_auditor' | 'viewer';
  joined_at: string;
}

export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  is_revoked: boolean;
  revocation_reason?: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface PasswordResetTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface EmailVerificationTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface AssetRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  target_type: 'domain' | 'hostname' | 'public_ip' | 'url_endpoint' | 'email_domain';
  target_value: string;
  criticality: 'tier_1_mission_critical' | 'tier_2_business' | 'tier_3_low';
  tags: string[];
  current_score: number | null;
  status: 'active' | 'paused' | 'decommissioned';
  created_at: string;
  updated_at: string;
}

export interface ScanRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  asset_id: string;
  triggered_by: string | null;
  scan_type: 'on_demand' | 'scheduled_recurring' | 'api_webhook' | 'imported';
  execution_status: 'queued' | 'running' | 'verified' | 'partial' | 'failed' | 'imported';
  overall_score: number | null;
  is_verified: boolean;
  raw_summary: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface FindingRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  scan_id: string;
  domain_category: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  verification_class: 'VERIFIED_EVIDENCE' | 'DETERMINISTIC_DERIVATION' | 'AI_THREAT_ANALYSIS' | 'TRAINING_SIMULATION' | 'IMPORTED_UNVERIFIED';
  recommendation: string;
  remediation_status: 'open' | 'acknowledged' | 'remediated' | 'false_positive_risk_accepted';
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  actor_id: string | null;
  actor_ip: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ----------------------------------------------------------------------------
// POSTGRES CONNECTION POOL & MIGRATION RUNNER
// ----------------------------------------------------------------------------

let globalPool: pg.Pool | null = null;
let migrationPromise: Promise<void> | null = null;

export function getActiveDriver(): "postgres" | "in_memory" {
  const isProduction = process.env.NODE_ENV === "production";
  const hasDbUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

  if (isProduction && !hasDbUrl) {
    throw new Error(
      "FATAL_DATABASE_CONFIG_ERROR: DATABASE_URL environment variable is mandatory in production. In-memory database fallback is strictly prohibited."
    );
  }

  if (hasDbUrl) {
    return "postgres";
  }

  return "in_memory";
}

export function getPool(connectionUrl?: string): pg.Pool {
  const driver = getActiveDriver();
  if (driver !== "postgres") {
    throw new Error("Cannot get PostgreSQL pool: Active driver is in_memory");
  }

  if (connectionUrl) {
    const useSsl =
      process.env.DATABASE_SSL === "true" ||
      connectionUrl.includes("sslmode=require") ||
      connectionUrl.includes("neon.tech");

    return new Pool({
      connectionString: connectionUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_MAX_POOL_SIZE || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  if (!globalPool) {
    const connectionString = process.env.DATABASE_URL!;
    const useSsl =
      process.env.DATABASE_SSL === "true" ||
      connectionString.includes("sslmode=require") ||
      connectionString.includes("neon.tech");
    
    globalPool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_MAX_POOL_SIZE || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    globalPool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]", err);
    });
  }

  return globalPool;
}

export async function closePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
    migrationPromise = null;
  }
}

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    tier VARCHAR(32) NOT NULL DEFAULT 'enterprise',
    retention_days INT NOT NULL DEFAULT 365,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(320) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    token_version INT NOT NULL DEFAULT 1,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(512) NULL,
    mfa_backup_codes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revocation_reason VARCHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

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

CREATE TABLE IF NOT EXISTS consumed_mfa_challenges (
    jti VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expires ON consumed_mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS mfa_challenge_attempts (
    jti VARCHAR(64) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- RLS Enablement & Enforcement
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

-- Idempotent RLS Policies
DROP POLICY IF EXISTS rls_organizations_isolation ON organizations;
CREATE POLICY rls_organizations_isolation ON organizations
    FOR ALL
    USING (
        id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    );

DROP POLICY IF EXISTS rls_workspaces_isolation ON workspaces;
CREATE POLICY rls_workspaces_isolation ON workspaces
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND (
            id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            OR NULLIF(current_setting('app.current_workspace_id', true), '') IS NULL
        )
    );

DROP POLICY IF EXISTS rls_workspace_members_isolation ON workspace_members;
CREATE POLICY rls_workspace_members_isolation ON workspace_members
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

DROP POLICY IF EXISTS rls_assets_isolation ON assets;
CREATE POLICY rls_assets_isolation ON assets
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

DROP POLICY IF EXISTS rls_scans_isolation ON scans;
CREATE POLICY rls_scans_isolation ON scans
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

DROP POLICY IF EXISTS rls_findings_isolation ON findings;
CREATE POLICY rls_findings_isolation ON findings
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        AND workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    );

DROP POLICY IF EXISTS rls_audit_logs_isolation ON audit_logs;
CREATE POLICY rls_audit_logs_isolation ON audit_logs
    FOR ALL
    USING (
        organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    );

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(512) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[] DEFAULT '{}';
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS consumed_mfa_challenges (
    jti VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expires ON consumed_mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS mfa_challenge_attempts (
    jti VARCHAR(64) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    points INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON auth_rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS account_security_states (
    identifier VARCHAR(320) PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    last_failed_at TIMESTAMPTZ NULL,
    locked_until TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_sec_locked ON account_security_states(locked_until);

ALTER TABLE audit_logs ALTER COLUMN organization_id DROP NOT NULL;

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
`;

export async function runMigrations(pool?: pg.Pool): Promise<void> {
  const targetPool =
    pool ||
    (process.env.DATABASE_URL_UNPOOLED ? getPool(process.env.DATABASE_URL_UNPOOLED) : getPool());
  
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const client = await targetPool.connect();
      try {
        // 1. Ensure migrations tracking table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        // 2. Fetch already applied migrations
        const appliedRes = await client.query("SELECT id FROM schema_migrations");
        const appliedIds = new Set(appliedRes.rows.map((r: any) => r.id));

        // 3. Discover and execute migration files in sequential order
        const migrationsDir = resolve(process.cwd(), "migrations");
        if (existsSync(migrationsDir)) {
          const files = readdirSync(migrationsDir)
            .filter((f: string) => f.endsWith(".sql"))
            .sort();

          for (const file of files) {
            if (!appliedIds.has(file)) {
              const content = readFileSync(resolve(migrationsDir, file), "utf-8");
              await client.query("BEGIN");
              try {
                await client.query(content);
                await client.query(
                  "INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW()) ON CONFLICT (id) DO NOTHING",
                  [file]
                );
                await client.query("COMMIT");
                appliedIds.add(file);
              } catch (migrationErr) {
                await client.query("ROLLBACK").catch(() => {});
                throw migrationErr;
              }
            }
          }
        } else {
          // Fall back to SCHEMA_SQL
          await client.query("BEGIN");
          await client.query(SCHEMA_SQL);
          await client.query("COMMIT");
        }
      } finally {
        client.release();
      }
    })();
  }

  return migrationPromise;
}

// ----------------------------------------------------------------------------
// DATA MAPPING UTILITIES
// ----------------------------------------------------------------------------

function toIso(val: any): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function toIsoOrNull(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapOrganization(row: any): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tier: row.tier,
    retention_days: Number(row.retention_days),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapWorkspace(row: any): WorkspaceRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    environment: row.environment,
    is_default: Boolean(row.is_default),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    password_hash: row.password_hash,
    is_active: Boolean(row.is_active),
    token_version: Number(row.token_version ?? 1),
    email_verified: Boolean(row.email_verified),
    mfa_enabled: Boolean(row.mfa_enabled),
    mfa_secret: row.mfa_secret ?? null,
    mfa_backup_codes: Array.isArray(row.mfa_backup_codes) ? row.mfa_backup_codes : [],
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapWorkspaceMember(row: any): WorkspaceMemberRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role: row.role,
    joined_at: toIso(row.joined_at),
  };
}

function mapRefreshToken(row: any): RefreshTokenRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    family_id: row.family_id,
    token_hash: row.token_hash,
    expires_at: toIso(row.expires_at),
    is_revoked: Boolean(row.is_revoked),
    revocation_reason: row.revocation_reason ?? null,
    created_at: toIso(row.created_at),
    revoked_at: toIsoOrNull(row.revoked_at),
  };
}

function mapPasswordResetToken(row: any): PasswordResetTokenRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    token_hash: row.token_hash,
    expires_at: toIso(row.expires_at),
    used_at: toIsoOrNull(row.used_at),
    created_at: toIso(row.created_at),
  };
}

function mapEmailVerificationToken(row: any): EmailVerificationTokenRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    token_hash: row.token_hash,
    expires_at: toIso(row.expires_at),
    used_at: toIsoOrNull(row.used_at),
    created_at: toIso(row.created_at),
  };
}

function mapAsset(row: any): AssetRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    target_type: row.target_type,
    target_value: row.target_value,
    criticality: row.criticality,
    tags: Array.isArray(row.tags) ? row.tags : [],
    current_score: row.current_score !== null && row.current_score !== undefined ? Number(row.current_score) : null,
    status: row.status,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapScan(row: any): ScanRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    asset_id: row.asset_id,
    triggered_by: row.triggered_by || null,
    scan_type: row.scan_type,
    execution_status: row.execution_status,
    overall_score: row.overall_score !== null && row.overall_score !== undefined ? Number(row.overall_score) : null,
    is_verified: Boolean(row.is_verified),
    raw_summary: typeof row.raw_summary === "object" && row.raw_summary !== null ? row.raw_summary : {},
    created_at: toIso(row.created_at),
    completed_at: toIsoOrNull(row.completed_at),
  };
}

function mapFinding(row: any): FindingRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    scan_id: row.scan_id,
    domain_category: row.domain_category,
    title: row.title,
    description: row.description,
    severity: row.severity,
    verification_class: row.verification_class,
    recommendation: row.recommendation,
    remediation_status: row.remediation_status,
    created_at: toIso(row.created_at),
  };
}

function mapAuditLog(row: any): AuditLogRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id || null,
    actor_id: row.actor_id || null,
    actor_ip: row.actor_ip,
    action: row.action,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    details: typeof row.details === "object" && row.details !== null ? row.details : {},
    timestamp: toIso(row.timestamp),
  };
}

// ----------------------------------------------------------------------------
// IN-MEMORY STORE (Isolated fallback strictly for development & unit test runners)
// ----------------------------------------------------------------------------

class InMemoryEnterpriseDb {
  organizations = new Map<string, OrganizationRecord>();
  workspaces = new Map<string, WorkspaceRecord>();
  users = new Map<string, UserRecord>();
  workspaceMembers = new Map<string, WorkspaceMemberRecord>();
  refreshTokens = new Map<string, RefreshTokenRecord>();
  passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
  emailVerificationTokens = new Map<string, EmailVerificationTokenRecord>();
  assets = new Map<string, AssetRecord>();
  scans = new Map<string, ScanRecord>();
  findings = new Map<string, FindingRecord>();
  auditLogs = new Map<string, AuditLogRecord>();
  consumedMfaChallenges = new Map<string, { userId: string; expiresAtMs: number }>();
  mfaChallengeAttempts = new Map<string, number>();

  clear() {
    this.organizations.clear();
    this.workspaces.clear();
    this.users.clear();
    this.workspaceMembers.clear();
    this.refreshTokens.clear();
    this.passwordResetTokens.clear();
    this.emailVerificationTokens.clear();
    this.assets.clear();
    this.scans.clear();
    this.findings.clear();
    this.auditLogs.clear();
    this.consumedMfaChallenges.clear();
    this.mfaChallengeAttempts.clear();
  }
}

export const inMemoryDb = new InMemoryEnterpriseDb();

// ----------------------------------------------------------------------------
// ENTERPRISE DATABASE CLIENT
// ----------------------------------------------------------------------------

export class EnterpriseDbClient {
  private context: TenantContext | null;

  constructor(context: TenantContext | null = null) {
    this.context = context;
  }

  /**
   * Returns current tenant context or FAILS CLOSED
   */
  private requireContext(): TenantContext {
    if (!this.context) {
      throw new Error("RLS_SECURITY_VIOLATION: Missing tenant session context. Query denied (Fail-Closed).");
    }
    if (!this.context.organizationId || !this.context.workspaceId) {
      throw new Error("RLS_SECURITY_VIOLATION: Incomplete tenant boundaries. Query denied (Fail-Closed).");
    }
    return this.context;
  }

  /**
   * Executes a callback within a strict, transaction-scoped PostgreSQL tenant context.
   * Session variables are set with is_local=true, guaranteeing zero connection leakage.
   */
  private async withTenantTransaction<T>(fn: (client: PoolClient, ctx: TenantContext) => Promise<T>): Promise<T> {
    const ctx = this.requireContext();
    const pool = getPool();
    await runMigrations(pool);
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");
      // Set transaction-local session variables for PostgreSQL RLS policies
      await client.query(
        `SELECT 
          set_config('app.current_org_id', $1, true),
          set_config('app.current_workspace_id', $2, true),
          set_config('app.current_user_id', $3, true),
          set_config('app.current_user_role', $4, true)`,
        [ctx.organizationId, ctx.workspaceId, ctx.userId, ctx.role]
      );
      
      const result = await fn(client, ctx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      // Defensive reset of all session settings before connection returns to pool
      await client.query("RESET ALL").catch(() => {});
      client.release();
    }
  }

  /**
   * Executes a callback within a system transaction (e.g. for registration, token management)
   */
  private async withSystemTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = getPool();
    await runMigrations(pool);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await client.query("RESET ALL").catch(() => {});
      client.release();
    }
  }

  // --------------------------------------------------------------------------
  // USER / AUTH OPERATIONS
  // --------------------------------------------------------------------------

  async createUser(data: {
    email: string;
    display_name?: string;
    displayName?: string;
    password_hash?: string;
    passwordHash?: string;
    is_active?: boolean;
    isActive?: boolean;
    token_version?: number;
    tokenVersion?: number;
    email_verified?: boolean;
    emailVerified?: boolean;
    mfa_enabled?: boolean;
    mfaEnabled?: boolean;
    mfa_secret?: string | null;
    mfaSecret?: string | null;
    mfa_backup_codes?: string[];
    mfaBackupCodes?: string[];
  }): Promise<UserRecord> {
    const displayName = data.display_name ?? data.displayName ?? "";
    const passwordHash = data.password_hash ?? data.passwordHash ?? "";
    const isActive = data.is_active ?? data.isActive ?? true;
    const tokenVersion = data.token_version ?? data.tokenVersion ?? 1;
    const emailVerified = data.email_verified ?? data.emailVerified ?? false;
    const mfaEnabled = data.mfa_enabled ?? data.mfaEnabled ?? false;
    const mfaSecret = data.mfa_secret !== undefined ? data.mfa_secret : (data.mfaSecret !== undefined ? data.mfaSecret : null);
    const mfaBackupCodes = data.mfa_backup_codes ?? data.mfaBackupCodes ?? [];

    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        const existing = await client.query(
          "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
          [data.email]
        );
        if (existing.rows.length > 0) {
          throw new Error("User with this email already exists");
        }
        const id = randomUUID();
        try {
          const res = await client.query(
            `INSERT INTO users (id, email, display_name, password_hash, is_active, token_version, email_verified, mfa_enabled, mfa_secret, mfa_backup_codes, created_at, updated_at)
             VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
             RETURNING *`,
            [
              id,
              data.email,
              displayName,
              passwordHash,
              isActive,
              tokenVersion,
              emailVerified,
              mfaEnabled,
              mfaSecret,
              mfaBackupCodes,
            ]
          );
          return mapUser(res.rows[0]);
        } catch (err: any) {
          if (err?.code === "23505" || err?.message?.includes("unique") || err?.message?.includes("duplicate")) {
            throw new Error("User with this email already exists");
          }
          throw err;
        }
      });
    }

    // In-memory fallback
    const existing = Array.from(inMemoryDb.users.values()).find(
      u => u.email.toLowerCase() === data.email.toLowerCase()
    );
    if (existing) {
      throw new Error("User with this email already exists");
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const user: UserRecord = {
      id,
      email: data.email.toLowerCase(),
      display_name: displayName,
      password_hash: passwordHash,
      is_active: isActive,
      token_version: tokenVersion,
      email_verified: emailVerified,
      mfa_enabled: mfaEnabled,
      mfa_secret: mfaSecret,
      mfa_backup_codes: mfaBackupCodes,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.users.set(id, user);
    return user;
  }

  /**
   * Atomically provisions an enterprise tenant (User + Organization + Workspace + WorkspaceMember).
   * Fully rolled back on any failure, preventing orphaned records or race conditions.
   */
  async registerEnterpriseTenant(params: {
    email: string;
    displayName: string;
    passwordHash: string;
    organizationName?: string;
    workspaceName?: string;
  }): Promise<{
    user: UserRecord;
    organization: OrganizationRecord;
    workspace: WorkspaceRecord;
    member: WorkspaceMemberRecord;
  }> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const orgName = params.organizationName?.trim() || "Default Organization";
    const wsName = params.workspaceName?.trim() || "Production Perimeter";
    const orgSlug =
      orgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 50) +
      "-" +
      randomUUID().slice(0, 8);

    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        // 1. Check duplicate user
        const existing = await client.query(
          "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
          [normalizedEmail]
        );
        if (existing.rows.length > 0) {
          throw new Error("User with this email already exists");
        }

        // 2. Insert user
        const userId = randomUUID();
        let userRow: any;
        try {
          const uRes = await client.query(
            `INSERT INTO users (id, email, display_name, password_hash, is_active, token_version, email_verified, mfa_enabled, mfa_secret, mfa_backup_codes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, TRUE, 1, FALSE, FALSE, NULL, '{}', NOW(), NOW())
             RETURNING *`,
            [userId, normalizedEmail, params.displayName, params.passwordHash]
          );
          userRow = uRes.rows[0];
        } catch (err: any) {
          if (err?.code === "23505" || err?.message?.includes("unique") || err?.message?.includes("duplicate")) {
            throw new Error("User with this email already exists");
          }
          throw err;
        }

        // 3. Create org
        const orgId = randomUUID();
        const oRes = await client.query(
          `INSERT INTO organizations (id, name, slug, tier, retention_days, created_at, updated_at)
           VALUES ($1, $2, $3, 'enterprise', 365, NOW(), NOW())
           RETURNING *`,
          [orgId, orgName, orgSlug]
        );

        // 4. Create workspace
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
        const wsId = randomUUID();
        const wRes = await client.query(
          `INSERT INTO workspaces (id, organization_id, name, environment, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, 'production', TRUE, NOW(), NOW())
           RETURNING *`,
          [wsId, orgId, wsName]
        );

        // 5. Add workspace member
        const memId = randomUUID();
        const mRes = await client.query(
          `INSERT INTO workspace_members (id, organization_id, workspace_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, $4, 'org_admin', NOW())
           RETURNING *`,
          [memId, orgId, wsId, userId]
        );

        return {
          user: mapUser(userRow),
          organization: mapOrganization(oRes.rows[0]),
          workspace: mapWorkspace(wRes.rows[0]),
          member: mapWorkspaceMember(mRes.rows[0]),
        };
      });
    }

    // In-memory atomic registration
    const existing = Array.from(inMemoryDb.users.values()).find(
      u => u.email.toLowerCase() === normalizedEmail
    );
    if (existing) {
      throw new Error("User with this email already exists");
    }

    const userId = randomUUID();
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: userId,
      email: normalizedEmail,
      display_name: params.displayName,
      password_hash: params.passwordHash,
      is_active: true,
      token_version: 1,
      email_verified: false,
      mfa_enabled: false,
      mfa_secret: null,
      mfa_backup_codes: [],
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.users.set(userId, user);

    const orgId = randomUUID();
    const org: OrganizationRecord = {
      id: orgId,
      name: orgName,
      slug: orgSlug,
      tier: "enterprise",
      retention_days: 365,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.organizations.set(orgId, org);

    const wsId = randomUUID();
    const ws: WorkspaceRecord = {
      id: wsId,
      organization_id: orgId,
      name: wsName,
      environment: "production",
      is_default: true,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.workspaces.set(wsId, ws);

    const memId = randomUUID();
    const member: WorkspaceMemberRecord = {
      id: memId,
      organization_id: orgId,
      workspace_id: wsId,
      user_id: userId,
      role: "org_admin",
      joined_at: now,
    };
    inMemoryDb.workspaceMembers.set(memId, member);

    return { user, organization: org, workspace: ws, member };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email]
      );
      if (res.rows.length === 0) return null;
      return mapUser(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.users.values()).find(
      u => u.email.toLowerCase() === email.toLowerCase()
    );
    return found || null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      if (res.rows.length === 0) return null;
      return mapUser(res.rows[0]);
    }

    return inMemoryDb.users.get(userId) || null;
  }

  async incrementUserTokenVersion(userId: string): Promise<number> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        const res = await client.query(
          "UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING token_version",
          [userId]
        );
        return res.rows.length > 0 ? Number(res.rows[0].token_version) : 1;
      });
    }

    const user = inMemoryDb.users.get(userId);
    if (user) {
      user.token_version = (user.token_version || 1) + 1;
      user.updated_at = new Date().toISOString();
      return user.token_version;
    }
    return 1;
  }

  async setUserEmailVerified(userId: string, verified = true): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        await client.query(
          "UPDATE users SET email_verified = $1, updated_at = NOW() WHERE id = $2",
          [verified, userId]
        );
      });
    }

    const user = inMemoryDb.users.get(userId);
    if (user) {
      user.email_verified = verified;
      user.updated_at = new Date().toISOString();
    }
  }

  async updateUserMfa(
    userId: string,
    mfa: { enabled: boolean; secret?: string | null; backupCodes?: string[] }
  ): Promise<void> {
    // Defense-in-depth: Ensure any provided secret is stored encrypted with AES-256-GCM authenticated envelope
    let normalizedSecret: string | null | undefined = mfa.secret;
    if (normalizedSecret !== undefined && normalizedSecret !== null) {
      if (!isEncryptedMfaSecret(normalizedSecret)) {
        normalizedSecret = encryptMfaSecret(normalizedSecret);
      }
    }

    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        if (!mfa.enabled) {
          await client.query(
            `UPDATE users 
             SET mfa_enabled = FALSE, 
                 mfa_secret = NULL, 
                 mfa_backup_codes = '{}', 
                 updated_at = NOW() 
             WHERE id = $1`,
            [userId]
          );
        } else {
          await client.query(
            `UPDATE users 
             SET mfa_enabled = TRUE, 
                 mfa_secret = COALESCE($1, mfa_secret), 
                 mfa_backup_codes = COALESCE($2, mfa_backup_codes), 
                 updated_at = NOW() 
             WHERE id = $3`,
            [normalizedSecret !== undefined ? normalizedSecret : null, mfa.backupCodes !== undefined ? mfa.backupCodes : null, userId]
          );
        }
      });
    }

    const user = inMemoryDb.users.get(userId);
    if (user) {
      user.mfa_enabled = mfa.enabled;
      if (!mfa.enabled) {
        user.mfa_secret = null;
        user.mfa_backup_codes = [];
      } else {
        if (normalizedSecret !== undefined) user.mfa_secret = normalizedSecret;
        if (mfa.backupCodes !== undefined) user.mfa_backup_codes = mfa.backupCodes;
      }
      user.updated_at = new Date().toISOString();
    }
  }

  /**
   * Scans and safely migrates any legacy unencrypted plaintext MFA secrets into AES-256-GCM envelopes
   */
  async migrateLegacyPlaintextMfaSecrets(): Promise<number> {
    let count = 0;
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT id, mfa_secret FROM users WHERE mfa_secret IS NOT NULL AND mfa_secret NOT LIKE '%.%.%'"
      );
      for (const row of res.rows) {
        const encrypted = encryptMfaSecret(row.mfa_secret);
        await pool.query("UPDATE users SET mfa_secret = $1, updated_at = NOW() WHERE id = $2", [encrypted, row.id]);
        count++;
      }
      return count;
    }

    for (const user of inMemoryDb.users.values()) {
      if (user.mfa_secret && !isEncryptedMfaSecret(user.mfa_secret)) {
        user.mfa_secret = encryptMfaSecret(user.mfa_secret);
        user.updated_at = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  /**
   * Atomically verifies and consumes a single-use backup code.
   * Concurrency-safe: Exactly one request will succeed if multiple simultaneous requests arrive.
   */
  async consumeUserBackupCode(userId: string, codeHash: string): Promise<{ success: boolean; remainingCodes: string[] }> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `UPDATE users
         SET mfa_backup_codes = array_remove(mfa_backup_codes, $2), updated_at = NOW()
         WHERE id = $1 AND $2 = ANY(mfa_backup_codes)
         RETURNING mfa_backup_codes`,
        [userId, codeHash]
      );
      if (res.rows.length > 0) {
        return { success: true, remainingCodes: res.rows[0].mfa_backup_codes || [] };
      }
      return { success: false, remainingCodes: [] };
    }

    const user = inMemoryDb.users.get(userId);
    if (!user || !Array.isArray(user.mfa_backup_codes)) {
      return { success: false, remainingCodes: [] };
    }

    const codeBuf = Buffer.from(codeHash, "utf8");
    const matchIdx = user.mfa_backup_codes.findIndex((storedHash) => {
      const storedBuf = Buffer.from(storedHash, "utf8");
      return codeBuf.length === storedBuf.length && timingSafeEqual(codeBuf, storedBuf);
    });

    if (matchIdx === -1) {
      return { success: false, remainingCodes: [...user.mfa_backup_codes] };
    }

    // Synchronous splice in single-threaded event loop ensures atomic consumption
    user.mfa_backup_codes.splice(matchIdx, 1);
    user.updated_at = new Date().toISOString();
    return { success: true, remainingCodes: [...user.mfa_backup_codes] };
  }

  /**
   * Restores a previously consumed backup code in the event of an aborted MFA challenge transaction
   */
  async restoreUserBackupCode(userId: string, codeHash: string): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      await pool.query(
        `UPDATE users
         SET mfa_backup_codes = array_append(mfa_backup_codes, $2), updated_at = NOW()
         WHERE id = $1 AND NOT ($2 = ANY(mfa_backup_codes))`,
        [userId, codeHash]
      );
      return;
    }

    const user = inMemoryDb.users.get(userId);
    if (user && Array.isArray(user.mfa_backup_codes)) {
      if (!user.mfa_backup_codes.includes(codeHash)) {
        user.mfa_backup_codes.push(codeHash);
        user.updated_at = new Date().toISOString();
      }
    }
  }

  async findUserByIdWithMemberships(userId: string): Promise<{ user: UserRecord; memberships: WorkspaceMemberRecord[] } | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const memberships = await this.getUserMemberships(userId);
    return { user, memberships };
  }

  async updateUserPassword(userId: string, newPasswordHash: string): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        await client.query(
          "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
          [newPasswordHash, userId]
        );
      });
    }

    const user = inMemoryDb.users.get(userId);
    if (user) {
      user.password_hash = newPasswordHash;
      user.updated_at = new Date().toISOString();
    }
  }

  async updateUserDisplayName(userId: string, displayName: string): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        await client.query(
          "UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2",
          [displayName, userId]
        );
      });
    }

    const user = inMemoryDb.users.get(userId);
    if (user) {
      user.display_name = displayName;
      user.updated_at = new Date().toISOString();
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        await client.query("UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM workspace_members WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM users WHERE id = $1", [userId]);
      });
    }

    inMemoryDb.users.delete(userId);
    for (const [id, m] of inMemoryDb.workspaceMembers.entries()) {
      if (m.user_id === userId) inMemoryDb.workspaceMembers.delete(id);
    }
    for (const [id, t] of inMemoryDb.refreshTokens.entries()) {
      if (t.user_id === userId) inMemoryDb.refreshTokens.delete(id);
    }
  }

  // --------------------------------------------------------------------------
  // PASSWORD RESET & EMAIL VERIFICATION TOKENS
  // --------------------------------------------------------------------------

  async savePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetTokenRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES ($1, $2, $3, $4, NULL, NOW())
         RETURNING *`,
        [id, userId, tokenHash, expiresAt.toISOString()]
      );
      return mapPasswordResetToken(res.rows[0]);
    }

    const id = randomUUID();
    const record: PasswordResetTokenRecord = {
      id,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    inMemoryDb.passwordResetTokens.set(id, record);
    return record;
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1",
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      return mapPasswordResetToken(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.passwordResetTokens.values()).find(
      t => t.token_hash === tokenHash
    );
    return found || null;
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<boolean> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id",
        [tokenId]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const record = inMemoryDb.passwordResetTokens.get(tokenId);
    if (!record || record.used_at) {
      return false;
    }
    record.used_at = new Date().toISOString();
    return true;
  }

  async saveEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<EmailVerificationTokenRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES ($1, $2, $3, $4, NULL, NOW())
         RETURNING *`,
        [id, userId, tokenHash, expiresAt.toISOString()]
      );
      return mapEmailVerificationToken(res.rows[0]);
    }

    const id = randomUUID();
    const record: EmailVerificationTokenRecord = {
      id,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    inMemoryDb.emailVerificationTokens.set(id, record);
    return record;
  }

  async findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1",
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      return mapEmailVerificationToken(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.emailVerificationTokens.values()).find(
      t => t.token_hash === tokenHash
    );
    return found || null;
  }

  async markEmailVerificationTokenUsed(tokenId: string): Promise<boolean> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id",
        [tokenId]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const record = inMemoryDb.emailVerificationTokens.get(tokenId);
    if (!record || record.used_at) {
      return false;
    }
    record.used_at = new Date().toISOString();
    return true;
  }

  // --------------------------------------------------------------------------
  // ORGANIZATION & WORKSPACE OPS
  // --------------------------------------------------------------------------

  async createOrganization(name: string, slug: string, tier = 'enterprise'): Promise<OrganizationRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      return this.withSystemTransaction(async (client) => {
        // Set org context to satisfy RLS during initial organization insert
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [id]);
        const res = await client.query(
          `INSERT INTO organizations (id, name, slug, tier, retention_days, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [id, name, slug, tier, 365]
        );
        return mapOrganization(res.rows[0]);
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const org: OrganizationRecord = {
      id,
      name,
      slug,
      tier,
      retention_days: 365,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.organizations.set(id, org);
    return org;
  }

  async createWorkspace(orgId: string, name: string, environment = 'production', isDefault = false): Promise<WorkspaceRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      return this.withSystemTransaction(async (client) => {
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
        const res = await client.query(
          `INSERT INTO workspaces (id, organization_id, name, environment, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [id, orgId, name, environment, isDefault]
        );
        return mapWorkspace(res.rows[0]);
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const ws: WorkspaceRecord = {
      id,
      organization_id: orgId,
      name,
      environment,
      is_default: isDefault,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.workspaces.set(id, ws);
    return ws;
  }

  async addWorkspaceMember(orgId: string, workspaceId: string, userId: string, role: WorkspaceMemberRecord['role']): Promise<WorkspaceMemberRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      return this.withSystemTransaction(async (client) => {
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
        const res = await client.query(
          `INSERT INTO workspace_members (id, organization_id, workspace_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING *`,
          [id, orgId, workspaceId, userId, role]
        );
        return mapWorkspaceMember(res.rows[0]);
      });
    }

    const id = randomUUID();
    const member: WorkspaceMemberRecord = {
      id,
      organization_id: orgId,
      workspace_id: workspaceId,
      user_id: userId,
      role,
      joined_at: new Date().toISOString(),
    };
    inMemoryDb.workspaceMembers.set(id, member);
    return member;
  }

  async getUserMemberships(userId: string): Promise<WorkspaceMemberRecord[]> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withSystemTransaction(async (client) => {
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
        const res = await client.query(
          "SELECT * FROM workspace_members WHERE user_id = $1 ORDER BY joined_at ASC",
          [userId]
        );
        return res.rows.map(mapWorkspaceMember);
      });
    }

    return Array.from(inMemoryDb.workspaceMembers.values()).filter(m => m.user_id === userId);
  }

  // --------------------------------------------------------------------------
  // REFRESH TOKEN ROTATION & TOKEN FAMILIES
  // --------------------------------------------------------------------------

  async saveRefreshToken(userId: string, familyId: string, tokenHash: string, expiresAt: Date, reason: string | null = null): Promise<RefreshTokenRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const id = randomUUID();
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, is_revoked, revocation_reason, created_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, $6, NOW(), NULL)
         RETURNING *`,
        [id, userId, familyId, tokenHash, expiresAt.toISOString(), reason]
      );
      return mapRefreshToken(res.rows[0]);
    }

    const id = randomUUID();
    const record: RefreshTokenRecord = {
      id,
      user_id: userId,
      family_id: familyId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      is_revoked: false,
      revocation_reason: reason,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    inMemoryDb.refreshTokens.set(id, record);
    return record;
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1",
        [tokenHash]
      );
      if (res.rows.length === 0) return null;
      return mapRefreshToken(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.refreshTokens.values()).find(t => t.token_hash === tokenHash);
    return found || null;
  }

  async findActiveRefreshTokenInFamily(familyId: string): Promise<RefreshTokenRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT * FROM refresh_tokens WHERE family_id = $1 AND is_revoked = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
        [familyId]
      );
      if (res.rows.length === 0) return null;
      return mapRefreshToken(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.refreshTokens.values()).find(
      t => t.family_id === familyId && !t.is_revoked && new Date(t.expires_at).getTime() > Date.now()
    );
    return found || null;
  }

  async findRecentConsumedToken(tokenHash: string, withinSeconds = 15): Promise<RefreshTokenRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `SELECT * FROM refresh_tokens 
         WHERE token_hash = $1 
           AND is_revoked = TRUE 
           AND revoked_at >= NOW() - ($2 || ' seconds')::interval 
         LIMIT 1`,
        [tokenHash, withinSeconds]
      );
      if (res.rows.length === 0) return null;
      return mapRefreshToken(res.rows[0]);
    }

    const found = Array.from(inMemoryDb.refreshTokens.values()).find(t => {
      if (t.token_hash !== tokenHash || !t.is_revoked || !t.revoked_at) return false;
      const ageMs = Date.now() - new Date(t.revoked_at).getTime();
      return ageMs <= withinSeconds * 1000;
    });
    return found || null;
  }

  async revokeTokenFamily(familyId: string, reason = "REUSE_ATTACK_DETECTED"): Promise<number> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `UPDATE refresh_tokens 
         SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = $2 
         WHERE family_id = $1 AND is_revoked = FALSE
         RETURNING id`,
        [familyId, reason]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    const now = new Date().toISOString();
    for (const record of inMemoryDb.refreshTokens.values()) {
      if (record.family_id === familyId && !record.is_revoked) {
        record.is_revoked = true;
        record.revoked_at = now;
        record.revocation_reason = reason;
        count++;
      }
    }
    return count;
  }

  async consumeRefreshToken(recordId: string, reason = "ROTATION"): Promise<void> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      await pool.query(
        "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = $2 WHERE id = $1",
        [recordId, reason]
      );
      return;
    }

    const record = inMemoryDb.refreshTokens.get(recordId);
    if (record) {
      record.is_revoked = true;
      record.revoked_at = new Date().toISOString();
      record.revocation_reason = reason;
    }
  }

  /**
   * Concurrency-safe atomic refresh token consumption.
   * Guarantees exactly one consumer succeeds when simultaneous rotation requests arrive.
   * If the token was already revoked, reuseDetected is flagged to trigger family revocation.
   */
  async atomicConsumeRefreshToken(tokenHash: string, reason = "ROTATION"): Promise<{
    consumed: boolean;
    record: RefreshTokenRecord | null;
    reuseDetected: boolean;
  }> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      // Attempt atomic update of active, unexpired token
      const res = await pool.query(
        `UPDATE refresh_tokens
         SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = $2
         WHERE token_hash = $1 AND is_revoked = FALSE AND expires_at > NOW()
         RETURNING *`,
        [tokenHash, reason]
      );
      if (res.rows.length > 0) {
        return { consumed: true, record: mapRefreshToken(res.rows[0]), reuseDetected: false };
      }

      // Check if token exists but was already revoked (reuse/replay) or expired
      const checkRes = await pool.query(
        "SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1",
        [tokenHash]
      );
      if (checkRes.rows.length === 0) {
        return { consumed: false, record: null, reuseDetected: false };
      }
      const record = mapRefreshToken(checkRes.rows[0]);
      if (record.is_revoked) {
        return { consumed: false, record, reuseDetected: true };
      }
      // Expired token: mark revoked
      await pool.query(
        "UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = 'EXPIRED' WHERE id = $1",
        [record.id]
      );
      return { consumed: false, record, reuseDetected: false };
    }

    const record = Array.from(inMemoryDb.refreshTokens.values()).find(t => t.token_hash === tokenHash);
    if (!record) {
      return { consumed: false, record: null, reuseDetected: false };
    }
    if (record.is_revoked) {
      return { consumed: false, record, reuseDetected: true };
    }
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      record.is_revoked = true;
      record.revoked_at = new Date().toISOString();
      record.revocation_reason = "EXPIRED";
      return { consumed: false, record, reuseDetected: false };
    }

    record.is_revoked = true;
    record.revoked_at = new Date().toISOString();
    record.revocation_reason = reason;
    return { consumed: true, record, reuseDetected: false };
  }

  /**
   * Single-use MFA challenge consumption.
   * Prevents replay of completed or active MFA challenge tokens.
   */
  async consumeMfaChallenge(jti: string, userId: string, expiresAt: Date): Promise<boolean> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      try {
        const res = await pool.query(
          `INSERT INTO consumed_mfa_challenges (jti, user_id, consumed_at, expires_at)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (jti) DO NOTHING
           RETURNING jti`,
          [jti, userId, expiresAt.toISOString()]
        );
        return (res.rowCount ?? 0) > 0;
      } catch {
        return false;
      }
    }

    if (inMemoryDb.consumedMfaChallenges.has(jti)) {
      return false;
    }
    inMemoryDb.consumedMfaChallenges.set(jti, { userId, expiresAtMs: expiresAt.getTime() });
    return true;
  }

  /**
   * Checks whether an MFA challenge token (jti) has already been consumed
   */
  async isMfaChallengeConsumed(jti: string): Promise<boolean> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      try {
        const res = await pool.query(
          "SELECT jti FROM consumed_mfa_challenges WHERE jti = $1 LIMIT 1",
          [jti]
        );
        return (res.rowCount ?? 0) > 0;
      } catch {
        return false;
      }
    }
    return inMemoryDb.consumedMfaChallenges.has(jti);
  }

  /**
   * Tracks failed MFA verification attempts against a challenge token.
   * Mitigates online guessing / brute-force within the challenge lifetime.
   */
  async recordMfaChallengeFailedAttempt(jti: string): Promise<{ attempts: number; locked: boolean }> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `INSERT INTO mfa_challenge_attempts (jti, failed_attempts, updated_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (jti) DO UPDATE
         SET failed_attempts = mfa_challenge_attempts.failed_attempts + 1, updated_at = NOW()
         RETURNING failed_attempts`,
        [jti]
      );
      const attempts = res.rows[0]?.failed_attempts ?? 1;
      return { attempts, locked: attempts >= 5 };
    }

    const current = (inMemoryDb.mfaChallengeAttempts.get(jti) || 0) + 1;
    inMemoryDb.mfaChallengeAttempts.set(jti, current);
    return { attempts: current, locked: current >= 5 };
  }

  async getMfaChallengeFailedAttempts(jti: string): Promise<number> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        "SELECT failed_attempts FROM mfa_challenge_attempts WHERE jti = $1",
        [jti]
      );
      return res.rows[0]?.failed_attempts ?? 0;
    }

    return inMemoryDb.mfaChallengeAttempts.get(jti) || 0;
  }

  async revokeAllUserRefreshTokens(userId: string, reason = "LOGOUT_ALL"): Promise<number> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      const pool = getPool();
      await runMigrations(pool);
      const res = await pool.query(
        `UPDATE refresh_tokens 
         SET is_revoked = TRUE, revoked_at = NOW(), revocation_reason = $2 
         WHERE user_id = $1 AND is_revoked = FALSE
         RETURNING id`,
        [userId, reason]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    const now = new Date().toISOString();
    for (const record of inMemoryDb.refreshTokens.values()) {
      if (record.user_id === userId && !record.is_revoked) {
        record.is_revoked = true;
        record.revoked_at = now;
        record.revocation_reason = reason;
        count++;
      }
    }
    return count;
  }

  // --------------------------------------------------------------------------
  // ASSET OPERATIONS (RLS ENFORCED)
  // --------------------------------------------------------------------------

  async getAssets(): Promise<AssetRecord[]> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const res = await client.query(
          "SELECT * FROM assets WHERE organization_id = $1 AND workspace_id = $2 ORDER BY created_at DESC",
          [ctx.organizationId, ctx.workspaceId]
        );
        return res.rows.map(mapAsset);
      });
    }

    const ctx = this.requireContext();
    return Array.from(inMemoryDb.assets.values()).filter(
      a => a.organization_id === ctx.organizationId && a.workspace_id === ctx.workspaceId
    );
  }

  async getAssetById(assetId: string): Promise<AssetRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        // Postgres RLS will return 0 rows if assetId belongs to another org or workspace
        const res = await client.query(
          "SELECT * FROM assets WHERE id = $1 AND organization_id = $2 AND workspace_id = $3 LIMIT 1",
          [assetId, ctx.organizationId, ctx.workspaceId]
        );
        if (res.rows.length === 0) return null;
        return mapAsset(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    if (!asset || asset.organization_id !== ctx.organizationId || asset.workspace_id !== ctx.workspaceId) {
      return null;
    }
    return asset;
  }

  async createAsset(data: {
    targetType: AssetRecord['target_type'];
    targetValue: string;
    criticality?: AssetRecord['criticality'];
    tags?: string[];
  }): Promise<AssetRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const id = randomUUID();
        const res = await client.query(
          `INSERT INTO assets (id, organization_id, workspace_id, target_type, target_value, criticality, tags, current_score, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'active', NOW(), NOW())
           RETURNING *`,
          [
            id,
            ctx.organizationId,
            ctx.workspaceId,
            data.targetType,
            data.targetValue,
            data.criticality || 'tier_2_business',
            data.tags || [],
          ]
        );
        return mapAsset(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const id = randomUUID();
    const now = new Date().toISOString();
    const asset: AssetRecord = {
      id,
      organization_id: ctx.organizationId,
      workspace_id: ctx.workspaceId,
      target_type: data.targetType,
      target_value: data.targetValue,
      criticality: data.criticality || 'tier_2_business',
      tags: data.tags || [],
      current_score: null,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.assets.set(id, asset);
    return asset;
  }

  async updateAsset(
    assetId: string,
    data: Partial<Pick<AssetRecord, 'target_value' | 'criticality' | 'tags' | 'status' | 'current_score'>>
  ): Promise<AssetRecord | null> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const existing = await client.query(
          "SELECT * FROM assets WHERE id = $1 AND organization_id = $2 AND workspace_id = $3 LIMIT 1",
          [assetId, ctx.organizationId, ctx.workspaceId]
        );
        if (existing.rows.length === 0) return null;

        const current = existing.rows[0];
        const res = await client.query(
          `UPDATE assets
           SET target_value = $1, criticality = $2, tags = $3, status = $4, current_score = $5, updated_at = NOW()
           WHERE id = $6 AND organization_id = $7 AND workspace_id = $8
           RETURNING *`,
          [
            data.target_value !== undefined ? data.target_value : current.target_value,
            data.criticality !== undefined ? data.criticality : current.criticality,
            data.tags !== undefined ? data.tags : current.tags,
            data.status !== undefined ? data.status : current.status,
            data.current_score !== undefined ? data.current_score : current.current_score,
            assetId,
            ctx.organizationId,
            ctx.workspaceId,
          ]
        );
        if (res.rows.length === 0) return null;
        return mapAsset(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    if (!asset || asset.organization_id !== ctx.organizationId || asset.workspace_id !== ctx.workspaceId) {
      return null;
    }
    if (data.target_value !== undefined) asset.target_value = data.target_value;
    if (data.criticality !== undefined) asset.criticality = data.criticality;
    if (data.tags !== undefined) asset.tags = data.tags;
    if (data.status !== undefined) asset.status = data.status;
    if (data.current_score !== undefined) asset.current_score = data.current_score;
    asset.updated_at = new Date().toISOString();
    return asset;
  }

  async deleteAsset(assetId: string): Promise<boolean> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const res = await client.query(
          "DELETE FROM assets WHERE id = $1 AND organization_id = $2 AND workspace_id = $3 RETURNING id",
          [assetId, ctx.organizationId, ctx.workspaceId]
        );
        return (res.rowCount || 0) > 0;
      });
    }

    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    if (!asset || asset.organization_id !== ctx.organizationId || asset.workspace_id !== ctx.workspaceId) {
      return false;
    }
    inMemoryDb.assets.delete(assetId);
    return true;
  }

  // --------------------------------------------------------------------------
  // SCANS & FINDINGS (RLS ENFORCED)
  // --------------------------------------------------------------------------

  async createScan(data: {
    assetId: string;
    scanType?: ScanRecord['scan_type'];
    isVerified?: boolean;
    overallScore?: number | null;
    rawSummary?: Record<string, unknown>;
  }): Promise<ScanRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        // Verify asset exists in this tenant workspace
        const assetRes = await client.query(
          "SELECT id FROM assets WHERE id = $1 AND organization_id = $2 AND workspace_id = $3 LIMIT 1",
          [data.assetId, ctx.organizationId, ctx.workspaceId]
        );
        if (assetRes.rows.length === 0) {
          throw new Error("Asset not found in current workspace");
        }

        const id = randomUUID();
        const res = await client.query(
          `INSERT INTO scans (id, organization_id, workspace_id, asset_id, triggered_by, scan_type, execution_status, overall_score, is_verified, raw_summary, created_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
           RETURNING *`,
          [
            id,
            ctx.organizationId,
            ctx.workspaceId,
            data.assetId,
            ctx.userId,
            data.scanType || 'on_demand',
            data.isVerified === false ? 'imported' : 'verified',
            data.overallScore !== undefined ? data.overallScore : null,
            data.isVerified !== undefined ? data.isVerified : true,
            JSON.stringify(data.rawSummary || {}),
          ]
        );
        return mapScan(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const asset = await this.getAssetById(data.assetId);
    if (!asset) {
      throw new Error("Asset not found in current workspace");
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const scan: ScanRecord = {
      id,
      organization_id: ctx.organizationId,
      workspace_id: ctx.workspaceId,
      asset_id: data.assetId,
      triggered_by: ctx.userId,
      scan_type: data.scanType || 'on_demand',
      execution_status: data.isVerified === false ? 'imported' : 'verified',
      overall_score: data.overallScore !== undefined ? data.overallScore : null,
      is_verified: data.isVerified !== undefined ? data.isVerified : true,
      raw_summary: data.rawSummary || {},
      created_at: now,
      completed_at: now,
    };
    inMemoryDb.scans.set(id, scan);
    return scan;
  }

  async getScans(): Promise<ScanRecord[]> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const res = await client.query(
          "SELECT * FROM scans WHERE organization_id = $1 AND workspace_id = $2 ORDER BY created_at DESC",
          [ctx.organizationId, ctx.workspaceId]
        );
        return res.rows.map(mapScan);
      });
    }

    const ctx = this.requireContext();
    return Array.from(inMemoryDb.scans.values()).filter(
      s => s.organization_id === ctx.organizationId && s.workspace_id === ctx.workspaceId
    );
  }

  async createFinding(data: {
    scanId: string;
    domainCategory: string;
    title: string;
    description: string;
    severity: FindingRecord['severity'];
    verificationClass: FindingRecord['verification_class'];
    recommendation: string;
  }): Promise<FindingRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const scanRes = await client.query(
          "SELECT id FROM scans WHERE id = $1 AND organization_id = $2 AND workspace_id = $3 LIMIT 1",
          [data.scanId, ctx.organizationId, ctx.workspaceId]
        );
        if (scanRes.rows.length === 0) {
          throw new Error("Target scan not found in tenant workspace");
        }

        const id = randomUUID();
        const res = await client.query(
          `INSERT INTO findings (id, organization_id, workspace_id, scan_id, domain_category, title, description, severity, verification_class, recommendation, remediation_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', NOW())
           RETURNING *`,
          [
            id,
            ctx.organizationId,
            ctx.workspaceId,
            data.scanId,
            data.domainCategory,
            data.title,
            data.description,
            data.severity,
            data.verificationClass,
            data.recommendation,
          ]
        );
        return mapFinding(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const scan = inMemoryDb.scans.get(data.scanId);
    if (!scan || scan.organization_id !== ctx.organizationId || scan.workspace_id !== ctx.workspaceId) {
      throw new Error("Target scan not found in tenant workspace");
    }
    const id = randomUUID();
    const finding: FindingRecord = {
      id,
      organization_id: ctx.organizationId,
      workspace_id: ctx.workspaceId,
      scan_id: data.scanId,
      domain_category: data.domainCategory,
      title: data.title,
      description: data.description,
      severity: data.severity,
      verification_class: data.verificationClass,
      recommendation: data.recommendation,
      remediation_status: 'open',
      created_at: new Date().toISOString(),
    };
    inMemoryDb.findings.set(id, finding);
    return finding;
  }

  async getFindings(): Promise<FindingRecord[]> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const res = await client.query(
          "SELECT * FROM findings WHERE organization_id = $1 AND workspace_id = $2 ORDER BY created_at DESC",
          [ctx.organizationId, ctx.workspaceId]
        );
        return res.rows.map(mapFinding);
      });
    }

    const ctx = this.requireContext();
    return Array.from(inMemoryDb.findings.values()).filter(
      f => f.organization_id === ctx.organizationId && f.workspace_id === ctx.workspaceId
    );
  }

  // --------------------------------------------------------------------------
  // AUDIT LOGS (RLS ENFORCED)
  // --------------------------------------------------------------------------

  async logAuditEvent(
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown> = {},
    actorIp = '127.0.0.1'
  ): Promise<AuditLogRecord> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const id = randomUUID();
        const res = await client.query(
          `INSERT INTO audit_logs (id, organization_id, workspace_id, actor_id, actor_ip, action, resource_type, resource_id, details, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING *`,
          [
            id,
            ctx.organizationId,
            ctx.workspaceId,
            ctx.userId,
            actorIp,
            action,
            resourceType,
            resourceId,
            JSON.stringify(details),
          ]
        );
        return mapAuditLog(res.rows[0]);
      });
    }

    const ctx = this.requireContext();
    const id = randomUUID();
    const log: AuditLogRecord = {
      id,
      organization_id: ctx.organizationId,
      workspace_id: ctx.workspaceId,
      actor_id: ctx.userId,
      actor_ip: actorIp,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      timestamp: new Date().toISOString(),
    };
    inMemoryDb.auditLogs.set(id, log);
    return log;
  }

  async logSystemAuditEvent(data: {
    organizationId?: string | null;
    workspaceId?: string | null;
    actorId?: string | null;
    actorIp?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
  }): Promise<AuditLogRecord | null> {
    const driver = getActiveDriver();
    const actorIp = data.actorIp || "127.0.0.1";
    const details = data.details || {};

    if (driver === "postgres") {
      if (!data.organizationId) {
        return null;
      }
      return this.withSystemTransaction(async (client) => {
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [data.organizationId]);
        const id = randomUUID();
        const res = await client.query(
          `INSERT INTO audit_logs (id, organization_id, workspace_id, actor_id, actor_ip, action, resource_type, resource_id, details, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING *`,
          [
            id,
            data.organizationId,
            data.workspaceId || null,
            data.actorId || null,
            actorIp,
            data.action,
            data.resourceType,
            data.resourceId,
            JSON.stringify(details),
          ]
        );
        return mapAuditLog(res.rows[0]);
      });
    }

    if (!data.organizationId) return null;
    const id = randomUUID();
    const log: AuditLogRecord = {
      id,
      organization_id: data.organizationId,
      workspace_id: data.workspaceId || "",
      actor_id: data.actorId || null,
      actor_ip: actorIp,
      action: data.action,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      details,
      timestamp: new Date().toISOString(),
    };
    inMemoryDb.auditLogs.set(id, log);
    return log;
  }

  async getAuditLogs(): Promise<AuditLogRecord[]> {
    const driver = getActiveDriver();
    if (driver === "postgres") {
      return this.withTenantTransaction(async (client, ctx) => {
        const res = await client.query(
          "SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY timestamp DESC",
          [ctx.organizationId]
        );
        return res.rows.map(mapAuditLog);
      });
    }

    const ctx = this.requireContext();
    return Array.from(inMemoryDb.auditLogs.values()).filter(
      l => l.organization_id === ctx.organizationId
    );
  }
}
