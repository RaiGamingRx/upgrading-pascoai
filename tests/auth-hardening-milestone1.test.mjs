import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { EnterpriseDbClient, inMemoryDb, closePool } from "../api/db-engine.ts";
import {
  getJwtSecret,
  getJwtVerificationSecrets,
  getMfaEncryptionKey,
  getMfaDecryptionKeys,
  validatePasswordPolicy,
  JWT_CONFIG,
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
  isEncryptedMfaSecret,
  migrateLegacyPlaintextMfaSecret,
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

  // --------------------------------------------------------------------------
  // 9. Cryptographic Key Separation & Decryption Key Rotation
  // --------------------------------------------------------------------------
  await t.test("9. Cryptographic Key Separation & MFA Key Rotation", () => {
    const origEnv = process.env.NODE_ENV;
    const origJwt = process.env.AUTH_JWT_SECRET;
    const origMfa = process.env.MFA_ENCRYPTION_KEY;
    const origPrevMfa = process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

    try {
      process.env.NODE_ENV = "production";
      process.env.AUTH_JWT_SECRET = "production_jwt_signing_key_strictly_32_bytes!";
      process.env.MFA_ENCRYPTION_KEY = "production_mfa_encryption_key_32_bytes_long!";
      delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

      // 1. Separate keys are used for JWT and MFA
      const jwtKey = getJwtSecret();
      const mfaKey = getMfaEncryptionKey();
      assert.notEqual(jwtKey, mfaKey, "JWT signing key and MFA encryption key must be distinct");

      // 2. Encrypt an MFA secret with Key A
      const rawSecret = "JBSWY3DPEHPK3PXP";
      const encryptedWithKeyA = encryptMfaSecret(rawSecret);
      assert.ok(isEncryptedMfaSecret(encryptedWithKeyA));
      assert.equal(decryptMfaSecret(encryptedWithKeyA), rawSecret);

      // 3. Rotate MFA key to Key B, keeping Key A in previous keys list
      process.env.MFA_ENCRYPTION_KEY_PREVIOUS = process.env.MFA_ENCRYPTION_KEY;
      process.env.MFA_ENCRYPTION_KEY = "new_active_mfa_encryption_key_32_bytes_here!";

      // Existing secret encrypted with Key A must remain seamlessly decryptable
      assert.equal(decryptMfaSecret(encryptedWithKeyA), rawSecret);

      // 4. Encrypt new secret with Key B
      const newRawSecret = "HXDMVJECJJWSRB3H";
      const encryptedWithKeyB = encryptMfaSecret(newRawSecret);
      assert.equal(decryptMfaSecret(encryptedWithKeyB), newRawSecret);

      // 5. Fail closed if wrong keys provided (tampering or unknown key)
      delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
      process.env.MFA_ENCRYPTION_KEY = "completely_unrelated_key_32_bytes_random!";
      assert.throws(() => decryptMfaSecret(encryptedWithKeyA), /MFA_DECRYPTION_ERROR/);

      // 6. Fail closed if legacy plaintext secret is passed without explicit migration
      assert.throws(() => decryptMfaSecret("PLAINTEXT_SECRET_12345"), /MFA_DECRYPTION_ERROR/);

      // 7. Migration helper successfully migrates legacy plaintext secret into authenticated envelope
      const migrated = migrateLegacyPlaintextMfaSecret("PLAINTEXT_SECRET_12345");
      assert.ok(isEncryptedMfaSecret(migrated));
      assert.equal(decryptMfaSecret(migrated), "PLAINTEXT_SECRET_12345");
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origJwt) process.env.AUTH_JWT_SECRET = origJwt; else delete process.env.AUTH_JWT_SECRET;
      if (origMfa) process.env.MFA_ENCRYPTION_KEY = origMfa; else delete process.env.MFA_ENCRYPTION_KEY;
      if (origPrevMfa) process.env.MFA_ENCRYPTION_KEY_PREVIOUS = origPrevMfa; else delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    }
  });

  // --------------------------------------------------------------------------
  // 10. JWT Signing Key Rotation: Zero-Downtime Verification
  // --------------------------------------------------------------------------
  await t.test("10. Safe JWT Signing Key Rotation", () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.AUTH_JWT_SECRET;
    const origPrev = process.env.AUTH_JWT_SECRET_PREVIOUS;

    try {
      process.env.NODE_ENV = "production";
      process.env.AUTH_JWT_SECRET = "initial_production_jwt_signing_key_32_bytes!";
      delete process.env.AUTH_JWT_SECRET_PREVIOUS;

      // Token generated with initial secret
      const tokenInitial = signAccessToken({
        sub: "user-123",
        email: "user@example.com",
        displayName: "User One",
        organizationId: "org-1",
        workspaceId: "ws-1",
        role: "admin",
        tokenVersion: 1,
      });

      assert.ok(verifyAccessToken(tokenInitial));

      // Key rotation occurs: new secret becomes active, old secret moved to previous
      process.env.AUTH_JWT_SECRET_PREVIOUS = process.env.AUTH_JWT_SECRET;
      process.env.AUTH_JWT_SECRET = "rotated_brand_new_production_jwt_key_32_bytes!";

      // Tokens signed with the old secret still verify safely without dropping user sessions
      const verifiedOldToken = verifyAccessToken(tokenInitial);
      assert.ok(verifiedOldToken, "Old token must still verify against rotated keys");
      assert.equal(verifiedOldToken.sub, "user-123");

      // New tokens signed with rotated secret verify safely
      const tokenNew = signAccessToken({
        sub: "user-456",
        email: "user456@example.com",
        displayName: "User Two",
        organizationId: "org-1",
        workspaceId: "ws-1",
        role: "member",
        tokenVersion: 1,
      });
      const verifiedNewToken = verifyAccessToken(tokenNew);
      assert.ok(verifiedNewToken);
      assert.equal(verifiedNewToken.sub, "user-456");

      // Unknown secret token rejected
      const forgedToken = `${tokenInitial.split(".").slice(0, 2).join(".")}.invalid_signature`;
      assert.equal(verifyAccessToken(forgedToken), null);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.AUTH_JWT_SECRET = origSecret; else delete process.env.AUTH_JWT_SECRET;
      if (origPrev) process.env.AUTH_JWT_SECRET_PREVIOUS = origPrev; else delete process.env.AUTH_JWT_SECRET_PREVIOUS;
    }
  });

  // --------------------------------------------------------------------------
  // 11. Concurrency Regression: Simultaneous Refresh Token Rotation Race Condition
  // --------------------------------------------------------------------------
  await t.test("11. Concurrency: Simultaneous Refresh Token Rotation Race", async () => {
    // Create a new active test user
    const raceUser = await db.createUser({
      email: "concurrency_race_user@example.com",
      passwordHash: "dummy_hash",
      displayName: "Race User",
    });

    // Create initial refresh token
    const initialToken = await createRefreshToken(db, raceUser.id);

    // Simulate two simultaneous callers presenting the exact same refresh token at the exact same instant
    const [resultA, resultB] = await Promise.all([
      rotateRefreshToken(db, initialToken.rawToken),
      rotateRefreshToken(db, initialToken.rawToken),
    ]);

    // Exactly one of the callers must succeed, and one must fail (or trigger reuse detection)
    const successCount = (resultA !== null ? 1 : 0) + (resultB !== null ? 1 : 0);
    assert.equal(successCount, 1, "Exactly one concurrent caller must succeed in rotating the token");

    // The successful rotation must produce a valid new token
    const successfulResult = resultA || resultB;
    assert.ok(successfulResult);
    assert.ok(successfulResult.newRawToken);

    // Replay attack: presenting the original rawToken again MUST trigger reuse detection
    const replayResult = await rotateRefreshToken(db, initialToken.rawToken);
    assert.equal(replayResult, null, "Replaying an already-rotated token must fail immediately");

    // Replay detection must have invalidated the entire family!
    // Therefore, rotating the new token issued to the winner must now ALSO fail because family was nuked!
    const subsequentResult = await rotateRefreshToken(db, successfulResult.newRawToken);
    assert.equal(subsequentResult, null, "Compromise detection must have invalidated the entire token family");
  });

  // --------------------------------------------------------------------------
  // 12. Concurrency Regression: Simultaneous Backup Code Consumption
  // --------------------------------------------------------------------------
  await t.test("12. Concurrency: Simultaneous Backup Code Consumption", async () => {
    // Generate a backup code
    const rawBackupCode = "9A8B-7C6D";
    const hashedCode = hashBackupCode(rawBackupCode);

    const backupUser = await db.createUser({
      email: "concurrency_backup_user@example.com",
      passwordHash: "dummy_hash",
      displayName: "Backup User",
      mfaEnabled: true,
      mfaSecret: encryptMfaSecret(generateMfaSecret()),
      mfaBackupCodes: [hashedCode],
    });

    // Two concurrent requests attempt to consume the same backup code simultaneously
    const [consumeA, consumeB] = await Promise.all([
      db.consumeUserBackupCode(backupUser.id, hashedCode),
      db.consumeUserBackupCode(backupUser.id, hashedCode),
    ]);

    const successes = (consumeA.success ? 1 : 0) + (consumeB.success ? 1 : 0);
    assert.equal(successes, 1, "Atomic backup code consumption must allow exactly one consumer to succeed");

    // User's remaining backup codes in database must now be 0
    const updatedUser = await db.findUserById(backupUser.id);
    assert.equal(updatedUser.mfa_backup_codes.length, 0, "Consumed backup code must be permanently removed");

    // Subsequent attempt with the same code must fail
    const thirdAttempt = await db.consumeUserBackupCode(backupUser.id, hashedCode);
    assert.equal(thirdAttempt.success, false, "Subsequent attempt to use consumed code must fail");
  });

  // --------------------------------------------------------------------------
  // 13. MFA Challenge Replay Resistance & Brute-Force Rate Limiting
  // --------------------------------------------------------------------------
  await t.test("13. MFA Challenge Replay Resistance & Rate Limiting", async () => {
    const mfaTestUser = await db.createUser({
      email: "mfa_challenge_user@example.com",
      passwordHash: "dummy_hash",
      displayName: "MFA User",
      mfaEnabled: true,
      mfaSecret: encryptMfaSecret(generateMfaSecret()),
    });

    // Sign challenge token with unique JTI
    const challengeToken = signMfaChallengeToken(mfaTestUser.id, mfaTestUser.email);
    const verifiedPayload = verifyMfaChallengeToken(challengeToken);
    assert.ok(verifiedPayload);
    assert.ok(verifiedPayload.jti, "Challenge payload must contain unique JTI claim");

    // Attempt 1: First consumption succeeds
    const firstConsume = await db.consumeMfaChallenge(
      verifiedPayload.jti,
      mfaTestUser.id,
      new Date(verifiedPayload.exp * 1000)
    );
    assert.equal(firstConsume, true, "First consumption of MFA challenge must succeed");

    // Attempt 2: Replay of the exact same challenge token MUST fail
    const replayConsume = await db.consumeMfaChallenge(
      verifiedPayload.jti,
      mfaTestUser.id,
      new Date(verifiedPayload.exp * 1000)
    );
    assert.equal(replayConsume, false, "Replay of consumed MFA challenge must be rejected");

    // Test challenge brute-force lockout:
    const newChallengeToken = signMfaChallengeToken(mfaTestUser.id, mfaTestUser.email);
    const newPayload = verifyMfaChallengeToken(newChallengeToken);

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await db.recordMfaChallengeFailedAttempt(newPayload.jti);
    }
    const failedCount = await db.getMfaChallengeFailedAttempts(newPayload.jti);
    assert.equal(failedCount, 5, "Failed attempts count must be recorded accurately");
  });

  // --------------------------------------------------------------------------
  // 14. Atomic Single-Use of Password Reset & Email Verification Tokens
  // --------------------------------------------------------------------------
  await t.test("14. Atomic Single-Use of Password Reset & Email Tokens", async () => {
    const singleUseUser = await db.createUser({
      email: "single_use_user@example.com",
      passwordHash: "dummy_hash",
      displayName: "Single Use User",
    });

    // 1. Password Reset Token
    const resetHash = "sample_reset_hash_123456789";
    await db.savePasswordResetToken(singleUseUser.id, resetHash, new Date(Date.now() + 3600000));
    const resetRecord = await db.findPasswordResetToken(resetHash);
    assert.ok(resetRecord);

    // Race two concurrent markPasswordResetTokenUsed calls
    const [resetMarkA, resetMarkB] = await Promise.all([
      db.markPasswordResetTokenUsed(resetRecord.id),
      db.markPasswordResetTokenUsed(resetRecord.id),
    ]);
    assert.equal((resetMarkA ? 1 : 0) + (resetMarkB ? 1 : 0), 1, "Password reset token can only be consumed once");

    // 2. Email Verification Token
    const verifyHash = "sample_verify_hash_123456789";
    await db.saveEmailVerificationToken(singleUseUser.id, verifyHash, new Date(Date.now() + 3600000));
    const verifyRecord = await db.findEmailVerificationToken(verifyHash);
    assert.ok(verifyRecord);

    // Race two concurrent markEmailVerificationTokenUsed calls
    const [verifyMarkA, verifyMarkB] = await Promise.all([
      db.markEmailVerificationTokenUsed(verifyRecord.id),
      db.markEmailVerificationTokenUsed(verifyRecord.id),
    ]);
    assert.equal((verifyMarkA ? 1 : 0) + (verifyMarkB ? 1 : 0), 1, "Email verification token can only be consumed once");
  });

  await closePool();
});
