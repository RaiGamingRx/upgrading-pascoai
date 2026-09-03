/**
 * PASCOAI ENTERPRISE AUTHENTICATION & SESSION SECURITY API (STAGE 8.2)
 * 
 * Endpoints handled:
 * - POST /api/auth?action=register
 * - POST /api/auth?action=login
 * - POST /api/auth?action=mfa-setup
 * - POST /api/auth?action=mfa-confirm
 * - POST /api/auth?action=mfa-verify
 * - POST /api/auth?action=mfa-disable
 * - POST /api/auth?action=forgot-password
 * - POST /api/auth?action=reset-password
 * - POST /api/auth?action=verify-email
 * - POST /api/auth?action=refresh
 * - POST /api/auth?action=logout
 * - POST /api/auth?action=revoke-sessions
 * - GET  /api/auth?action=me
 * - POST /api/auth?action=change-password
 * - POST /api/auth?action=update-profile
 * - POST /api/auth?action=delete-account
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { EnterpriseDbClient } from "./db-engine.ts";
import {
  hashPassword,
  verifyPassword,
  performDummyPasswordVerification,
  signAccessToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  createRefreshToken,
  rotateRefreshToken,
  formatRefreshCookie,
  formatClearRefreshCookie,
} from "./auth-engine.ts";
import {
  generateMfaSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpauthUri,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  encryptMfaSecret,
  decryptMfaSecret,
} from "./mfa-engine.ts";
import {
  validatePasswordPolicy,
  TOKEN_LIFETIMES,
} from "./auth-config.ts";
import { authenticateAndAuthorize } from "./rbac.ts";
import { createRateLimiter } from "./api-utils.ts";

// Multi-Tier Rate Limiters
const loginIpLimiter = createRateLimiter(60 * 1000, 15, 15); // Max 15 login requests per min per IP
const accountLockoutTracker = new Map<string, { failedAttempts: number; lockedUntil: number }>();
const registerIpLimiter = createRateLimiter(10 * 60 * 1000, 10, 10); // Max 10 registrations per 10 min per IP
const forgotPasswordLimiter = createRateLimiter(15 * 60 * 1000, 10, 10); // Max 10 reset requests per 15 min per IP
const mfaVerifyLimiter = createRateLimiter(5 * 60 * 1000, 10, 10); // Max 10 MFA verifications per 5 min per IP

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers ? req.headers["x-forwarded-for"] : undefined;
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}

function checkAccountLockout(email: string): { locked: boolean; retryAfterSec: number } {
  const normalized = email.toLowerCase().trim();
  const entry = accountLockoutTracker.get(normalized);
  if (!entry) return { locked: false, retryAfterSec: 0 };

  const now = Date.now();
  if (entry.lockedUntil > now) {
    const retryAfterSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return { locked: true, retryAfterSec };
  }

  // Lockout expired, reset if needed
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    accountLockoutTracker.delete(normalized);
  }
  return { locked: false, retryAfterSec: 0 };
}

function recordLoginFailure(email: string): void {
  const normalized = email.toLowerCase().trim();
  const entry = accountLockoutTracker.get(normalized) || { failedAttempts: 0, lockedUntil: 0 };
  entry.failedAttempts += 1;

  // If 5 consecutive failures, lock account for 5 minutes (300 seconds)
  if (entry.failedAttempts >= 5) {
    entry.lockedUntil = Date.now() + 5 * 60 * 1000;
  }
  accountLockoutTracker.set(normalized, entry);
}

function resetLoginFailures(email: string): void {
  const normalized = email.toLowerCase().trim();
  accountLockoutTracker.delete(normalized);
}

export default async function authHandler(
  req: IncomingMessage & { body?: any; query?: any },
  res: ServerResponse & { status: (code: number) => any; json: (data: any) => any }
) {
  const method = req.method || "GET";
  const action = req.query?.action || (method === "GET" ? "me" : "login");
  const db = new EnterpriseDbClient();
  const clientIp = getClientIp(req);

  try {
    // ------------------------------------------------------------------------
    // REGISTER (Initial enterprise account + organization bootstrapping)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "register") {
      const rateCheck = registerIpLimiter.acquire(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfter));
        return res.status(429).json({ error: "Too many registration requests. Please try again later." });
      }

      const { email, password, displayName, organizationName } = req.body || {};
      if (!email || !password || !displayName) {
        return res.status(400).json({ error: "Missing required fields (email, password, displayName)" });
      }

      // Strict Password Policy Validation
      const passwordCheck = validatePasswordPolicy(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.error });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = await db.findUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ error: "User already exists with this email" });
      }

      const effectiveOrgName = organizationName?.trim() || `${displayName.trim()}'s Security Perimeter`;
      const passwordHash = await hashPassword(password);
      const user = await db.createUser({
        email: normalizedEmail,
        display_name: displayName.trim(),
        password_hash: passwordHash,
        is_active: true,
      });

      const slug = effectiveOrgName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32);
      const org = await db.createOrganization(effectiveOrgName, `${slug}-${Date.now().toString(36)}`);
      const workspace = await db.createWorkspace(org.id, "Production Perimeter", "production", true);

      // Default creator becomes org_admin
      const membership = await db.addWorkspaceMember(org.id, workspace.id, user.id, "org_admin");

      // Audit Log
      await db.logSystemAuditEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        actorId: user.id,
        actorIp: clientIp,
        action: "auth.register",
        resourceType: "user",
        resourceId: user.id,
        details: { email: user.email, organization: org.name },
      });

      // Generate initial tokens
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        organizationId: org.id,
        workspaceId: workspace.id,
        role: membership.role,
        tokenVersion: user.token_version || 1,
      });

      const { rawToken: refreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(refreshToken));

      return res.status(201).json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerified: user.email_verified,
          mfaEnabled: user.mfa_enabled,
        },
        tenant: { organizationId: org.id, workspaceId: workspace.id, role: membership.role },
      });
    }

    // ------------------------------------------------------------------------
    // LOGIN (With Timing Side-Channel Mitigation & MFA Challenge Branch)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "login") {
      const rateCheck = loginIpLimiter.acquire(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfter));
        return res.status(429).json({ error: "Too many login attempts. Please try again later." });
      }

      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check account lockout
      const lockout = checkAccountLockout(normalizedEmail);
      if (lockout.locked) {
        res.setHeader("Retry-After", String(lockout.retryAfterSec));
        return res.status(429).json({
          error: `Account temporarily locked due to multiple failed attempts. Try again in ${lockout.retryAfterSec} seconds.`,
        });
      }

      const user = await db.findUserByEmail(normalizedEmail);

      // ANTI-ENUMERATION / TIMING ATTACK MITIGATION:
      // If user does not exist, execute dummy Argon2id hash verification
      if (!user || user.is_active === false) {
        await performDummyPasswordVerification(password);
        recordLoginFailure(normalizedEmail);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        recordLoginFailure(normalizedEmail);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Password verified successfully: clear failure counter
      resetLoginFailures(normalizedEmail);

      // CHECK MFA ENFORCEMENT
      if (user.mfa_enabled) {
        const mfaChallengeToken = signMfaChallengeToken(user.id, user.email);

        const memberships = await db.getUserMemberships(user.id);
        const orgId = memberships[0]?.organization_id;
        if (orgId) {
          await db.logSystemAuditEvent({
            organizationId: orgId,
            actorId: user.id,
            actorIp: clientIp,
            action: "auth.login.mfa_challenge_issued",
            resourceType: "user",
            resourceId: user.id,
          });
        }

        return res.status(200).json({
          mfaRequired: true,
          mfaChallengeToken,
          message: "Multi-factor authentication required. Submit verification code.",
        });
      }

      // User has no MFA: Issue full session tokens
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
        tokenVersion: user.token_version || 1,
      });

      const { rawToken: refreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(refreshToken));

      await db.logSystemAuditEvent({
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        actorId: user.id,
        actorIp: clientIp,
        action: "auth.login.success",
        resourceType: "user",
        resourceId: user.id,
      });

      return res.status(200).json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerified: user.email_verified,
          mfaEnabled: user.mfa_enabled,
        },
        tenant: {
          organizationId: activeMembership.organization_id,
          workspaceId: activeMembership.workspace_id,
          role: activeMembership.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // MFA VERIFY (For completing login ceremony)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-verify") {
      const rateCheck = mfaVerifyLimiter.acquire(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfter));
        return res.status(429).json({ error: "Too many MFA attempts. Please try again later." });
      }

      const { mfaChallengeToken, code, backupCode } = req.body || {};
      if (!mfaChallengeToken) {
        return res.status(400).json({ error: "Missing mfaChallengeToken" });
      }

      const challenge = verifyMfaChallengeToken(mfaChallengeToken);
      if (!challenge) {
        return res.status(401).json({ error: "MFA challenge token expired or invalid. Please log in again." });
      }

      const user = await db.findUserById(challenge.sub);
      if (!user || !user.is_active || !user.mfa_enabled || !user.mfa_secret) {
        return res.status(401).json({ error: "Invalid MFA state" });
      }

      const plainSecret = decryptMfaSecret(user.mfa_secret);
      let verified = false;
      let usedBackup = false;

      // 1. Try TOTP code if provided
      if (code) {
        verified = verifyTotpCode(plainSecret, String(code));
      }

      // 2. If TOTP failed and backup code provided, check backup codes
      if (!verified && backupCode) {
        const backupCheck = verifyAndConsumeBackupCode(String(backupCode), user.mfa_backup_codes || []);
        if (backupCheck.valid) {
          verified = true;
          usedBackup = true;
          // Persist remaining backup codes
          await db.updateUserMfa(user.id, {
            enabled: true,
            backupCodes: backupCheck.remainingHashedCodes,
          });
        }
      }

      if (!verified) {
        return res.status(401).json({ error: "Invalid verification code or backup code" });
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
        tokenVersion: user.token_version || 1,
      });

      const { rawToken: refreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(refreshToken));

      await db.logSystemAuditEvent({
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        actorId: user.id,
        actorIp: clientIp,
        action: usedBackup ? "auth.mfa.login_backup_code" : "auth.mfa.login_totp",
        resourceType: "user",
        resourceId: user.id,
      });

      return res.status(200).json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          emailVerified: user.email_verified,
          mfaEnabled: user.mfa_enabled,
        },
        tenant: {
          organizationId: activeMembership.organization_id,
          workspaceId: activeMembership.workspace_id,
          role: activeMembership.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // MFA SETUP (Initiate enrollment: generate secret & backup codes)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-setup") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);

      const user = await db.findUserById(userPayload.sub);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.mfa_enabled) {
        return res.status(400).json({ error: "Multi-factor authentication is already enabled for this account" });
      }

      // Generate new 160-bit Base32 secret
      const secret = generateMfaSecret();
      const otpauthUri = generateOtpauthUri(user.email, secret);
      const { plaintextCodes } = generateBackupCodes(10);

      return res.status(200).json({
        secret,
        otpauthUri,
        backupCodes: plaintextCodes,
        message: "Scan QR code or enter secret into your authenticator app, then confirm with a 6-digit code.",
      });
    }

    // ------------------------------------------------------------------------
    // MFA CONFIRM (Verify code before persisting encrypted secret)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-confirm") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { code, secret, backupCodes } = req.body || {};

      if (!code || !secret || !Array.isArray(backupCodes)) {
        return res.status(400).json({ error: "Missing required fields (code, secret, backupCodes)" });
      }

      const isValid = verifyTotpCode(secret, String(code));
      if (!isValid) {
        return res.status(400).json({
          error: "Invalid authentication code. Please ensure your device clock is synchronized and try again.",
        });
      }

      // Encrypt secret with AES-256-GCM
      const encryptedSecret = encryptMfaSecret(secret);
      const { hashBackupCode } = await import("./mfa-engine.ts");
      const hashedBackupCodes = backupCodes.map((c: string) => hashBackupCode(c));

      await db.updateUserMfa(userPayload.sub, {
        enabled: true,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
      });

      // Increment token version to ensure active session claims are refreshed
      await db.incrementUserTokenVersion(userPayload.sub);

      await db.logSystemAuditEvent({
        organizationId: userPayload.organizationId,
        actorId: userPayload.sub,
        actorIp: clientIp,
        action: "auth.mfa.enrolled",
        resourceType: "user",
        resourceId: userPayload.sub,
      });

      return res.status(200).json({
        message: "Multi-factor authentication successfully configured and enabled.",
        mfaEnabled: true,
      });
    }

    // ------------------------------------------------------------------------
    // MFA DISABLE (Requires current password + TOTP confirmation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-disable") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { currentPassword, code } = req.body || {};

      if (!currentPassword || !code) {
        return res.status(400).json({ error: "Current password and authenticator code are required to disable MFA" });
      }

      const user = await db.findUserById(userPayload.sub);
      if (!user || !user.mfa_enabled || !user.mfa_secret) {
        return res.status(400).json({ error: "MFA is not currently enabled" });
      }

      const passwordValid = await verifyPassword(currentPassword, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({ error: "Incorrect current password" });
      }

      const plainSecret = decryptMfaSecret(user.mfa_secret);
      const codeValid = verifyTotpCode(plainSecret, String(code));
      if (!codeValid) {
        return res.status(401).json({ error: "Invalid authenticator code" });
      }

      await db.updateUserMfa(user.id, { enabled: false });
      await db.incrementUserTokenVersion(user.id);

      await db.logSystemAuditEvent({
        organizationId: userPayload.organizationId,
        actorId: user.id,
        actorIp: clientIp,
        action: "auth.mfa.disabled",
        resourceType: "user",
        resourceId: user.id,
      });

      return res.status(200).json({ message: "Multi-factor authentication has been disabled." });
    }

    // ------------------------------------------------------------------------
    // FORGOT PASSWORD (Anti-Enumeration Token Request)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "forgot-password") {
      const rateCheck = forgotPasswordLimiter.acquire(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfter));
        return res.status(429).json({ error: "Too many password reset requests. Please try again later." });
      }

      const { email } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email address is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.findUserByEmail(normalizedEmail);

      let devResetToken: string | undefined;

      if (user && user.is_active) {
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + TOKEN_LIFETIMES.PASSWORD_RESET_MS);

        await db.savePasswordResetToken(user.id, tokenHash, expiresAt);

        // In non-production environments, provide token in response for automated testing
        if (process.env.NODE_ENV !== "production") {
          devResetToken = rawToken;
        }

        const memberships = await db.getUserMemberships(user.id);
        if (memberships[0]?.organization_id) {
          await db.logSystemAuditEvent({
            organizationId: memberships[0].organization_id,
            actorId: user.id,
            actorIp: clientIp,
            action: "auth.password.reset_requested",
            resourceType: "user",
            resourceId: user.id,
          });
        }
      }

      // Uniform response preventing user enumeration
      return res.status(200).json({
        message: "If your email address is registered with PascoAI, a password reset link has been dispatched.",
        ...(devResetToken ? { resetToken: devResetToken } : {}),
      });
    }

    // ------------------------------------------------------------------------
    // RESET PASSWORD (Token verification, complexity check, session revocation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "reset-password") {
      const { token, newPassword } = req.body || {};
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Reset token and new password are required" });
      }

      const passwordCheck = validatePasswordPolicy(newPassword);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.error });
      }

      const tokenHash = createHash("sha256").update(String(token)).digest("hex");
      const resetRecord = await db.findPasswordResetToken(tokenHash);

      if (!resetRecord || resetRecord.used_at || new Date(resetRecord.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid, used, or expired password reset token" });
      }

      const user = await db.findUserById(resetRecord.user_id);
      if (!user) {
        return res.status(404).json({ error: "User associated with token not found" });
      }

      // Mark token as consumed
      await db.markPasswordResetTokenUsed(resetRecord.id);

      // Re-hash with Argon2id and update password
      const newHash = await hashPassword(newPassword);
      await db.updateUserPassword(user.id, newHash);

      // GLOBAL KILL-SWITCH: Invalidate all existing refresh tokens & bump token version
      await db.revokeAllUserRefreshTokens(user.id, "PASSWORD_RESET");
      await db.incrementUserTokenVersion(user.id);

      res.setHeader("Set-Cookie", formatClearRefreshCookie());

      const memberships = await db.getUserMemberships(user.id);
      if (memberships[0]?.organization_id) {
        await db.logSystemAuditEvent({
          organizationId: memberships[0].organization_id,
          actorId: user.id,
          actorIp: clientIp,
          action: "auth.password.reset_completed",
          resourceType: "user",
          resourceId: user.id,
        });
      }

      return res.status(200).json({
        message: "Password has been successfully reset. Please log in with your new credentials.",
      });
    }

    // ------------------------------------------------------------------------
    // VERIFY EMAIL
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "verify-email") {
      const { token } = req.body || {};
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const tokenHash = createHash("sha256").update(String(token)).digest("hex");
      const record = await db.findEmailVerificationToken(tokenHash);

      if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired email verification token" });
      }

      await db.markEmailVerificationTokenUsed(record.id);
      await db.setUserEmailVerified(record.user_id, true);

      return res.status(200).json({ message: "Email address successfully verified." });
    }

    // ------------------------------------------------------------------------
    // REFRESH TOKEN (With Strict Reuse Detection)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "refresh") {
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
        tokenVersion: rotated.user.token_version || 1,
      });

      res.setHeader("Set-Cookie", formatRefreshCookie(rotated.newRawToken));
      return res.status(200).json({
        accessToken,
        user: {
          id: rotated.user.id,
          email: rotated.user.email,
          displayName: rotated.user.display_name,
          emailVerified: rotated.user.email_verified,
          mfaEnabled: rotated.user.mfa_enabled,
        },
        tenant: {
          organizationId: activeMembership.organization_id,
          workspaceId: activeMembership.workspace_id,
          role: activeMembership.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // LOGOUT (Revokes Current Token Family)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "logout") {
      let rawRefreshToken = req.body?.refreshToken;
      if (!rawRefreshToken && req.headers?.cookie) {
        const match = req.headers.cookie.match(/pasco_refresh_token=([^;]+)/);
        if (match) rawRefreshToken = match[1];
      }
      if (rawRefreshToken) {
        const [familyId] = rawRefreshToken.split(".");
        if (familyId) await db.revokeTokenFamily(familyId, "LOGOUT");
      }
      res.setHeader("Set-Cookie", formatClearRefreshCookie());
      return res.status(200).json({ message: "Logged out successfully" });
    }

    // ------------------------------------------------------------------------
    // REVOKE ALL SESSIONS (Global Kill Switch)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "revoke-sessions") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);

      // Invalidate all refresh tokens for this user
      await db.revokeAllUserRefreshTokens(userPayload.sub, "USER_GLOBAL_REVOCATION");

      // Increment token version to instantly revoke all active JWT access tokens
      await db.incrementUserTokenVersion(userPayload.sub);

      res.setHeader("Set-Cookie", formatClearRefreshCookie());

      await db.logSystemAuditEvent({
        organizationId: userPayload.organizationId,
        actorId: userPayload.sub,
        actorIp: clientIp,
        action: "auth.sessions.all_revoked",
        resourceType: "user",
        resourceId: userPayload.sub,
      });

      return res.status(200).json({
        message: "All active sessions have been successfully revoked. Please log in again.",
      });
    }

    // ------------------------------------------------------------------------
    // ME / SESSION INFO
    // ------------------------------------------------------------------------
    if (method === "GET" && action === "me") {
      const authHeader = req.headers?.authorization;
      const { context, userPayload } = await authenticateAndAuthorize(db, authHeader);
      const user = await db.findUserById(userPayload.sub);

      return res.status(200).json({
        user: {
          id: userPayload.sub,
          email: userPayload.email,
          displayName: userPayload.displayName,
          emailVerified: user?.email_verified ?? false,
          mfaEnabled: user?.mfa_enabled ?? false,
        },
        tenant: {
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          role: context.role,
        },
      });
    }

    // ------------------------------------------------------------------------
    // CHANGE PASSWORD (Requires old password, Argon2id rehash, session revocation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "change-password") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { oldPassword, newPassword } = req.body || {};

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Both current and new passwords are required" });
      }

      const passwordCheck = validatePasswordPolicy(newPassword);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.error });
      }

      const user = await db.findUserById(userPayload.sub);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await verifyPassword(oldPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "Incorrect current password" });
      }

      const newHash = await hashPassword(newPassword);
      await db.updateUserPassword(user.id, newHash);

      // Invalidate all other sessions by bumping token version and revoking tokens
      await db.revokeAllUserRefreshTokens(user.id, "PASSWORD_CHANGED");
      const newVersion = await db.incrementUserTokenVersion(user.id);

      // Issue fresh access token and refresh token for the current session
      const newAccessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        role: userPayload.role,
        tokenVersion: newVersion,
      });

      const { rawToken: newRefreshToken } = await createRefreshToken(db, user.id);
      res.setHeader("Set-Cookie", formatRefreshCookie(newRefreshToken));

      await db.logSystemAuditEvent({
        organizationId: userPayload.organizationId,
        actorId: user.id,
        actorIp: clientIp,
        action: "auth.password.changed",
        resourceType: "user",
        resourceId: user.id,
      });

      return res.status(200).json({
        message: "Password updated successfully. All other active sessions have been invalidated.",
        accessToken: newAccessToken,
      });
    }

    // ------------------------------------------------------------------------
    // UPDATE PROFILE
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "update-profile") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { displayName } = req.body || {};

      if (!displayName || !displayName.trim()) {
        return res.status(400).json({ error: "Display name cannot be empty" });
      }

      await db.updateUserDisplayName(userPayload.sub, displayName.trim());
      return res.status(200).json({ message: "Profile updated successfully", displayName: displayName.trim() });
    }

    // ------------------------------------------------------------------------
    // DELETE ACCOUNT
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "delete-account") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      await db.deleteUser(userPayload.sub);
      res.setHeader("Set-Cookie", formatClearRefreshCookie());
      return res.status(200).json({ message: "Account deleted successfully" });
    }

    return res.status(400).json({ error: `Unsupported auth action: ${action}` });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Authentication error" });
  }
}
