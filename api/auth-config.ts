/**
 * PASCOAI ENTERPRISE AUTHENTICATION & SECURITY CONFIGURATION (STAGE 8.2)
 * 
 * Centralized, fail-closed security configuration.
 * 
 * PRODUCTION FAIL-CLOSED GUARANTEES:
 * - In production (NODE_ENV === 'production'), a missing, empty, short, or known-insecure
 *   AUTH_JWT_SECRET will immediately throw a FATAL_AUTH_CONFIG_ERROR and halt startup.
 * - Secret strength must meet or exceed 256 bits (>= 32 characters).
 */

import { randomBytes, createHash } from "node:crypto";

export const BANNED_JWT_SECRETS = new Set([
  "pascoai_enterprise_super_secret_jwt_hmac_key_2026",
  "secret",
  "supersecret",
  "jwt_secret",
  "auth_secret",
  "changeme",
  "default",
  "123456",
  "12345678",
  "password",
  "test",
  "development",
  "your-secret-key",
  "admin",
]);

// Ephemeral fallback keys generated once per dev process lifecycle (never reused across restarts)
let ephemeralDevJwtSecret: string | null = null;
let ephemeralDevMfaSecret: string | null = null;

export function getJwtSecret(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const rawSecret = (process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || "").trim();

  if (isProduction) {
    if (!rawSecret) {
      throw new Error(
        "FATAL_AUTH_CONFIG_ERROR: AUTH_JWT_SECRET environment variable is mandatory in production. System cannot start with missing secrets."
      );
    }

    if (BANNED_JWT_SECRETS.has(rawSecret.toLowerCase())) {
      throw new Error(
        "FATAL_AUTH_CONFIG_ERROR: AUTH_JWT_SECRET is set to an unsafe known/default value in production. Production must fail closed."
      );
    }

    if (rawSecret.length < 32) {
      throw new Error(
        `FATAL_AUTH_CONFIG_ERROR: AUTH_JWT_SECRET is insufficiently strong (${rawSecret.length} characters). Minimum requirement is 32 characters (256 bits of entropy).`
      );
    }

    return rawSecret;
  }

  // Non-production (development / test)
  if (rawSecret && !BANNED_JWT_SECRETS.has(rawSecret.toLowerCase()) && rawSecret.length >= 32) {
    return rawSecret;
  }

  // Ensure development fallback cannot ever be returned in production
  if (isProduction) {
    throw new Error("FATAL_AUTH_CONFIG_ERROR: Unreachable production fallback triggered.");
  }

  // For testing or dev where secret is omitted, provide an ephemeral 32-byte cryptographically random secret
  if (!ephemeralDevJwtSecret) {
    ephemeralDevJwtSecret = `dev_ephemeral_${randomBytes(32).toString("hex")}`;
  }
  return ephemeralDevJwtSecret;
}

/**
 * Returns all valid JWT verification secrets, including primary and rotation keys
 */
export function getJwtVerificationSecrets(): string[] {
  const primary = getJwtSecret();
  const rawRotation = (
    process.env.AUTH_JWT_ROTATION_SECRETS ||
    process.env.AUTH_JWT_SECRET_PREVIOUS ||
    process.env.JWT_ROTATION_SECRETS ||
    ""
  ).trim();

  if (!rawRotation) {
    return [primary];
  }

  const isProduction = process.env.NODE_ENV === "production";
  const secrets = [primary];

  for (const item of rawRotation.split(",")) {
    const s = item.trim();
    if (!s) continue;

    if (isProduction) {
      if (BANNED_JWT_SECRETS.has(s.toLowerCase())) {
        throw new Error(
          "FATAL_AUTH_CONFIG_ERROR: A rotation secret in AUTH_JWT_ROTATION_SECRETS is an unsafe known/default value."
        );
      }
      if (s.length < 32) {
        throw new Error(
          `FATAL_AUTH_CONFIG_ERROR: A rotation secret in AUTH_JWT_ROTATION_SECRETS is insufficiently strong (${s.length} characters).`
        );
      }
    }

    if (!secrets.includes(s)) {
      secrets.push(s);
    }
  }

  return secrets;
}

/**
 * Derives or retrieves a 32-byte symmetric key for AES-256-GCM encryption of MFA secrets at rest.
 * 
 * STRICT KEY SEPARATION:
 * - MFA encryption material is completely isolated from JWT signing material.
 * - Rotating AUTH_JWT_SECRET does NOT alter the primary MFA encryption key.
 * - In production, MFA_ENCRYPTION_KEY (or AUTH_MFA_KEY) is strictly mandatory and must fail closed.
 */
export function getMfaEncryptionKey(): Buffer {
  const isProduction = process.env.NODE_ENV === "production";
  const rawKey = (
    process.env.MFA_ENCRYPTION_KEY ||
    process.env.AUTH_MFA_KEY ||
    ""
  ).trim();

  if (isProduction) {
    if (!rawKey) {
      throw new Error(
        "FATAL_MFA_CONFIG_ERROR: MFA_ENCRYPTION_KEY environment variable is mandatory in production. MFA secrets cannot be encrypted with missing or derived keys."
      );
    }

    if (BANNED_JWT_SECRETS.has(rawKey.toLowerCase())) {
      throw new Error(
        "FATAL_MFA_CONFIG_ERROR: MFA_ENCRYPTION_KEY is set to an unsafe known/default value in production. Production must fail closed."
      );
    }

    if (rawKey.length < 32) {
      throw new Error(
        `FATAL_MFA_CONFIG_ERROR: MFA_ENCRYPTION_KEY is insufficiently strong (${rawKey.length} characters). Minimum requirement is 32 characters (256 bits of entropy).`
      );
    }

    return Buffer.from(createHash("sha256").update(rawKey).digest());
  }

  // Non-production: if explicit key provided and strong
  if (rawKey && !BANNED_JWT_SECRETS.has(rawKey.toLowerCase()) && rawKey.length >= 32) {
    return Buffer.from(createHash("sha256").update(rawKey).digest());
  }

  // Ensure development fallback cannot ever be returned in production
  if (isProduction) {
    throw new Error("FATAL_MFA_CONFIG_ERROR: Unreachable production fallback triggered.");
  }

  // In non-production, generate an independent ephemeral key (independent of JWT secret)
  if (!ephemeralDevMfaSecret) {
    ephemeralDevMfaSecret = `dev_mfa_ephemeral_${randomBytes(32).toString("hex")}`;
  }
  return Buffer.from(createHash("sha256").update(ephemeralDevMfaSecret).digest());
}

/**
 * Returns candidate keys for MFA decryption, supporting seamless rotation
 * and legacy transition without service interruption.
 */
export function getMfaDecryptionKeys(): Buffer[] {
  const primaryKey = getMfaEncryptionKey();
  const keys: Buffer[] = [primaryKey];

  const rawRotation = (
    process.env.MFA_ROTATION_KEYS ||
    process.env.AUTH_MFA_ROTATION_KEYS ||
    process.env.MFA_ENCRYPTION_KEY_PREVIOUS ||
    ""
  ).trim();

  if (rawRotation) {
    const isProduction = process.env.NODE_ENV === "production";
    for (const item of rawRotation.split(",")) {
      const k = item.trim();
      if (!k) continue;
      if (isProduction && k.length < 32) continue;
      const buf = Buffer.from(createHash("sha256").update(k).digest());
      if (!keys.some(existing => existing.equals(buf))) {
        keys.push(buf);
      }
    }
  }

  // Legacy transition support: Only in non-production or if explicitly permitted via ALLOW_LEGACY_MFA_KEY
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction || process.env.ALLOW_LEGACY_MFA_KEY === "true") {
    try {
      const jwtSecret = getJwtSecret();
      const legacyDerived = createHash("sha256").update(`mfa-key-derivation:${jwtSecret}`).digest();
      if (!keys.some(existing => existing.equals(legacyDerived))) {
        keys.push(legacyDerived);
      }
    } catch {
      // Ignore if JWT secret cannot be retrieved
    }
  }

  return keys;
}

/**
 * Validates mandatory production security configuration at startup.
 * Fails closed immediately if any security parameter is missing, insecure, or violates key separation.
 */
export function validateProductionSecurityConfig(): void {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) return;

  const rawJwt = (process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || "").trim();
  const rawMfa = (process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_MFA_KEY || "").trim();
  const rawDbUrl = (process.env.DATABASE_URL || "").trim();

  // Validate JWT Secret
  getJwtSecret();

  // Validate MFA Encryption Key
  getMfaEncryptionKey();

  // Cryptographic Key Separation
  if (rawJwt.toLowerCase() === rawMfa.toLowerCase()) {
    throw new Error(
      "FATAL_SECURITY_CONFIG_ERROR: AUTH_JWT_SECRET and MFA_ENCRYPTION_KEY must not be identical. Key separation is strictly required between token signing and data encryption."
    );
  }

  // Database URL in production
  if (!rawDbUrl) {
    throw new Error(
      "FATAL_DATABASE_CONFIG_ERROR: DATABASE_URL environment variable is mandatory in production. In-memory database fallback is strictly prohibited."
    );
  }
}

/**
 * Token Expiration Constants
 */
export const TOKEN_LIFETIMES = {
  ACCESS_TOKEN_MS: 15 * 60 * 1000, // 15 minutes
  ACCESS_TOKEN_SEC: 15 * 60,
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  MFA_CHALLENGE_MS: 5 * 60 * 1000, // 5 minutes
  MFA_CHALLENGE_SEC: 5 * 60,
  PASSWORD_RESET_MS: 15 * 60 * 1000, // 15 minutes
  EMAIL_VERIFICATION_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * JWT Token Claims Standards
 */
export const JWT_CONFIG = {
  ISSUER: "pascoai-defense-os",
  AUDIENCE: "pascoai-api",
  ALGORITHM: "HS256" as const,
  CLOCK_SKEW_SEC: 60, // Maximum allowable clock drift: 60 seconds
} as const;

/**
 * Strict Password Policy Validation
 * 
 * Rules:
 * - Minimum length: 12 characters
 * - Maximum length: 128 characters (DoS mitigation against slow hashing)
 * - Zero null bytes allowed
 * - At least 3 character classes: lowercase, uppercase, digits, symbols
 * - Reject trivial common sequences
 */
export function validatePasswordPolicy(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== "string") {
    return { valid: false, error: "Password must be a string" };
  }

  if (password.includes("\0")) {
    return { valid: false, error: "Password contains illegal null bytes" };
  }

  if (password.length < 12) {
    return { valid: false, error: "Password must be at least 12 characters in length" };
  }

  if (password.length > 128) {
    return { valid: false, error: "Password exceeds maximum allowable length of 128 characters" };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const classesCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (classesCount < 3) {
    return {
      valid: false,
      error: "Password must include at least 3 of the following: uppercase letters, lowercase letters, numbers, and special characters",
    };
  }

  const lowercase = password.toLowerCase();
  const trivialPatterns = [
    "password",
    "admin12345",
    "1234567890",
    "qwertyuiop",
    "pascoai1234",
    "welcome1234",
    "letmein123",
    "changeme123",
    "iloveyou123",
    "supersecret",
  ];

  for (const pattern of trivialPatterns) {
    if (lowercase.includes(pattern)) {
      return { valid: false, error: "Password contains an easily guessable dictionary pattern" };
    }
  }

  return { valid: true };
}
