/* src/lib/crypto.ts
   PascoAI Crypto Lab - real client-side encryption / decryption (WebCrypto)
   Token format: PASCO1.<headerB64Url>.<cipherB64Url>
*/

export type PascoHeader = {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string; // b64url
  iv: string; // b64url
  createdAt: string;
  kind: "text" | "file";
  filename?: string;
  mime?: string;
  size?: number;
  note?: string;
};

export type EncryptTextOptions = {
  password: string;
  note?: string;
  iterations?: number;
};

export type EncryptFileOptions = {
  password: string;
  note?: string;
  iterations?: number;
};

export type DecryptResult =
  | { kind: "text"; header: PascoHeader; text: string; fingerprint: string }
  | { kind: "file"; header: PascoHeader; bytes: Uint8Array; fingerprint: string };

function assertWebCrypto() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto is not available in this environment.");
  }
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  assertWebCrypto();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  assertWebCrypto();
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function packHeader(header: PascoHeader): string {
  const json = JSON.stringify(header);
  return toB64Url(utf8Encode(json));
}

function unpackHeader(b64url: string): PascoHeader {
  const json = utf8Decode(fromB64Url(b64url));
  return JSON.parse(json) as PascoHeader;
}

export async function encryptText(
  text: string,
  opts: EncryptTextOptions
): Promise<{ token: string; header: PascoHeader; fingerprint: string }> {
  assertWebCrypto();

  const iterations = Math.max(50_000, Math.min(600_000, opts.iterations ?? 220_000));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(opts.password, salt, iterations);

  const pt = utf8Encode(text);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  const ctBytes = new Uint8Array(ctBuf);

  const header: PascoHeader = {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iter: iterations,
    salt: toB64Url(salt),
    iv: toB64Url(iv),
    createdAt: new Date().toISOString(),
    kind: "text",
    note: opts.note?.trim() || undefined,
  };

  const token = `PASCO1.${packHeader(header)}.${toB64Url(ctBytes)}`;
  const fingerprint = await sha256Hex(ctBytes);

  return { token, header, fingerprint };
}

export async function encryptFile(
  file: File,
  opts: EncryptFileOptions
): Promise<{ token: string; header: PascoHeader; fingerprint: string }> {
  assertWebCrypto();

  const iterations = Math.max(50_000, Math.min(600_000, opts.iterations ?? 260_000));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(opts.password, salt, iterations);

  const ab = await file.arrayBuffer();
  const pt = new Uint8Array(ab);

  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  const ctBytes = new Uint8Array(ctBuf);

  const header: PascoHeader = {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iter: iterations,
    salt: toB64Url(salt),
    iv: toB64Url(iv),
    createdAt: new Date().toISOString(),
    kind: "file",
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    note: opts.note?.trim() || undefined,
  };

  const token = `PASCO1.${packHeader(header)}.${toB64Url(ctBytes)}`;
  const fingerprint = await sha256Hex(ctBytes);

  return { token, header, fingerprint };
}

export async function decryptToken(token: string, password: string): Promise<DecryptResult> {
  assertWebCrypto();

  const trimmed = token.trim();
  if (!trimmed.startsWith("PASCO1.")) throw new Error("Invalid token (missing PASCO1 header).");

  const parts = trimmed.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format.");

  const header = unpackHeader(parts[1]);
  if (header.v !== 1) throw new Error("Unsupported token version.");
  if (header.alg !== "AES-256-GCM") throw new Error("Unsupported algorithm.");
  if (header.kdf !== "PBKDF2-SHA256") throw new Error("Unsupported KDF.");

  const salt = fromB64Url(header.salt);
  const iv = fromB64Url(header.iv);
  const ctBytes = fromB64Url(parts[2]);

  const key = await deriveKey(password, salt, header.iter);

  let ptBuf: ArrayBuffer;
  try {
    ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ctBytes);
  } catch {
    throw new Error("Wrong key or corrupted token.");
  }

  const fingerprint = await sha256Hex(ctBytes);

  if (header.kind === "text") {
    return { kind: "text", header, text: utf8Decode(new Uint8Array(ptBuf)), fingerprint };
  }

  return { kind: "file", header, bytes: new Uint8Array(ptBuf), fingerprint };
}

export async function fingerprintFromToken(token: string): Promise<string> {
  assertWebCrypto();

  const trimmed = token.trim();
  if (!trimmed.startsWith("PASCO1.")) {
    throw new Error("Invalid token format (missing PASCO1 header).");
  }
  const parts = trimmed.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format.");
  const ctBytes = fromB64Url(parts[2]);
  return await sha256Hex(ctBytes);
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime = "application/octet-stream") {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
