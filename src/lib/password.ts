// src/lib/password.ts
export type CrackEstimates = {
    online: string; // online throttled (e.g. 100 guesses/sec)
    offlineFast: string; // fast GPU (e.g. 10B guesses/sec)
    offlineSlow: string; // slow hash (e.g. 10k guesses/sec)
  };
  
  export type StrengthDetails = {
    score: number; // 0-100
    label: "Very Weak" | "Weak" | "Fair" | "Strong" | "Very Strong";
    tips: string[];
    charsetSize: number;
    entropyBits: number;
    crack: CrackEstimates;
  };
  
  function hasLower(p: string) {
    return /[a-z]/.test(p);
  }
  function hasUpper(p: string) {
    return /[A-Z]/.test(p);
  }
  function hasDigit(p: string) {
    return /\d/.test(p);
  }
  function hasSymbol(p: string) {
    return /[^a-zA-Z0-9]/.test(p);
  }
  
  function getCharsetSize(password: string) {
    let size = 0;
    if (hasLower(password)) size += 26;
    if (hasUpper(password)) size += 26;
    if (hasDigit(password)) size += 10;
    if (hasSymbol(password)) size += 32; // conservative typical printable symbols subset
    return Math.max(size, 1);
  }
  
  function log2(n: number) {
    return Math.log(n) / Math.log(2);
  }
  
  function secondsToHuman(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "Instant";
  
    const minute = 60;
    const hour = 60 * minute;
    const day = 24 * hour;
    const year = 365 * day;
  
    if (seconds < 1) return "Less than a second";
    if (seconds < minute) return `${Math.round(seconds)} seconds`;
    if (seconds < hour) return `${Math.round(seconds / minute)} minutes`;
    if (seconds < day) return `${Math.round(seconds / hour)} hours`;
    if (seconds < year) return `${Math.round(seconds / day)} days`;
    if (seconds < 100 * year) return `${Math.round(seconds / year)} years`;
    if (seconds < 1000000 * year) return "Centuries";
    return "Longer than the universe";
  }
  
  function estimateCrackSeconds(password: string, guessesPerSecond: number): number {
    const L = password.length;
    const charset = getCharsetSize(password);
    // combinations = charset^L (can overflow) -> use log space
    const log10Comb = L * Math.log10(charset);
    // seconds = combinations / gps => log10(seconds) = log10Comb - log10(gps)
    const log10Seconds = log10Comb - Math.log10(Math.max(guessesPerSecond, 1));
  
    // clamp for safety and convert back
    if (log10Seconds > 308) return Number.POSITIVE_INFINITY; // beyond JS number range
    if (log10Seconds < -6) return 0.000001;
  
    return Math.pow(10, log10Seconds);
  }
  
  export function getCrackEstimates(password: string): CrackEstimates {
    // These are “ballpark” numbers (real-world varies by hash + throttling).
    const ONLINE_GPS = 100; // online throttled
    const OFFLINE_FAST_GPS = 10_000_000_000; // 10B/s (fast GPU, weak hash)
    const OFFLINE_SLOW_GPS = 10_000; // 10k/s (slow hash e.g. bcrypt-ish)
  
    return {
      online: secondsToHuman(estimateCrackSeconds(password, ONLINE_GPS)),
      offlineFast: secondsToHuman(estimateCrackSeconds(password, OFFLINE_FAST_GPS)),
      offlineSlow: secondsToHuman(estimateCrackSeconds(password, OFFLINE_SLOW_GPS)),
    };
  }
  
  export function analyzePassword(password: string): StrengthDetails {
    const tips: string[] = [];
    const L = password.length;
    const charsetSize = getCharsetSize(password);
    const entropyBits = L * log2(charsetSize);
  
    if (L < 12) tips.push("Use 12+ characters (length matters most).");
    if (!hasLower(password)) tips.push("Add lowercase letters.");
    if (!hasUpper(password)) tips.push("Add uppercase letters.");
    if (!hasDigit(password)) tips.push("Add numbers.");
    if (!hasSymbol(password)) tips.push("Add symbols for extra variety.");
    if (/^(.)\1+$/.test(password)) tips.push("Avoid repeating the same character.");
    if (/password|123456|qwerty|letmein|admin/i.test(password))
      tips.push("Avoid common passwords and predictable patterns.");
  
    // score from entropy (simple, consistent, Vercel-safe)
    // 0..100 roughly:
    const scoreRaw = Math.min(100, Math.max(0, (entropyBits / 80) * 100));
    const score = Math.round(scoreRaw);
  
    let label: StrengthDetails["label"] = "Very Weak";
    if (score >= 85) label = "Very Strong";
    else if (score >= 70) label = "Strong";
    else if (score >= 50) label = "Fair";
    else if (score >= 25) label = "Weak";
  
    return {
      score,
      label,
      tips: tips.length ? tips : ["Looks good. Keep it unique per account and enable 2FA."],
      charsetSize,
      entropyBits: Math.round(entropyBits),
      crack: getCrackEstimates(password),
    };
  }
  
  /**
   * Pwned Passwords (HIBP) K-Anonymity check.
   * - We SHA-1 the password locally
   * - Send only the first 5 chars of the hash
   * - Compare suffix locally
   * Returns: number of times seen in breaches (0 means not found).
   */
  export async function checkPasswordBreachCount(password: string): Promise<number> {
    if (!password) return 0;
  
    const sha1 = await sha1Hex(password);
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
  
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
      },
    });
  
    if (!res.ok) {
      throw new Error(`Breach API error: ${res.status}`);
    }
  
    const text = await res.text();
    // response lines: HASH_SUFFIX:COUNT
    const lines = text.split("\n");
    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix && hashSuffix.toUpperCase() === suffix.toUpperCase()) {
        const count = Number(countStr);
        return Number.isFinite(count) ? count : 0;
      }
    }
    return 0;
  }
  
  async function sha1Hex(input: string): Promise<string> {
    const enc = new TextEncoder();
    const buf = enc.encode(input);
    const digest = await crypto.subtle.digest("SHA-1", buf);
    return bufferToHex(digest).toUpperCase();
  }
  
  function bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
  }
  
  export function generatePassword(options: {
    length: number;
    lower: boolean;
    upper: boolean;
    digits: boolean;
    symbols: boolean;
  }): string {
    const pools: string[] = [];
    if (options.lower) pools.push("abcdefghijklmnopqrstuvwxyz");
    if (options.upper) pools.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    if (options.digits) pools.push("0123456789");
    if (options.symbols) pools.push("!@#$%^&*()_+-=[]{}|;:,.<>?");
  
    const pool = pools.join("");
    if (!pool) return "";
  
    // ensure at least one from each selected category
    const must: string[] = [];
    if (options.lower) must.push("abcdefghijklmnopqrstuvwxyz");
    if (options.upper) must.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    if (options.digits) must.push("0123456789");
    if (options.symbols) must.push("!@#$%^&*()_+-=[]{}|;:,.<>?");
  
    const length = Math.max(4, Math.min(64, Math.floor(options.length)));
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
  
    const out: string[] = [];
  
    // place guaranteed characters first
    for (let i = 0; i < must.length && out.length < length; i++) {
      const set = must[i];
      out.push(set[bytes[out.length] % set.length]);
    }
  
    // fill remaining
    while (out.length < length) {
      const idx = bytes[out.length] % pool.length;
      out.push(pool[idx]);
    }
  
    // shuffle (Fisher-Yates)
    for (let i = out.length - 1; i > 0; i--) {
      const j = bytes[i] % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
  
    return out.join("");
  }
  