import assert from "node:assert/strict";
import { test } from "node:test";
import { EnterpriseDbClient, inMemoryDb } from "../api/db-engine.ts";
import { getSafeClientIp, isIpInCidr } from "../api/proxy-trust.ts";
import { checkAuthRateLimit, resetAuthRateLimit, MemoryRateLimitStore } from "../api/rate-limiter.ts";
import { AccountSecurityService } from "../api/account-security.ts";
import { SecurityAuditService, sanitizeSecurityMetadata } from "../api/security-audit.ts";
import authHandler from "../api/auth.ts";

function mockResponse() {
  const state = { statusCode: 200, body: "", headers: {} };
  return {
    state,
    value: {
      setHeader(name, value) {
        state.headers[name.toLowerCase()] = value;
      },
      status(code) {
        state.statusCode = code;
        return this;
      },
      json(data) {
        state.body = JSON.stringify(data);
        return this;
      },
      send(data) {
        state.body = data;
        return this;
      },
      end(data = "") {
        if (data) state.body = data;
      },
    },
  };
}

test("PASCOAI PHASE 1 / MILESTONE 1 (PART 2) — RATE LIMITING, AUDIT & RESISTANCE SUITE", async (t) => {
  inMemoryDb.clear();
  const db = new EnterpriseDbClient();

  // --------------------------------------------------------------------------
  // 1. Proxy Trust & Safe Client IP Extraction
  // --------------------------------------------------------------------------
  await t.test("1. Proxy Trust: Attacker cannot spoof client IP via unverified headers", () => {
    // Case A: Untrusted remote socket (attacker direct connection).
    // Attacker sends X-Forwarded-For: 8.8.8.8. Socket is 198.51.100.2 (untrusted).
    const attackerReq = {
      socket: { remoteAddress: "198.51.100.2" },
      headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" },
    };
    const ipA = getSafeClientIp(attackerReq, { trustProxy: false, trustedHops: 0, trustedProxies: [] });
    assert.equal(ipA, "198.51.100.2", "Untrusted proxy configuration ignores spoofed headers");

    // Case B: Trusted reverse proxy at 10.0.0.1 forwarding client 203.0.113.195
    const trustedProxyReq = {
      socket: { remoteAddress: "10.0.0.1" },
      headers: { "x-forwarded-for": "203.0.113.195" },
    };
    const ipB = getSafeClientIp(trustedProxyReq, {
      trustProxy: true,
      trustedHops: 1,
      trustedProxies: ["10.0.0.0/8"],
    });
    assert.equal(ipB, "203.0.113.195", "Extracts valid client IP from trusted reverse proxy");

    // Case C: Multi-hop proxy chain with spoofing attempt
    // Real client (198.51.100.5) -> Proxy1 (172.16.0.2) -> Proxy2 (10.0.0.2) -> App
    const multiHopReq = {
      socket: { remoteAddress: "10.0.0.2" },
      headers: { "x-forwarded-for": "attacker.spoof, 198.51.100.5, 172.16.0.2" },
    };
    const ipC = getSafeClientIp(multiHopReq, {
      trustProxy: true,
      trustedHops: 2,
      trustedProxies: ["10.0.0.0/8", "172.16.0.0/12"],
    });
    assert.equal(ipC, "198.51.100.5", "Correctly steps back across trusted proxies to identify true client");

    // Case D: CIDR matching helper
    assert.equal(isIpInCidr("10.5.2.1", "10.0.0.0/8"), true);
    assert.equal(isIpInCidr("192.168.1.50", "192.168.1.0/24"), true);
    assert.equal(isIpInCidr("192.168.2.50", "192.168.1.0/24"), false);
    assert.equal(isIpInCidr("127.0.0.1", "127.0.0.1"), true);
  });

  // --------------------------------------------------------------------------
  // 2. Sliding-Window Rate Limiting Engine
  // --------------------------------------------------------------------------
  await t.test("2. Rate Limiting: Sliding-window enforcement & retry-after calculation", async () => {
    const store = new MemoryRateLimitStore();
    const key = "test-client-1";
    const windowMs = 1000;
    const maxRequests = 3;

    // First 3 requests permitted
    const r1 = await store.consume(key, maxRequests, windowMs);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = await store.consume(key, maxRequests, windowMs);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = await store.consume(key, maxRequests, windowMs);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    // 4th request blocked
    const r4 = await store.consume(key, maxRequests, windowMs);
    assert.equal(r4.allowed, false);
    assert.ok(r4.retryAfterSec >= 1, "Provides positive retryAfterSec");

    // Reset works
    await store.reset(key);
    const r5 = await store.consume(key, maxRequests, windowMs);
    assert.equal(r5.allowed, true);
  });

  // --------------------------------------------------------------------------
  // 3. Brute Force Resistance & Progressive Delay
  // --------------------------------------------------------------------------
  await t.test("3. Brute Force: Progressive delays & spraying mitigation", async () => {
    AccountSecurityService.resetMemoryTracker();
    const email = "target.user@pasco.ai";
    const ip = "198.51.100.99";

    // Initial check: allowed immediately
    const check0 = await AccountSecurityService.checkAccountDelay(email, ip);
    assert.equal(check0.allowed, true);

    // Record 3 failures
    await AccountSecurityService.recordFailure(email, ip);
    await AccountSecurityService.recordFailure(email, ip);
    await AccountSecurityService.recordFailure(email, ip);

    // 4th check: progressive delay applied
    const check1 = await AccountSecurityService.checkAccountDelay(email, ip);
    assert.equal(check1.allowed, false);
    assert.ok(check1.retryAfterSec > 0, "Progressive delay enforced");

    // Success resets failure count
    await AccountSecurityService.recordSuccess(email, ip);
    const checkAfterSuccess = await AccountSecurityService.checkAccountDelay(email, ip);
    assert.equal(checkAfterSuccess.allowed, true, "Success resets progressive delay counter");

    // IP-level spraying detection across multiple accounts
    const sprayIp = "203.0.113.88";
    for (let i = 0; i < 21; i++) {
      await AccountSecurityService.recordFailure(`user${i}@pasco.ai`, sprayIp);
    }
    const sprayCheck = await AccountSecurityService.checkAccountDelay("another.user@pasco.ai", sprayIp);
    assert.equal(sprayCheck.allowed, false);
    assert.ok(sprayCheck.reason?.includes("spraying") || sprayCheck.retryAfterSec > 0);
  });

  // --------------------------------------------------------------------------
  // 4. Zero-Secret Audit Logging & Deep Sanitization
  // --------------------------------------------------------------------------
  await t.test("4. Audit Logging: Secrets, tokens, and passwords are never logged", async () => {
    const dirtyMetadata = {
      email: "alice@pasco.ai",
      password: "SuperSecretPhrase999!",
      password_hash: "$argon2id$v=19$m=65536,t=3,p=4$fakehash",
      jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      accessToken: "eyJhbGciOiJIUzI1Ni...",
      refreshToken: "fam123.secret456",
      mfaSecret: "JBSWY3DPEHPK3PXP",
      backupCodes: ["code1", "code2"],
      nested: {
        rawToken: "token999",
        safeProperty: "audit-value",
      },
    };

    const sanitized = sanitizeSecurityMetadata(dirtyMetadata);
    assert.equal(sanitized.email, "alice@pasco.ai");
    assert.equal(sanitized.password, "[REDACTED_SECRET]");
    assert.equal(sanitized.password_hash, "[REDACTED_SECRET]");
    assert.equal(sanitized.jwt, "[REDACTED_SECRET]");
    assert.equal(sanitized.accessToken, "[REDACTED_SECRET]");
    assert.equal(sanitized.refreshToken, "[REDACTED_SECRET]");
    assert.equal(sanitized.mfaSecret, "[REDACTED_SECRET]");
    assert.equal(sanitized.backupCodes, "[REDACTED_SECRET]");
    assert.equal(sanitized.nested.rawToken, "[REDACTED_SECRET]");
    assert.equal(sanitized.nested.safeProperty, "audit-value");

    // Record event via service
    const auditRecord = await SecurityAuditService.recordEvent(db, {
      eventType: "auth.login.failure",
      severity: "low",
      actorIp: "198.51.100.1",
      targetIdentifier: "alice@pasco.ai",
      status: "failure",
      metadata: dirtyMetadata,
    });
    assert.ok(auditRecord);
    assert.equal(auditRecord.metadata.password, "[REDACTED_SECRET]");
  });

  // --------------------------------------------------------------------------
  // 5. Registration Security & Email Normalization
  // --------------------------------------------------------------------------
  await t.test("5. Registration: Format validation, email normalization & duplicate prevention", async () => {
    // Invalid email format rejected
    const invalidRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "register" },
        body: { email: "not-an-email", password: "Password123!@#", displayName: "Bad Email" },
      },
      invalidRes.value
    );
    assert.equal(invalidRes.state.statusCode, 400);

    // Valid registration
    const validEmail = "  Adversarial.SecOps+Test@Pasco.AI  ";
    const res1 = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "register" },
        body: { email: validEmail, password: "SecureP@ssword2026!", displayName: "Alice SecOps" },
      },
      res1.value
    );
    assert.equal(res1.state.statusCode, 201);
    const body1 = JSON.parse(res1.state.body);
    assert.equal(body1.user.email, "adversarial.secops+test@pasco.ai", "Email normalized to lowercase");
    assert.equal(body1.user.emailVerified, false);
    assert.ok(body1.accessToken);

    // Duplicate registration rejected with 409
    const res2 = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "register" },
        body: { email: "adversarial.secops+test@pasco.ai", password: "SecureP@ssword2026!", displayName: "Alice" },
      },
      res2.value
    );
    assert.equal(res2.state.statusCode, 409);
  });

  // --------------------------------------------------------------------------
  // 6. Anti-Enumeration: Password Reset & Resend Verification
  // --------------------------------------------------------------------------
  await t.test("6. Anti-Enumeration: Uniform response messages prevent account probing", async () => {
    // Non-existent email on forgot-password returns 200 with standard message
    const resForgotGhost = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "forgot-password" },
        body: { email: "nonexistent.ghost.user@pasco.ai" },
      },
      resForgotGhost.value
    );
    assert.equal(resForgotGhost.state.statusCode, 200);
    const forgotGhostBody = JSON.parse(resForgotGhost.state.body);
    assert.ok(forgotGhostBody.message.includes("If your email address is registered"));
    assert.equal(forgotGhostBody.resetToken, undefined, "No token generated for non-existent user");

    // Non-existent email on resend-verification returns 200 with standard message
    const resVerifyGhost = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "resend-verification" },
        body: { email: "nonexistent.ghost.user@pasco.ai" },
      },
      resVerifyGhost.value
    );
    assert.equal(resVerifyGhost.state.statusCode, 200);
    const verifyGhostBody = JSON.parse(resVerifyGhost.state.body);
    assert.ok(verifyGhostBody.message.includes("If the email is registered"));
    assert.equal(verifyGhostBody.verificationToken, undefined);
  });

  // --------------------------------------------------------------------------
  // 7. Password Reset & Verification Token Consumption Security
  // --------------------------------------------------------------------------
  await t.test("7. Token Lifecycle: Single-use atomic consumption & session revocation", async () => {
    const userEmail = "lifecycle.test@pasco.ai";
    const regRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "register" },
        body: { email: userEmail, password: "Init-K9#SecurePhrase", displayName: "Lifecycle Tester" },
      },
      regRes.value
    );
    assert.equal(regRes.state.statusCode, 201);
    const regBody = JSON.parse(regRes.state.body);
    const verifyToken = regBody.verificationToken;
    assert.ok(verifyToken, "Verification token provided in test environment");

    // 1. Verify email with token
    const verifyRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "verify-email" },
        body: { token: verifyToken },
      },
      verifyRes.value
    );
    assert.equal(verifyRes.state.statusCode, 200);

    // 2. Token replay fails
    const replayVerifyRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "verify-email" },
        body: { token: verifyToken },
      },
      replayVerifyRes.value
    );
    assert.equal(replayVerifyRes.state.statusCode, 400);

    // 3. Request password reset
    const forgotRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "forgot-password" },
        body: { email: userEmail },
      },
      forgotRes.value
    );
    assert.equal(forgotRes.state.statusCode, 200);
    const resetToken = JSON.parse(forgotRes.state.body).resetToken;
    assert.ok(resetToken);

    // 4. Perform password reset
    const resetRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "reset-password" },
        body: { token: resetToken, newPassword: "Updated-X7$SecurePhrase" },
      },
      resetRes.value
    );
    assert.equal(resetRes.state.statusCode, 200);

    // 5. Replaying reset token fails
    const replayResetRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "reset-password" },
        body: { token: resetToken, newPassword: "Another-M4%SecurePhrase" },
      },
      replayResetRes.value
    );
    assert.equal(replayResetRes.state.statusCode, 400);

    // 6. Login with new password succeeds; old password fails
    const oldLoginRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: userEmail, password: "Init-K9#SecurePhrase" },
      },
      oldLoginRes.value
    );
    assert.equal(oldLoginRes.state.statusCode, 401);

    const newLoginRes = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: userEmail, password: "Updated-X7$SecurePhrase" },
      },
      newLoginRes.value
    );
    assert.equal(newLoginRes.state.statusCode, 200);
  });
});
