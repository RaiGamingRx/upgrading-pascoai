/**
 * PASCOAI ENTERPRISE AUTHENTICATION & CRYPTOGRAPHIC TOKEN ENGINE (STAGE 8.1)
 * 
 * Features:
 * - Server-side Argon2id password hashing and constant-time verification.
 * - Cryptographically signed short-lived Access Tokens (15 min expiration).
 * - Rotating Refresh Tokens with Token Family IDs and reuse detection.
 * - Secure Cookie serializing.
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { argon2id } from "hash-wasm";
import { EnterpriseDbClient, type UserRecord, type WorkspaceMemberRecord } from "./db-engine.ts";

const JWT_SECRET = process.env.AUTH_JWT_SECRET || "pascoai_enterprise_super_secret_jwt_hmac_key_2026";
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  displayName: string;
  organizationId: string;
  workspaceId: string;
  role: WorkspaceMemberRecord['role'];
  iat: number;
  exp: number;
}

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  tenant: {
    organizationId: string;
    workspaceId: string;
    role: WorkspaceMemberRecord['role'];
  };
}

/**
 * Computes an Argon2id password hash using RFC-recommended parameters
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2id({
    password,
    salt,
    iterations: 2,
    memorySize: 32768, // 32MB
    parallelism: 1,
    hashLength: 32,
    outputType: "encoded",
  });
  return hash;
}

/**
 * Verifies a password against an Argon2id encoded string
 */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    // Encoded format: $argon2id$v=19$m=32768,t=2,p=1$<salt_b64>$<hash_b64>
    const parts = encodedHash.split("$");
    if (parts.length < 6 || parts[1] !== "argon2id") {
      return false;
    }
    
    // Extract parameters
    const params = parts[3].split(",");
    let memorySize = 32768;
    let iterations = 2;
    let parallelism = 1;
    for (const p of params) {
      const [k, v] = p.split("=");
      if (k === "m") memorySize = parseInt(v, 10);
      if (k === "t") iterations = parseInt(v, 10);
      if (k === "p") parallelism = parseInt(v, 10);
    }
    
    const saltB64 = parts[4];
    const salt = Buffer.from(saltB64, "base64");
    
    const computed = await argon2id({
      password,
      salt,
      iterations,
      memorySize,
      parallelism,
      hashLength: 32,
      outputType: "encoded",
    });
    
    return timingSafeEqual(Buffer.from(computed), Buffer.from(encodedHash));
  } catch {
    return false;
  }
}

/**
 * Signs a stateless access token with HMAC-SHA256
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  const now = Date.now();
  const fullPayload: AccessTokenPayload = {
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ACCESS_TOKEN_TTL_MS) / 1000),
  };
  
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
    
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies and decodes an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const [headerB64, bodyB64, signature] = token.split(".");
    if (!headerB64 || !bodyB64 || !signature) return null;
    
    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest("base64url");
      
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    
    const payload: AccessTokenPayload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
      return null; // Expired
    }
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates an opaque, secure refresh token and records it in the token family
 */
export async function createRefreshToken(
  db: EnterpriseDbClient,
  userId: string,
  existingFamilyId?: string
): Promise<{ rawToken: string; familyId: string }> {
  const familyId = existingFamilyId || randomBytes(16).toString("hex");
  const rawSecret = randomBytes(32).toString("hex");
  const rawToken = `${familyId}.${rawSecret}`;
  
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  
  await db.saveRefreshToken(userId, familyId, tokenHash, expiresAt);
  return { rawToken, familyId };
}

/**
 * Rotates a refresh token.
 * CRITICAL SECURITY FEATURE:
 * If an already-revoked refresh token is presented, the ENTIRE token family is invalidated (Reuse Detection).
 */
export async function rotateRefreshToken(
  db: EnterpriseDbClient,
  rawToken: string
): Promise<{ user: UserRecord; newRawToken: string } | null> {
  const [familyId] = rawToken.split(".");
  if (!familyId) return null;
  
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const record = await db.findRefreshTokenByHash(tokenHash);
  
  if (!record) {
    // Unknown token
    return null;
  }
  
  if (record.is_revoked) {
    // BREACH DETECTED: Token reuse attempt. Invalidate the whole family!
    await db.revokeTokenFamily(record.family_id);
    return null;
  }
  
  if (new Date(record.expires_at).getTime() < Date.now()) {
    // Expired
    await db.consumeRefreshToken(record.id);
    return null;
  }
  
  const user = await db.findUserById(record.user_id);
  if (!user || !user.is_active) {
    return null;
  }
  
  // Consume the used token
  await db.consumeRefreshToken(record.id);
  
  // Issue new token in same family
  const { rawToken: newRawToken } = await createRefreshToken(db, user.id, record.family_id);
  return { user, newRawToken };
}

/**
 * Format Set-Cookie header for refresh token
 */
export function formatRefreshCookie(token: string, maxAgeMs = REFRESH_TOKEN_TTL_MS): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  return `pasco_refresh_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${maxAgeSec}`;
}

export function formatClearRefreshCookie(): string {
  return `pasco_refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=0`;
}
