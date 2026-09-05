/**
 * PASCOAI MULTI-FACTOR AUTHENTICATION (MFA) ENGINE (STAGE 8.2)
 * 
 * Standards Compliant:
 * - RFC 6238 (TOTP: Time-Based One-Time Password Algorithm)
 * - RFC 4226 (HOTP: An HMAC-Based One-Time Password Algorithm)
 * - RFC 4648 (Base32 Alphabet)
 * 
 * Security Guarantees:
 * - TOTP secrets are encrypted at rest using AES-256-GCM
 * - Backup codes are hashed at rest using SHA-256 with single-use consumption
 * - Constant-time comparison on codes to eliminate timing side-channels
 * - Tolerates +/- 1 time-step (30s) clock drift
 */

import { randomBytes, createHmac, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { getMfaEncryptionKey, getMfaDecryptionKeys } from "./auth-config.ts";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer to RFC 4648 Base32 string (no padding)
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string back to Buffer
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically strong 160-bit (20-byte) TOTP secret
 */
export function generateMfaSecret(): string {
  const rawBytes = randomBytes(20);
  return base32Encode(rawBytes);
}

/**
 * Generates an RFC 6238 TOTP code for a given secret at a specific Unix timestamp (in seconds)
 */
export function generateTotpCode(secretBase32: string, timeSeconds = Math.floor(Date.now() / 1000), stepSeconds = 30): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeSeconds / stepSeconds);

  // 8-byte big-endian counter buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Validates a user-supplied TOTP code with +/- 1 step drift tolerance (90s window total)
 */
export function verifyTotpCode(
  secretBase32: string,
  userCode: string,
  timeSeconds = Math.floor(Date.now() / 1000),
  stepSeconds = 30
): boolean {
  if (!userCode || typeof userCode !== "string") return false;
  const normalizedUserCode = userCode.trim().replace(/\s/g, "");
  if (normalizedUserCode.length !== 6 || !/^\d{6}$/.test(normalizedUserCode)) {
    return false;
  }

  const userBuffer = Buffer.from(normalizedUserCode, "utf8");

  // Check windows: current step, step - 1, and step + 1
  const steps = [0, -1, 1];
  for (const offset of steps) {
    const stepTime = timeSeconds + offset * stepSeconds;
    const expected = generateTotpCode(secretBase32, stepTime, stepSeconds);
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (userBuffer.length === expectedBuffer.length && timingSafeEqual(userBuffer, expectedBuffer)) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URI for QR code presentation
 */
export function generateOtpauthUri(email: string, secretBase32: string, issuer = "PASCOAI"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a set of 10 cryptographically random backup recovery codes
 * Format: 8 uppercase characters split by hyphen, e.g. "A1B2-C3D4"
 */
export function generateBackupCodes(count = 10): { plaintextCodes: string[]; hashedCodes: string[] } {
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase(); // 8 uppercase hex characters
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plaintextCodes.push(formatted);
    hashedCodes.push(hashBackupCode(formatted));
  }

  return { plaintextCodes, hashedCodes };
}

/**
 * Hashes a backup recovery code using SHA-256 for persistent database storage
 */
export function hashBackupCode(code: string): string {
  const normalized = code.toLowerCase().replace(/[\s-]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Validates and consumes a single-use backup code
 */
export function verifyAndConsumeBackupCode(
  userSuppliedCode: string,
  storedHashedCodes: string[]
): { valid: boolean; remainingHashedCodes: string[] } {
  if (!userSuppliedCode || !Array.isArray(storedHashedCodes) || storedHashedCodes.length === 0) {
    return { valid: false, remainingHashedCodes: storedHashedCodes || [] };
  }

  const candidateHash = hashBackupCode(userSuppliedCode);
  const candidateBuffer = Buffer.from(candidateHash, "utf8");

  const matchIndex = storedHashedCodes.findIndex((storedHash) => {
    const storedBuffer = Buffer.from(storedHash, "utf8");
    return candidateBuffer.length === storedBuffer.length && timingSafeEqual(candidateBuffer, storedBuffer);
  });

  if (matchIndex === -1) {
    return { valid: false, remainingHashedCodes: storedHashedCodes };
  }

  // Remove the single-use backup code
  const remaining = [...storedHashedCodes];
  remaining.splice(matchIndex, 1);
  return { valid: true, remainingHashedCodes: remaining };
}

/**
 * Encrypts an MFA secret at rest using AES-256-GCM
 */
export function encryptMfaSecret(plaintextSecret: string): string {
  const key = getMfaEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintextSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return formatted payload: iv:tag:ciphertext (base64url encoded)
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Checks if an MFA secret payload conforms to the authenticated AES-256-GCM format: iv.tag.ciphertext
 */
export function isEncryptedMfaSecret(payload: unknown): boolean {
  if (typeof payload !== "string" || !payload) return false;
  const parts = payload.split(".");
  return (
    parts.length === 3 &&
    parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p))
  );
}

/**
 * Safely migrates legacy plaintext Base32 secret into authenticated AES-256-GCM envelope
 */
export function migrateLegacyPlaintextMfaSecret(plaintextSecret: string): string {
  if (isEncryptedMfaSecret(plaintextSecret)) {
    return plaintextSecret;
  }
  return encryptMfaSecret(plaintextSecret);
}

/**
 * Decrypts an MFA secret from storage.
 * 
 * STRICT SECURITY:
 * - Silent plaintext fallback is strictly forbidden and rejected.
 * - Authenticates ciphertext integrity with AES-256-GCM authentication tag.
 * - Supports key rotation by attempting configured decryption candidate keys.
 */
export function decryptMfaSecret(storedPayload: string): string {
  if (!isEncryptedMfaSecret(storedPayload)) {
    throw new Error(
      "MFA_DECRYPTION_ERROR: Stored MFA secret is not in valid authenticated encrypted format. Plaintext or corrupted records are strictly rejected."
    );
  }

  const [ivB64, tagB64, cipherB64] = storedPayload.split(".");
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(cipherB64, "base64url");

  const candidateKeys = getMfaDecryptionKeys();
  let lastError: unknown = null;

  for (const key of candidateKeys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString("utf8");
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `MFA_DECRYPTION_ERROR: Unable to authenticate or decrypt MFA secret with any configured key. Tag verification failed. (${lastError instanceof Error ? lastError.message : "Authentication tag error"})`
  );
}
