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

// Ephemeral fallback key generated once per dev process lifecycle (never reused across restarts)
let ephemeralDevJwtSecret: string | null = null;

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

  // For testing or dev where secret is omitted, provide an ephemeral 32-byte cryptographically random secret
  if (!ephemeralDevJwtSecret) {
    ephemeralDevJwtSecret = `dev_ephemeral_${randomBytes(32).toString("hex")}`;
  }
  return ephemeralDevJwtSecret;
}

/**
 * Derives or retrieves a 32-byte symmetric key for AES-256-GCM encryption of MFA secrets at rest
 */
export function getMfaEncryptionKey(): Buffer {
  const rawKey = (process.env.AUTH_MFA_KEY || "").trim();
  if (rawKey && rawKey.length >= 32) {
    return Buffer.from(createHash("sha256").update(rawKey).digest());
  }

  // Derive key deterministically from the validated JWT secret
  const jwtSecret = getJwtSecret();
  return createHash("sha256").update(`mfa-key-derivation:${jwtSecret}`).digest();
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
  ];

  for (const pattern of trivialPatterns) {
    if (lowercase.includes(pattern)) {
      return { valid: false, error: "Password contains an easily guessable dictionary pattern" };
    }
  }

  return { valid: true };
}
