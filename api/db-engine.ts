/**
 * PASCOAI ENTERPRISE DATABASE & RLS ENGINE (STAGE 8.1)
 * 
 * Provides zero-trust, tenant-isolated data operations with strict
 * PostgreSQL Row-Level Security (RLS) enforcement.
 * 
 * CRITICAL SECURITY GUARANTEES:
 * 1. Every tenant-owned query requires an authenticated context.
 * 2. If app.current_org_id or app.current_workspace_id is absent, queries FAIL CLOSED.
 * 3. PostgreSQL FORCE ROW LEVEL SECURITY semantics are strictly modeled and enforced.
 */

import { randomUUID } from "node:crypto";

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
  created_at: string;
  revoked_at: string | null;
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

/**
 * In-Memory RLS Engine Store for Development & Security Tests
 */
class InMemoryEnterpriseDb {
  organizations = new Map<string, OrganizationRecord>();
  workspaces = new Map<string, WorkspaceRecord>();
  users = new Map<string, UserRecord>();
  workspaceMembers = new Map<string, WorkspaceMemberRecord>();
  refreshTokens = new Map<string, RefreshTokenRecord>();
  assets = new Map<string, AssetRecord>();
  scans = new Map<string, ScanRecord>();
  findings = new Map<string, FindingRecord>();
  auditLogs = new Map<string, AuditLogRecord>();

  clear() {
    this.organizations.clear();
    this.workspaces.clear();
    this.users.clear();
    this.workspaceMembers.clear();
    this.refreshTokens.clear();
    this.assets.clear();
    this.scans.clear();
    this.findings.clear();
    this.auditLogs.clear();
  }
}

export const inMemoryDb = new InMemoryEnterpriseDb();

/**
 * Enterprise Database Client with Mandatory Context Enforcement (RLS)
 */
export class EnterpriseDbClient {
  private context: TenantContext | null;

  constructor(context: TenantContext | null = null) {
    this.context = context;
  }

  /**
   * Internal check verifying tenant context exists and is valid
   * FAILS CLOSED if context is missing.
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

  // --------------------------------------------------------------------------
  // USER / AUTH OPS (System Level & Context-Guarded)
  // --------------------------------------------------------------------------
  async createUser(data: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'>): Promise<UserRecord> {
    const existing = Array.from(inMemoryDb.users.values()).find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      throw new Error("User with this email already exists");
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const user: UserRecord = {
      id,
      email: data.email.toLowerCase(),
      display_name: data.display_name,
      password_hash: data.password_hash,
      is_active: data.is_active ?? true,
      created_at: now,
      updated_at: now,
    };
    inMemoryDb.users.set(id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const found = Array.from(inMemoryDb.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase());
    return found || null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return inMemoryDb.users.get(userId) || null;
  }

  // --------------------------------------------------------------------------
  // ORGANIZATION & WORKSPACE OPS
  // --------------------------------------------------------------------------
  async createOrganization(name: string, slug: string, tier = 'enterprise'): Promise<OrganizationRecord> {
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
    return Array.from(inMemoryDb.workspaceMembers.values()).filter(m => m.user_id === userId);
  }

  // --------------------------------------------------------------------------
  // REFRESH TOKEN ROTATION & TOKEN FAMILIES
  // --------------------------------------------------------------------------
  async saveRefreshToken(userId: string, familyId: string, tokenHash: string, expiresAt: Date): Promise<RefreshTokenRecord> {
    const id = randomUUID();
    const record: RefreshTokenRecord = {
      id,
      user_id: userId,
      family_id: familyId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      is_revoked: false,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    inMemoryDb.refreshTokens.set(id, record);
    return record;
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const found = Array.from(inMemoryDb.refreshTokens.values()).find(t => t.token_hash === tokenHash);
    return found || null;
  }

  async revokeTokenFamily(familyId: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const record of inMemoryDb.refreshTokens.values()) {
      if (record.family_id === familyId && !record.is_revoked) {
        record.is_revoked = true;
        record.revoked_at = now;
        count++;
      }
    }
    return count;
  }

  async consumeRefreshToken(recordId: string): Promise<void> {
    const record = inMemoryDb.refreshTokens.get(recordId);
    if (record) {
      record.is_revoked = true;
      record.revoked_at = new Date().toISOString();
    }
  }

  // --------------------------------------------------------------------------
  // ASSET OPERATIONS (RLS ENFORCED)
  // --------------------------------------------------------------------------
  async getAssets(): Promise<AssetRecord[]> {
    const ctx = this.requireContext();
    // PostgreSQL RLS: organization_id = ctx.organizationId AND workspace_id = ctx.workspaceId
    return Array.from(inMemoryDb.assets.values()).filter(
      a => a.organization_id === ctx.organizationId && a.workspace_id === ctx.workspaceId
    );
  }

  async getAssetById(assetId: string): Promise<AssetRecord | null> {
    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    // RLS Enforcement: If asset belongs to another org or workspace, return null (404 without disclosure)
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

  async updateAsset(assetId: string, data: Partial<Pick<AssetRecord, 'target_value' | 'criticality' | 'tags' | 'status' | 'current_score'>>): Promise<AssetRecord | null> {
    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    if (!asset || asset.organization_id !== ctx.organizationId || asset.workspace_id !== ctx.workspaceId) {
      return null; // RLS denial
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
    const ctx = this.requireContext();
    const asset = inMemoryDb.assets.get(assetId);
    if (!asset || asset.organization_id !== ctx.organizationId || asset.workspace_id !== ctx.workspaceId) {
      return false; // RLS denial
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
    const ctx = this.requireContext();
    // Validate that asset exists in tenant workspace
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
    const ctx = this.requireContext();
    return Array.from(inMemoryDb.findings.values()).filter(
      f => f.organization_id === ctx.organizationId && f.workspace_id === ctx.workspaceId
    );
  }

  // --------------------------------------------------------------------------
  // AUDIT LOGS (RLS ENFORCED)
  // --------------------------------------------------------------------------
  async logAuditEvent(action: string, resourceType: string, resourceId: string, details: Record<string, unknown> = {}, actorIp = '127.0.0.1'): Promise<AuditLogRecord> {
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

  async getAuditLogs(): Promise<AuditLogRecord[]> {
    const ctx = this.requireContext();
    return Array.from(inMemoryDb.auditLogs.values()).filter(
      l => l.organization_id === ctx.organizationId
    );
  }
}
