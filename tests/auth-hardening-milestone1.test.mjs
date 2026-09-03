import assert from "node:assert/strict";
import { test } from "node:test";
import { EnterpriseDbClient, inMemoryDb, closePool } from "../api/db-engine.ts";
import {
  getJwtSecret,
  validatePasswordPolicy,
} from "../api/auth-config.ts";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  createRefreshToken,
  rotateRefreshToken,
} from "../api/auth-engine.ts";
import {
  generateMfaSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpauthUri,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  encryptMfaSecret,
  decryptMfaSecret,
  hashBackupCode,
} from "../api/mfa-engine.ts";
import { authenticateAndAuthorize } from "../api/rbac.ts";
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

test("PASCOAI PHASE 1 / MILESTONE 1 — ADVANCED AUTHENTICATION & SESSION HARDENING SUITE", async (t) => {
  inMemoryDb.clear();
  const db = new EnterpriseDbClient();

  // --------------------------------------------------------------------------
  // 1. Centralized Secret Management & Production Fail-Closed
  // --------------------------------------------------------------------------
  await t.test("1. Centralized Secret: Fail-closed validation", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.AUTH_JWT_SECRET;

    try {
      // In production, secret must be provided and >= 32 chars
      process.env.NODE_ENV = "production";
      delete process.env.AUTH_JWT_SECRET;
      assert.throws(() => getJwtSecret(), /FATAL_AUTH_CONFIG_ERROR/);

      // Short secret rejected
      process.env.AUTH_JWT_SECRET = "too_short";
      assert.throws(() => getJwtSecret(), /Minimum requirement is 32 characters/);

      // Banned/placeholder secrets rejected
      process.env.AUTH_JWT_SECRET = "pascoai_enterprise_super_secret_jwt_hmac_key_2026";
      assert.throws(() => getJwtSecret(), /unsafe known\/default value/);

      // Valid production secret accepted
      process.env.AUTH_JWT_SECRET = "a_super_strong_cryptographic_secret_key_32_bytes_long!";
      assert.equal(getJwtSecret(), "a_super_strong_cryptographic_secret_key_32_bytes_long!");
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret) process.env.AUTH_JWT_SECRET = originalSecret;
      else delete process.env.AUTH_JWT_SECRET;
    }
  });

  // --------------------------------------------------------------------------
  // 2. Password Policy Enforcement
  // --------------------------------------------------------------------------
  await t.test("2. Strict Enterprise Password Policy", () => {
    assert.equal(validatePasswordPolicy("short").valid, false);
    assert.equal(validatePasswordPolicy("nouppercase123").valid, false); // only lower + digits = 2 classes
    assert.equal(validatePasswordPolicy("NOLOWERCASE123").valid, false); // only upper + digits = 2 classes
    assert.equal(validatePasswordPolicy("NoSpecialOrDigits").valid, false); // only upper + lower = 2 classes
    assert.equal(validatePasswordPolicy("Password12345!").valid, false); // Banned common dictionary sequence
    
    // Valid password (4 classes, >= 12 chars, not common)
    const valid = validatePasswordPolicy("EnterpriseGradePass_2026!#$");
    assert.equal(valid.valid, true);
    assert.equal(valid.error, undefined);
  });

  // --------------------------------------------------------------------------
  // 3. RFC 6238 TOTP Engine & AES-256-GCM Encryption At Rest
  // --------------------------------------------------------------------------
  await t.test("3. RFC 6238 TOTP generation, clock drift window, and AES-256-GCM encryption", () => {
    const secret = generateMfaSecret();
    assert.ok(secret.length >= 32, "Base32 secret generated with sufficient entropy");

    const code = generateTotpCode(secret);
    assert.match(code, /^\d{6}$/, "TOTP code is 6 digits");

    // Verification
    assert.equal(verifyTotpCode(secret, code), true, "Current code verified");
    assert.equal(verifyTotpCode(secret, "000000"), false, "Invalid code rejected");

    // Otpauth URI
    const uri = generateOtpauthUri("analyst@pasco.ai", secret);
    assert.ok(uri.startsWith("otpauth://totp/PASCOAI:analyst%40pasco.ai?secret="));
    assert.ok(uri.includes("issuer=PASCOAI"));

    // AES-256-GCM Envelope Encryption
    const encrypted = encryptMfaSecret(secret);
    assert.notEqual(encrypted, secret, "Secret is encrypted at rest");
    assert.ok(encrypted.includes("."), "Encrypted format contains IV and Auth Tag");

    const decrypted = decryptMfaSecret(encrypted);
    assert.equal(decrypted, secret, "Decrypted secret matches original plaintext");
  });

  // --------------------------------------------------------------------------
  // 4. Single-Use Hashed Backup Codes Management
  // --------------------------------------------------------------------------
  await t.test("4. Single-use backup code generation, hashing, and consumption", () => {
    const { plaintextCodes, hashedCodes } = generateBackupCodes(10);
    assert.equal(plaintextCodes.length, 10);
    assert.equal(hashedCodes.length, 10);

    for (const code of plaintextCodes) {
      assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }

    const testCode = plaintextCodes[0];
    const invalidCode = "XXXX-YYYY";

    // Rejects invalid code
    const invalidCheck = verifyAndConsumeBackupCode(invalidCode, hashedCodes);
    assert.equal(invalidCheck.valid, false);

    // Consumes valid code
    const validCheck = verifyAndConsumeBackupCode(testCode, hashedCodes);
    assert.equal(validCheck.valid, true);
    assert.equal(validCheck.remainingHashedCodes.length, 9, "Consumed code removed from remaining list");

    // Replay attack: Using the exact same code again must fail!
    const replayCheck = verifyAndConsumeBackupCode(testCode, validCheck.remainingHashedCodes);
    assert.equal(replayCheck.valid, false, "Replay of consumed backup code rejected");
  });

  // --------------------------------------------------------------------------
  // 5. End-to-End Registration, Login, and Anti-Enumeration
  // --------------------------------------------------------------------------
  const runId = Date.now().toString(36);
  const testEmail = `secops-${runId}@defense.corp`;
  const testPassword = "SuperStrongPhra$e_2026!#$";
  let userToken = "";
  let userId = "";

  await t.test("5. Registration and Anti-Enumeration", async () => {
    // 5.1 Register user with strict password
    const resReg = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "register" },
        body: {
          email: testEmail,
          password: testPassword,
          displayName: "SecOps Lead",
          organizationName: "Cyber Defense Perimeter",
        },
      },
      resReg.value
    );
    assert.equal(resReg.state.statusCode, 201);
    const bodyReg = JSON.parse(resReg.state.body);
    assert.ok(bodyReg.accessToken);
    userToken = bodyReg.accessToken;
    userId = bodyReg.user.id;

    // 5.2 Anti-enumeration on nonexistent user
    const resFake = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: {
          email: "nonexistent-ghost-user@fake.internal",
          password: "RandomPassword123!#$",
        },
      },
      resFake.value
    );
    assert.equal(resFake.state.statusCode, 401);
    assert.equal(JSON.parse(resFake.state.body).error, "Invalid credentials");

    // 5.3 Normal login succeeds
    const resLogin = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: {
          email: testEmail,
          password: testPassword,
        },
      },
      resLogin.value
    );
    assert.equal(resLogin.state.statusCode, 200);
    const bodyLogin = JSON.parse(resLogin.state.body);
    assert.ok(bodyLogin.accessToken);
    assert.equal(bodyLogin.user.email, testEmail);
  });

  // --------------------------------------------------------------------------
  // 6. Complete MFA Enrollment, Challenge & Verification Flow
  // --------------------------------------------------------------------------
  let mfaPlainSecret = "";
  let mfaBackupCodes = [];

  await t.test("6. MFA Enrollment and Login Challenge", async () => {
    // 6.1 Initiate MFA Setup
    const resSetup = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-setup" },
        headers: { authorization: `Bearer ${userToken}` },
      },
      resSetup.value
    );
    assert.equal(resSetup.state.statusCode, 200);
    const bodySetup = JSON.parse(resSetup.state.body);
    assert.ok(bodySetup.secret);
    assert.ok(bodySetup.otpauthUri);
    assert.equal(bodySetup.backupCodes.length, 10);
    mfaPlainSecret = bodySetup.secret;
    mfaBackupCodes = bodySetup.backupCodes;

    // 6.2 Confirm MFA with invalid code -> rejected
    const resBadConfirm = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-confirm" },
        headers: { authorization: `Bearer ${userToken}` },
        body: {
          code: "999999",
          secret: mfaPlainSecret,
          backupCodes: mfaBackupCodes,
        },
      },
      resBadConfirm.value
    );
    assert.equal(resBadConfirm.state.statusCode, 400);

    // 6.3 Confirm MFA with valid TOTP code -> succeeds
    const validTotp = generateTotpCode(mfaPlainSecret);
    const resGoodConfirm = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-confirm" },
        headers: { authorization: `Bearer ${userToken}` },
        body: {
          code: validTotp,
          secret: mfaPlainSecret,
          backupCodes: mfaBackupCodes,
        },
      },
      resGoodConfirm.value
    );
    assert.equal(resGoodConfirm.state.statusCode, 200);
    assert.equal(JSON.parse(resGoodConfirm.state.body).mfaEnabled, true);

    // Verify in database that secret is stored encrypted
    const userRec = await db.findUserById(userId);
    assert.equal(userRec.mfa_enabled, true);
    assert.notEqual(userRec.mfa_secret, mfaPlainSecret, "MFA secret in DB is encrypted");

    // 6.4 Login now returns MFA Challenge instead of access token!
    const resMfaLogin = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: {
          email: testEmail,
          password: testPassword,
        },
      },
      resMfaLogin.value
    );
    assert.equal(resMfaLogin.state.statusCode, 200);
    const bodyMfaLogin = JSON.parse(resMfaLogin.state.body);
    assert.equal(bodyMfaLogin.mfaRequired, true);
    assert.ok(bodyMfaLogin.mfaChallengeToken);
    assert.equal(bodyMfaLogin.accessToken, undefined, "No access token issued without MFA");
    const mfaChallengeToken = bodyMfaLogin.mfaChallengeToken;

    // 6.5 Attempt MFA verify with wrong code -> rejected
    const resBadVerify = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-verify" },
        body: {
          mfaChallengeToken,
          code: "000000",
        },
      },
      resBadVerify.value
    );
    assert.equal(resBadVerify.state.statusCode, 401);

    // 6.6 Attempt MFA verify with correct code -> succeeds and issues full tokens
    const freshTotp = generateTotpCode(mfaPlainSecret);
    const resGoodVerify = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-verify" },
        body: {
          mfaChallengeToken,
          code: freshTotp,
        },
      },
      resGoodVerify.value
    );
    assert.equal(resGoodVerify.state.statusCode, 200);
    const bodyGoodVerify = JSON.parse(resGoodVerify.state.body);
    assert.ok(bodyGoodVerify.accessToken);
    assert.equal(bodyGoodVerify.user.email, testEmail);

    // 6.7 Login with single-use backup code
    const resMfaLogin2 = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: testEmail, password: testPassword },
      },
      resMfaLogin2.value
    );
    const challenge2 = JSON.parse(resMfaLogin2.state.body).mfaChallengeToken;

    const backupCodeToUse = mfaBackupCodes[0];
    const resBackupVerify = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-verify" },
        body: {
          mfaChallengeToken: challenge2,
          backupCode: backupCodeToUse,
        },
      },
      resBackupVerify.value
    );
    assert.equal(resBackupVerify.state.statusCode, 200);

    // 6.8 Replay of used backup code must fail
    const resMfaLogin3 = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: testEmail, password: testPassword },
      },
      resMfaLogin3.value
    );
    const challenge3 = JSON.parse(resMfaLogin3.state.body).mfaChallengeToken;

    const resReplayBackup = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-verify" },
        body: {
          mfaChallengeToken: challenge3,
          backupCode: backupCodeToUse,
        },
      },
      resReplayBackup.value
    );
    assert.equal(resReplayBackup.state.statusCode, 401, "Replay of consumed backup code rejected");
  });

  // --------------------------------------------------------------------------
  // 7. Global Session Revocation (Kill Switch)
  // --------------------------------------------------------------------------
  await t.test("7. Global Session Revocation Kill Switch", async () => {
    // 1. Obtain a fresh active access token
    const resLogin = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: testEmail, password: testPassword },
      },
      resLogin.value
    );
    const challenge = JSON.parse(resLogin.state.body).mfaChallengeToken;

    const freshTotp = generateTotpCode(mfaPlainSecret);
    const resVerify = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "mfa-verify" },
        body: { mfaChallengeToken: challenge, code: freshTotp },
      },
      resVerify.value
    );
    const sessionToken = JSON.parse(resVerify.state.body).accessToken;

    // 2. Token works for RBAC
    const authCheckBefore = await authenticateAndAuthorize(db, `Bearer ${sessionToken}`);
    assert.equal(authCheckBefore.userPayload.email, testEmail);

    // 3. User invokes global session revocation
    const resRevoke = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "revoke-sessions" },
        headers: { authorization: `Bearer ${sessionToken}` },
      },
      resRevoke.value
    );
    assert.equal(resRevoke.state.statusCode, 200);

    // 4. PREVIOUS ACCESS TOKEN MUST NOW BE IMMEDIATELY REJECTED
    await assert.rejects(
      async () => {
        await authenticateAndAuthorize(db, `Bearer ${sessionToken}`);
      },
      /Session has been revoked/
    );
  });

  // --------------------------------------------------------------------------
  // 8. Password Reset Flow with Session Invalidation
  // --------------------------------------------------------------------------
  await t.test("8. Password Reset Flow with Session Invalidation", async () => {
    // 1. Request password reset
    const resForgot = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "forgot-password" },
        body: { email: testEmail },
      },
      resForgot.value
    );
    assert.equal(resForgot.state.statusCode, 200);
    const bodyForgot = JSON.parse(resForgot.state.body);
    assert.ok(bodyForgot.resetToken, "Dev/test environment returns resetToken");
    const resetToken = bodyForgot.resetToken;

    // 2. Reset with weak password -> rejected
    const resWeak = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "reset-password" },
        body: { token: resetToken, newPassword: "weak" },
      },
      resWeak.value
    );
    assert.equal(resWeak.state.statusCode, 400);

    // 3. Reset with valid password
    const newPassword = "BrandNewStrongPhra$e_2026!#$";
    const resReset = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "reset-password" },
        body: { token: resetToken, newPassword },
      },
      resReset.value
    );
    assert.equal(resReset.state.statusCode, 200);

    // 4. Token cannot be reused
    const resReuse = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "reset-password" },
        body: { token: resetToken, newPassword },
      },
      resReuse.value
    );
    assert.equal(resReuse.state.statusCode, 400, "Consumed reset token rejected");

    // 5. Old password no longer works
    const resOldLogin = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: testEmail, password: testPassword },
      },
      resOldLogin.value
    );
    assert.equal(resOldLogin.state.statusCode, 401, "Old password rejected");

    // 6. New password works
    const resNewLogin = mockResponse();
    await authHandler(
      {
        method: "POST",
        query: { action: "login" },
        body: { email: testEmail, password: newPassword },
      },
      resNewLogin.value
    );
    assert.equal(resNewLogin.state.statusCode, 200);
    assert.equal(JSON.parse(resNewLogin.state.body).mfaRequired, true);
  });

  await closePool();
});
