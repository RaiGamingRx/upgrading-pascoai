/**
 * PASCOAI ENTERPRISE AUTHENTICATION API ENDPOINT (STAGE 8.1)
 * 
 * Endpoints handled:
 * - POST /api/auth?action=register
 * - POST /api/auth?action=login
 * - POST /api/auth?action=refresh
 * - POST /api/auth?action=logout
 * - GET  /api/auth?action=me
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { EnterpriseDbClient, inMemoryDb } from "./db-engine.ts";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  formatRefreshCookie,
  formatClearRefreshCookie,
} from "./auth-engine.ts";
import { authenticateAndAuthorize } from "./rbac.ts";

export default async function authHandler(req: IncomingMessage & { body?: any; query?: any }, res: ServerResponse & { status: (code: number) => any; json: (data: any) => any }) {
  const method = req.method || "GET";
  const action = req.query?.action || (method === "GET" ? "me" : "login");
  const db = new EnterpriseDbClient();

  try {
    // ------------------------------------------------------------------------
    // REGISTER (Initial enterprise account + organization bootstrapping)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "register") {
      const { email, password, displayName, organizationName } = req.body || {};
      if (!email || !password || !displayName || !organizationName) {
        return res.status(400).json({ error: "Missing required fields (email, password, displayName, organizationName)" });
      }

      if (password.length < 10) {
        return res.status(400).json({ error: "Password must be at least 10 characters" });
      }

      const existingUser = await db.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "User already exists with this email" });
      }

      const passwordHash = await hashPassword(password);
      const user = await db.createUser({
        email,
        display_name: displayName,
        password_hash: passwordHash,
        is_active: true,
      });

      const slug = organizationName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32);
      const org = await db.createOrganization(organizationName, `${slug}-${Date.now().toString(36)}`);
      const workspace = await db.createWorkspace(org.id, "Production Perimeter", "production", true);
      
      // Default creator becomes org_admin
      const membership = await db.addWorkspaceMember(org.id, workspace.id, user.id, "org_admin");

      // Generate initial tokens
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        organizationId: org.id,
        workspaceId: workspace.id,
        role: membership.role,
      });

      const { rawToken: refreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(refreshToken));

      return res.status(201).json({
        accessToken,
        user: { id: user.id, email: user.email, displayName: user.display_name },
        tenant: { organizationId: org.id, workspaceId: workspace.id, role: membership.role },
      });
    }

    // ------------------------------------------------------------------------
    // LOGIN
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "login") {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await db.findUserByEmail(email);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const memberships = await db.getUserMemberships(user.id);
      if (memberships.length === 0) {
        return res.status(403).json({ error: "No active organization memberships" });
      }

      const activeMembership = memberships[0];
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        role: activeMembership.role,
      });

      const { rawToken: refreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(refreshToken));

      return res.status(200).json({
        accessToken,
        user: { id: user.id, email: user.email, displayName: user.display_name },
        tenant: {
          organizationId: activeMembership.organization_id,
          workspaceId: activeMembership.workspace_id,
          role: activeMembership.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // REFRESH TOKEN (With Reuse Detection)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "refresh") {
      // Extract refresh token from cookie or body
      let rawRefreshToken = req.body?.refreshToken;
      if (!rawRefreshToken && req.headers?.cookie) {
        const match = req.headers.cookie.match(/pasco_refresh_token=([^;]+)/);
        if (match) rawRefreshToken = match[1];
      }

      if (!rawRefreshToken) {
        return res.status(401).json({ error: "Refresh token is missing" });
      }

      const rotated = await rotateRefreshToken(db, rawRefreshToken);
      if (!rotated) {
        res.setHeader("Set-Cookie", formatClearRefreshCookie());
        return res.status(401).json({ error: "Invalid or compromised refresh token" });
      }

      const memberships = await db.getUserMemberships(rotated.user.id);
      if (memberships.length === 0) {
        return res.status(403).json({ error: "User has no active organization memberships" });
      }

      const activeMembership = memberships[0];
      const accessToken = signAccessToken({
        sub: rotated.user.id,
        email: rotated.user.email,
        displayName: rotated.user.display_name,
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        role: activeMembership.role,
      });

      res.setHeader("Set-Cookie", formatRefreshCookie(rotated.newRawToken));
      return res.status(200).json({
        accessToken,
        user: { id: rotated.user.id, email: rotated.user.email, displayName: rotated.user.display_name },
        tenant: {
          organizationId: activeMembership.organization_id,
          workspaceId: activeMembership.workspace_id,
          role: activeMembership.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // LOGOUT
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "logout") {
      let rawRefreshToken = req.body?.refreshToken;
      if (!rawRefreshToken && req.headers?.cookie) {
        const match = req.headers.cookie.match(/pasco_refresh_token=([^;]+)/);
        if (match) rawRefreshToken = match[1];
      }
      if (rawRefreshToken) {
        const [familyId] = rawRefreshToken.split(".");
        if (familyId) await db.revokeTokenFamily(familyId);
      }
      res.setHeader("Set-Cookie", formatClearRefreshCookie());
      return res.status(200).json({ message: "Logged out successfully" });
    }

    // ------------------------------------------------------------------------
    // ME / SESSION INFO
    // ------------------------------------------------------------------------
    if (method === "GET" && action === "me") {
      const authHeader = req.headers?.authorization;
      const { context, userPayload } = await authenticateAndAuthorize(db, authHeader);
      return res.status(200).json({
        user: { id: userPayload.sub, email: userPayload.email, displayName: userPayload.displayName },
        tenant: {
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          role: context.role,
        },
      });
    }

    return res.status(400).json({ error: `Unsupported auth action: ${action}` });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Authentication error" });
  }
}
