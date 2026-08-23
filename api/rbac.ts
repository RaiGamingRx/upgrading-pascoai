/**
 * PASCOAI ENTERPRISE RBAC & AUTHORIZATION ENGINE (STAGE 8.1)
 * 
 * Enforces role boundaries, action permissions, and contextual derivation.
 * 
 * CRITICAL RULE:
 * Never trust a client-supplied organization_id or workspace_id.
 * Tenant context is strictly derived from authenticated memberships.
 */

import { EnterpriseDbClient, type TenantContext, type WorkspaceMemberRecord } from "./db-engine.ts";
import { verifyAccessToken, type AccessTokenPayload } from "./auth-engine.ts";

export type UserRole = WorkspaceMemberRecord['role'];

export const SecurityAction = {
  RUN_SCAN: "action:scan:run",
  VIEW_REPORTS: "action:reports:view",
  CREATE_ASSET: "action:asset:create",
  MODIFY_ASSET: "action:asset:modify",
  DELETE_ASSET: "action:asset:delete",
  MANAGE_MEMBERS: "action:members:manage",
  MANAGE_ORG: "action:org:manage",
  VIEW_AUDIT_LOGS: "action:audit:view",
  IMPORT_MIGRATION: "action:migration:import",
} as const;

export type SecurityAction = (typeof SecurityAction)[keyof typeof SecurityAction];

/**
 * RBAC Permission Matrix
 */
const ROLE_PERMISSIONS: Record<UserRole, Set<SecurityAction>> = {
  org_admin: new Set([
    SecurityAction.RUN_SCAN,
    SecurityAction.VIEW_REPORTS,
    SecurityAction.CREATE_ASSET,
    SecurityAction.MODIFY_ASSET,
    SecurityAction.DELETE_ASSET,
    SecurityAction.MANAGE_MEMBERS,
    SecurityAction.MANAGE_ORG,
    SecurityAction.VIEW_AUDIT_LOGS,
    SecurityAction.IMPORT_MIGRATION,
  ]),
  security_lead: new Set([
    SecurityAction.RUN_SCAN,
    SecurityAction.VIEW_REPORTS,
    SecurityAction.CREATE_ASSET,
    SecurityAction.MODIFY_ASSET,
    SecurityAction.DELETE_ASSET,
    SecurityAction.MANAGE_MEMBERS,
    SecurityAction.VIEW_AUDIT_LOGS,
    SecurityAction.IMPORT_MIGRATION,
  ]),
  secops_analyst: new Set([
    SecurityAction.RUN_SCAN,
    SecurityAction.VIEW_REPORTS,
    SecurityAction.CREATE_ASSET,
    SecurityAction.MODIFY_ASSET,
    SecurityAction.IMPORT_MIGRATION,
  ]),
  compliance_auditor: new Set([
    SecurityAction.VIEW_REPORTS,
    SecurityAction.VIEW_AUDIT_LOGS,
  ]),
  viewer: new Set([
    SecurityAction.VIEW_REPORTS,
  ]),
};

/**
 * Checks if a given role is permitted to perform a specific action
 */
export function isPermitted(role: UserRole, action: SecurityAction): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.has(action);
}

/**
 * Validates request authorization and derives verified tenant context
 */
export async function authenticateAndAuthorize(
  db: EnterpriseDbClient,
  authHeader: string | undefined,
  requestedWorkspaceId?: string,
  requiredAction?: SecurityAction
): Promise<{ context: TenantContext; userPayload: AccessTokenPayload }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED: Missing or malformed Bearer token");
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyAccessToken(token);
  if (!payload) {
    throw new Error("UNAUTHORIZED: Invalid or expired access token");
  }

  // Look up verified user memberships from database (never trust client claims)
  const memberships = await db.getUserMemberships(payload.sub);
  if (!memberships || memberships.length === 0) {
    throw new Error("FORBIDDEN: User has no active organization memberships");
  }

  // If a specific workspace was requested by the client, verify user actually has access to it
  let activeMembership: WorkspaceMemberRecord | undefined;
  if (requestedWorkspaceId) {
    activeMembership = memberships.find(m => m.workspace_id === requestedWorkspaceId);
    if (!activeMembership) {
      // Cross-workspace or cross-tenant access attempt: Reject without disclosing existence
      throw new Error("FORBIDDEN: Access to requested workspace is denied or does not exist");
    }
  } else {
    // Default to workspace specified in the access token or first valid membership
    activeMembership = memberships.find(m => m.workspace_id === payload.workspaceId) || memberships[0];
  }

  if (!activeMembership) {
    throw new Error("FORBIDDEN: No accessible workspace found");
  }

  // Enforce Action Permission
  if (requiredAction && !isPermitted(activeMembership.role, requiredAction)) {
    throw new Error(`FORBIDDEN: Role '${activeMembership.role}' is not authorized to execute '${requiredAction}'`);
  }

  const context: TenantContext = {
    organizationId: activeMembership.organization_id,
    workspaceId: activeMembership.workspace_id,
    userId: payload.sub,
    role: activeMembership.role,
  };

  return { context, userPayload: payload };
}
