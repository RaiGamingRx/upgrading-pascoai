/**
 * PASCOAI ENTERPRISE AUTHENTICATION & SESSION SECURITY API (STAGE 8.2)
 * 
 * Hardened Endpoints:
 * - POST /api/auth?action=register
 * - POST /api/auth?action=login
 * - POST /api/auth?action=mfa-setup
 * - POST /api/auth?action=mfa-confirm
 * - POST /api/auth?action=mfa-verify
 * - POST /api/auth?action=mfa-disable
 * - POST /api/auth?action=forgot-password
 * - POST /api/auth?action=reset-password
 * - POST /api/auth?action=verify-email
 * - POST /api/auth?action=resend-verification
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
  hashBackupCode,
  encryptMfaSecret,
  decryptMfaSecret,
} from "./mfa-engine.ts";
import {
  validatePasswordPolicy,
  validateProductionSecurityConfig,
  TOKEN_LIFETIMES,
} from "./auth-config.ts";

// Fail closed immediately on module cold-start in production if required security configuration is missing or insecure
validateProductionSecurityConfig();
import { authenticateAndAuthorize } from "./rbac.ts";
import { getSafeClientIp } from "./proxy-trust.ts";
import { checkAuthRateLimit, resetAuthRateLimit } from "./rate-limiter.ts";
import { AccountSecurityService } from "./account-security.ts";
import { SecurityAuditService } from "./security-audit.ts";

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmailFormat(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return false;
  if (/[\r\n\t\0]/.test(trimmed)) return false;
  return EMAIL_REGEX.test(trimmed);
}

export default async function authHandler(
  req: IncomingMessage & { body?: any; query?: any },
  res: ServerResponse & { status: (code: number) => any; json: (data: any) => any }
) {
  const method = req.method || "GET";
  const action = req.query?.action || (method === "GET" ? "me" : "login");
  const db = new EnterpriseDbClient();
  const clientIp = getSafeClientIp(req);

  try {
    // ------------------------------------------------------------------------
    // REGISTER (Initial enterprise account + organization bootstrapping)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "register") {
      const rateCheck = await checkAuthRateLimit("register:ip", clientIp, 10, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many registration requests. Please try again later." });
      }

      const { email, password, displayName, organizationName } = req.body || {};
      if (!email || !password || !displayName) {
        return res.status(400).json({ error: "Missing required fields (email, password, displayName)" });
      }

      if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const passwordCheck = validatePasswordPolicy(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.error });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Timing equalization on user enumeration
      const existingUser = await db.findUserByEmail(normalizedEmail);
      if (existingUser) {
        await performDummyPasswordVerification(password);
        return res.status(409).json({ error: "User already exists with this email" });
      }

      const effectiveOrgName = organizationName?.trim() || `${displayName.trim()}'s Security Perimeter`;
      const passwordHash = await hashPassword(password);

      let registration;
      try {
        registration = await db.registerEnterpriseTenant({
          email: normalizedEmail,
          displayName: displayName.trim(),
          passwordHash,
          organizationName: effectiveOrgName,
        });
      } catch (err: any) {
        if (err?.message?.includes("already exists")) {
          await performDummyPasswordVerification(password);
          return res.status(409).json({ error: "User already exists with this email" });
        }
        throw err;
      }

      const { user, organization: org, workspace, member: membership } = registration;

      // Generate initial email verification token
      const rawVerifyToken = randomBytes(32).toString("hex");
      const verifyTokenHash = createHash("sha256").update(rawVerifyToken).digest("hex");
      const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.saveEmailVerificationToken(user.id, verifyTokenHash, verifyExpiresAt);

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.register",
        severity: "info",
        actorIp: clientIp,
        actorId: user.id,
        targetIdentifier: user.email,
        organizationId: org.id,
        workspaceId: workspace.id,
        status: "success",
        metadata: { organization: org.name },
      });

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
        ...(process.env.NODE_ENV !== "production" ? { verificationToken: rawVerifyToken } : {}),
      });
    }

    // ------------------------------------------------------------------------
    // LOGIN (Progressive Backoff, Anti-Spraying, Anti-Enumeration & MFA)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "login") {
      const rateCheck = await checkAuthRateLimit("login:ip", clientIp, 15, 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many login attempts. Please try again later." });
      }

      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      // Progressive delay check (prevents targeted guessing without permanent DoS lockouts)
      const accountDelay = await AccountSecurityService.checkAccountDelay(normalizedEmail, clientIp);
      if (!accountDelay.allowed) {
        res.setHeader("Retry-After", String(accountDelay.retryAfterSec));
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.login.blocked",
          severity: "medium",
          actorIp: clientIp,
          targetIdentifier: normalizedEmail,
          status: "blocked",
          reason: "progressive_delay_active",
          metadata: { retryAfterSec: accountDelay.retryAfterSec },
        });
        return res.status(429).json({
          error: accountDelay.reason || `Temporary progressive delay active. Try again in ${accountDelay.retryAfterSec} seconds.`,
        });
      }

      const user = await db.findUserByEmail(normalizedEmail);

      // Timing side-channel mitigation on user absence or deactivation
      if (!user || user.is_active === false) {
        await performDummyPasswordVerification(password);
        await AccountSecurityService.recordFailure(normalizedEmail, clientIp);
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.login.failure",
          severity: "low",
          actorIp: clientIp,
          targetIdentifier: normalizedEmail,
          status: "failure",
          reason: "invalid_credentials",
        });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        await AccountSecurityService.recordFailure(normalizedEmail, clientIp);
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.login.failure",
          severity: "low",
          actorIp: clientIp,
          targetIdentifier: normalizedEmail,
          actorId: user.id,
          status: "failure",
          reason: "invalid_credentials",
        });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Successful credentials verification
      await AccountSecurityService.recordSuccess(normalizedEmail, clientIp);
      await resetAuthRateLimit("login:ip", clientIp);

      // CHECK MFA ENFORCEMENT
      if (user.mfa_enabled) {
        const mfaChallengeToken = signMfaChallengeToken(user.id, user.email);
        const memberships = await db.getUserMemberships(user.id);
        const orgId = memberships[0]?.organization_id;

        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.mfa.challenge_issued",
          severity: "info",
          actorIp: clientIp,
          actorId: user.id,
          targetIdentifier: user.email,
          organizationId: orgId,
          status: "success",
        });

        return res.status(200).json({
          mfaRequired: true,
          mfaChallengeToken,
          message: "Multi-factor authentication required. Submit verification code.",
        });
      }

      // Session tokens issuance
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

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.login.success",
        severity: "info",
        actorIp: clientIp,
        actorId: user.id,
        targetIdentifier: user.email,
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        status: "success",
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
    // MFA VERIFY (Atomic consumption, replay protection & rate limits)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-verify") {
      const rateCheck = await checkAuthRateLimit("mfa:ip", clientIp, 10, 5 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
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

      // Early rejection of replayed challenge tokens prevents redundant computation or backup code consumption
      const alreadyConsumed = await db.isMfaChallengeConsumed(challenge.jti);
      if (alreadyConsumed) {
        return res.status(401).json({ error: "MFA challenge token has already been used. Please log in again." });
      }

      const priorAttempts = await db.getMfaChallengeFailedAttempts(challenge.jti);
      if (priorAttempts >= 5) {
        return res.status(429).json({ error: "Too many failed MFA attempts for this challenge. Please log in again." });
      }

      const user = await db.findUserById(challenge.sub);
      if (!user || !user.is_active || !user.mfa_enabled || !user.mfa_secret) {
        return res.status(401).json({ error: "Invalid MFA state" });
      }

      const plainSecret = decryptMfaSecret(user.mfa_secret);
      let verified = false;
      let usedBackup = false;
      let candidateBackupHash: string | null = null;

      if (code) {
        verified = verifyTotpCode(plainSecret, String(code));
      }

      if (!verified && backupCode) {
        candidateBackupHash = hashBackupCode(String(backupCode));
        const backupResult = await db.consumeUserBackupCode(user.id, candidateBackupHash);
        if (backupResult.success) {
          verified = true;
          usedBackup = true;
        }
      }

      if (!verified) {
        await db.recordMfaChallengeFailedAttempt(challenge.jti);
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.mfa.verify.failure",
          severity: "medium",
          actorIp: clientIp,
          actorId: user.id,
          targetIdentifier: user.email,
          status: "failure",
          reason: "invalid_code",
        });
        return res.status(401).json({ error: "Invalid verification code or backup code" });
      }

      const challengeConsumed = await db.consumeMfaChallenge(challenge.jti, user.id, new Date(challenge.exp * 1000));
      if (!challengeConsumed) {
        if (usedBackup && candidateBackupHash) {
          await db.restoreUserBackupCode(user.id, candidateBackupHash);
        }
        return res.status(401).json({ error: "MFA challenge token has already been used. Please log in again." });
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

      await SecurityAuditService.recordEvent(db, {
        eventType: usedBackup ? "auth.mfa.backup_code.used" : "auth.mfa.verify.success",
        severity: "info",
        actorIp: clientIp,
        actorId: user.id,
        targetIdentifier: user.email,
        organizationId: activeMembership.organization_id,
        workspaceId: activeMembership.workspace_id,
        status: "success",
        metadata: { method: usedBackup ? "backup_code" : "totp" },
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
    // MFA SETUP (Initiate enrollment)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-setup") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);

      const rateCheck = await checkAuthRateLimit("mfa-setup:user", userPayload.sub, 10, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many MFA setup attempts. Please try again later." });
      }

      const user = await db.findUserById(userPayload.sub);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.mfa_enabled) {
        return res.status(400).json({ error: "Multi-factor authentication is already enabled for this account" });
      }

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

      const rateCheck = await checkAuthRateLimit("mfa-confirm:user", userPayload.sub, 10, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many confirmation attempts. Please try again later." });
      }

      const isValid = verifyTotpCode(secret, String(code));
      if (!isValid) {
        return res.status(400).json({
          error: "Invalid authentication code. Please ensure your device clock is synchronized and try again.",
        });
      }

      const encryptedSecret = encryptMfaSecret(secret);
      const hashedBackupCodes = backupCodes.map((c: string) => hashBackupCode(c));

      await db.updateUserMfa(userPayload.sub, {
        enabled: true,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
      });

      await db.incrementUserTokenVersion(userPayload.sub);

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.mfa.enrolled",
        severity: "info",
        actorIp: clientIp,
        actorId: userPayload.sub,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        status: "success",
      });

      return res.status(200).json({
        message: "Multi-factor authentication successfully configured and enabled.",
        mfaEnabled: true,
      });
    }

    // ------------------------------------------------------------------------
    // MFA DISABLE (Requires password + TOTP confirmation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "mfa-disable") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { currentPassword, code } = req.body || {};

      if (!currentPassword || !code) {
        return res.status(400).json({ error: "Current password and authenticator code are required to disable MFA" });
      }

      const rateCheck = await checkAuthRateLimit("mfa-disable:user", userPayload.sub, 5, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many requests. Please try again later." });
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

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.mfa.disabled",
        severity: "medium",
        actorIp: clientIp,
        actorId: user.id,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        status: "success",
      });

      return res.status(200).json({ message: "Multi-factor authentication has been disabled." });
    }

    // ------------------------------------------------------------------------
    // FORGOT PASSWORD (Anti-Enumeration & Rate Limiting)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "forgot-password") {
      const ipRate = await checkAuthRateLimit("forgot:ip", clientIp, 5, 15 * 60 * 1000);
      if (!ipRate.allowed) {
        res.setHeader("Retry-After", String(ipRate.retryAfterSec));
        return res.status(429).json({ error: "Too many password reset requests. Please try again later." });
      }

      const { email } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email address is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const emailRate = await checkAuthRateLimit("forgot:email", normalizedEmail, 3, 15 * 60 * 1000);
      if (!emailRate.allowed) {
        res.setHeader("Retry-After", String(emailRate.retryAfterSec));
        return res.status(429).json({ error: "Too many reset requests for this account. Please wait before retrying." });
      }

      const user = await db.findUserByEmail(normalizedEmail);
      let devResetToken: string | undefined;

      if (user && user.is_active) {
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + TOKEN_LIFETIMES.PASSWORD_RESET_MS);

        await db.savePasswordResetToken(user.id, tokenHash, expiresAt);

        if (process.env.NODE_ENV !== "production") {
          devResetToken = rawToken;
        }

        const memberships = await db.getUserMemberships(user.id);
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.password.reset_requested",
          severity: "low",
          actorIp: clientIp,
          actorId: user.id,
          targetIdentifier: user.email,
          organizationId: memberships[0]?.organization_id,
          status: "success",
        });
      }

      return res.status(200).json({
        message: "If your email address is registered with PascoAI, a password reset link has been dispatched.",
        ...(devResetToken ? { resetToken: devResetToken } : {}),
      });
    }

    // ------------------------------------------------------------------------
    // RESET PASSWORD (Atomic Consumption, Policy Check & Session Revocation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "reset-password") {
      const rateCheck = await checkAuthRateLimit("reset:ip", clientIp, 10, 15 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many reset attempts. Please try again later." });
      }

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

      // Concurrency-safe atomic consumption
      const marked = await db.markPasswordResetTokenUsed(resetRecord.id);
      if (!marked) {
        return res.status(400).json({ error: "Invalid, used, or expired password reset token" });
      }

      const newHash = await hashPassword(newPassword);
      await db.updateUserPassword(user.id, newHash);

      // Global revocation of all active sessions
      await db.revokeAllUserRefreshTokens(user.id, "PASSWORD_RESET");
      await db.incrementUserTokenVersion(user.id);
      res.setHeader("Set-Cookie", formatClearRefreshCookie());

      const memberships = await db.getUserMemberships(user.id);
      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.password.reset_completed",
        severity: "medium",
        actorIp: clientIp,
        actorId: user.id,
        targetIdentifier: user.email,
        organizationId: memberships[0]?.organization_id,
        status: "success",
      });

      return res.status(200).json({
        message: "Password has been successfully reset. Please log in with your new credentials.",
      });
    }

    // ------------------------------------------------------------------------
    // VERIFY EMAIL (Atomic consumption & activation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "verify-email") {
      const rateCheck = await checkAuthRateLimit("verify-email:ip", clientIp, 10, 15 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many email verification attempts. Please try again later." });
      }

      const { token } = req.body || {};
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const tokenHash = createHash("sha256").update(String(token)).digest("hex");
      const record = await db.findEmailVerificationToken(tokenHash);

      if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired email verification token" });
      }

      const marked = await db.markEmailVerificationTokenUsed(record.id);
      if (!marked) {
        return res.status(400).json({ error: "Invalid or expired email verification token" });
      }

      await db.setUserEmailVerified(record.user_id, true);

      const user = await db.findUserById(record.user_id);
      const memberships = user ? await db.getUserMemberships(user.id) : [];

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.email.verified",
        severity: "info",
        actorIp: clientIp,
        actorId: record.user_id,
        targetIdentifier: user?.email,
        organizationId: memberships[0]?.organization_id,
        status: "success",
      });

      return res.status(200).json({ message: "Email address successfully verified." });
    }

    // ------------------------------------------------------------------------
    // RESEND VERIFICATION EMAIL (Anti-enumeration & rate limiting)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "resend-verification") {
      const ipRate = await checkAuthRateLimit("resend-verify:ip", clientIp, 5, 15 * 60 * 1000);
      if (!ipRate.allowed) {
        res.setHeader("Retry-After", String(ipRate.retryAfterSec));
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }

      const { email } = req.body || {};
      if (!email || !isValidEmailFormat(email)) {
        return res.status(400).json({ error: "Valid email address is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const emailRate = await checkAuthRateLimit("resend-verify:email", normalizedEmail, 3, 15 * 60 * 1000);
      if (!emailRate.allowed) {
        res.setHeader("Retry-After", String(emailRate.retryAfterSec));
        return res.status(429).json({ error: "Too many verification requests for this address. Please wait." });
      }

      const user = await db.findUserByEmail(normalizedEmail);
      let devToken: string | undefined;

      if (user && user.is_active && !user.email_verified) {
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.saveEmailVerificationToken(user.id, tokenHash, expiresAt);

        if (process.env.NODE_ENV !== "production") {
          devToken = rawToken;
        }

        const memberships = await db.getUserMemberships(user.id);
        await SecurityAuditService.recordEvent(db, {
          eventType: "auth.email.verification_requested",
          severity: "low",
          actorIp: clientIp,
          actorId: user.id,
          targetIdentifier: user.email,
          organizationId: memberships[0]?.organization_id,
          status: "success",
        });
      }

      return res.status(200).json({
        message: "If the email is registered and unverified, a verification link has been dispatched.",
        ...(devToken ? { verificationToken: devToken } : {}),
      });
    }

    // ------------------------------------------------------------------------
    // REFRESH TOKEN (Rotation & Automatic Reuse Mitigation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "refresh") {
      const rateCheck = await checkAuthRateLimit("refresh:ip", clientIp, 30, 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many token refresh requests. Please try again later." });
      }

      let rawRefreshToken = req.body?.refreshToken;
      if (!rawRefreshToken && req.headers?.cookie) {
        const match = req.headers.cookie.match(/(?:__Host-)?pasco_refresh_token=([^;]+)/);
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
    // LOGOUT (Revokes Token Family)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "logout") {
      let rawRefreshToken = req.body?.refreshToken;
      if (!rawRefreshToken && req.headers?.cookie) {
        const match = req.headers.cookie.match(/(?:__Host-)?pasco_refresh_token=([^;]+)/);
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

      const rateCheck = await checkAuthRateLimit("revoke-sessions:user", userPayload.sub, 10, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many revocation requests. Please try again later." });
      }

      await db.revokeAllUserRefreshTokens(userPayload.sub, "USER_GLOBAL_REVOCATION");
      await db.incrementUserTokenVersion(userPayload.sub);
      res.setHeader("Set-Cookie", formatClearRefreshCookie());

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.sessions.all_revoked",
        severity: "medium",
        actorIp: clientIp,
        actorId: userPayload.sub,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        status: "success",
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
    // CHANGE PASSWORD (Argon2id rehash & token family revocation)
    // ------------------------------------------------------------------------
    if (method === "POST" && action === "change-password") {
      const authHeader = req.headers?.authorization;
      const { userPayload } = await authenticateAndAuthorize(db, authHeader);
      const { oldPassword, newPassword } = req.body || {};

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Both current and new passwords are required" });
      }

      const rateCheck = await checkAuthRateLimit("change-password:user", userPayload.sub, 10, 10 * 60 * 1000);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        return res.status(429).json({ error: "Too many password change attempts. Please try again later." });
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

      await db.revokeAllUserRefreshTokens(user.id, "PASSWORD_CHANGED");
      const newVersion = await db.incrementUserTokenVersion(user.id);

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

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.password.changed",
        severity: "medium",
        actorIp: clientIp,
        actorId: user.id,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        status: "success",
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

      await SecurityAuditService.recordEvent(db, {
        eventType: "auth.account.deleted",
        severity: "high",
        actorIp: clientIp,
        actorId: userPayload.sub,
        organizationId: userPayload.organizationId,
        workspaceId: userPayload.workspaceId,
        status: "success",
      });

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
