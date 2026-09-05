/**
 * PASCOAI ENTERPRISE CLIENT IP & PROXY TRUST RESOLVER
 * 
 * Securely extracts and sanitizes client IP addresses, protecting against:
 * 1. Attacker-controlled X-Forwarded-For header spoofing
 * 2. Rate limit evasion via header tampering
 * 3. Audit trail attribution forgery
 */

import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

export interface ProxyTrustConfig {
  trustProxy: boolean;
  trustedProxies: string[];
  trustedHops?: number;
}

/**
 * Returns whether proxy trust is enabled based on environment.
 * Default is FALSE unless TRUST_PROXY is set to "true" or "1".
 */
export function getProxyTrustConfig(): ProxyTrustConfig {
  const envVal = (process.env.TRUST_PROXY || "").trim().toLowerCase();
  const trustProxy = envVal === "true" || envVal === "1";

  // Optional custom trusted proxy list (comma-separated IPs/subnets)
  const rawList = process.env.TRUSTED_PROXIES || "";
  const trustedProxies = rawList
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  // If trustProxy is true and no specific list provided, trust loopback and private proxies by default
  if (trustProxy && trustedProxies.length === 0) {
    trustedProxies.push(
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16"
    );
  }

  const hops = parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10);
  return { trustProxy, trustedProxies, trustedHops: isNaN(hops) ? 1 : hops };
}

/**
 * Normalizes an IPv4 or IPv6 address string.
 * Strips port numbers (e.g. "192.168.1.1:8080" -> "192.168.1.1")
 * Normalizes IPv6-mapped IPv4 (e.g. "::ffff:127.0.0.1" -> "127.0.0.1")
 */
export function normalizeIp(rawIp: string): string {
  let ip = (rawIp || "").trim();

  // Strip enclosing brackets for IPv6 like [::1]:8080
  if (ip.startsWith("[") && ip.includes("]")) {
    const bracketEnd = ip.indexOf("]");
    ip = ip.substring(1, bracketEnd);
  } else if (ip.includes(":") && ip.includes(".") && ip.indexOf(":") === ip.lastIndexOf(":")) {
    // IPv4 with port: "192.168.1.1:8080"
    ip = ip.split(":")[0];
  }

  // IPv6 mapped IPv4
  if (ip.startsWith("::ffff:")) {
    const candidate = ip.substring(7);
    if (isIP(candidate) === 4) {
      ip = candidate;
    }
  }

  // Validate IP syntax
  if (!isIP(ip)) {
    return "127.0.0.1";
  }

  return ip.slice(0, 45);
}

/**
 * Evaluates whether an IP address matches an explicit IP or CIDR block (IPv4).
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const normIp = normalizeIp(ip);
  const target = cidr.trim().toLowerCase();

  if (!target.includes("/")) {
    return normIp === normalizeIp(target);
  }

  const [range, bitsStr] = target.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;

  const ipParts = normIp.split(".").map(Number);
  const rangeParts = range.split(".").map(Number);
  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

  const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  const rangeNum = ((rangeParts[0] << 24) | rangeParts[1] << 16 | rangeParts[2] << 8 | rangeParts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Checks if an IP is within a trusted proxy range or matches a trusted entry.
 */
export function isTrustedProxy(ip: string, trustedList: string[]): boolean {
  const norm = normalizeIp(ip);
  if (norm === "127.0.0.1" || norm === "::1") return true;

  for (const entry of trustedList) {
    if (isIpInCidr(norm, entry)) return true;
  }

  // Default private container networks if not explicitly configured
  if (norm.startsWith("10.") || norm.startsWith("192.168.")) return true;
  if (norm.startsWith("172.")) {
    const parts = norm.split(".");
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

/**
 * Resolves the genuine client IP address for an incoming request.
 * 
 * Rules:
 * 1. If TRUST_PROXY is false, socket.remoteAddress is strictly used.
 * 2. If TRUST_PROXY is true:
 *    - The direct peer (socket.remoteAddress) MUST be a trusted proxy.
 *    - If direct peer is untrusted, socket.remoteAddress is returned.
 *    - If direct peer is trusted, X-Forwarded-For is parsed right-to-left
 *      to find the first untrusted upstream IP.
 */
export function getSafeClientIp(
  req: IncomingMessage,
  customConfig?: ProxyTrustConfig
): string {
  const socketIp = normalizeIp(req.socket?.remoteAddress || "127.0.0.1");
  const config = customConfig || getProxyTrustConfig();

  // If proxy trust is disabled, always return the direct socket IP
  if (!config.trustProxy) {
    return socketIp;
  }

  // If the direct connection is not from a trusted proxy, ignore all forwarded headers
  if (!isTrustedProxy(socketIp, config.trustedProxies)) {
    return socketIp;
  }

  // Parse X-Forwarded-For
  const xff = req.headers ? req.headers["x-forwarded-for"] : undefined;
  if (typeof xff === "string" && xff.trim().length > 0) {
    const ips = xff
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);

    // Walk right-to-left from the closest proxy back to the client
    for (let i = ips.length - 1; i >= 0; i--) {
      const candidate = normalizeIp(ips[i]);
      if (!isTrustedProxy(candidate, config.trustedProxies)) {
        return candidate;
      }
    }

    // If all IPs in XFF were trusted, return the leftmost one
    if (ips.length > 0) {
      return normalizeIp(ips[0]);
    }
  }

  // Parse X-Real-IP if present and direct peer is trusted
  const xRealIp = req.headers ? req.headers["x-real-ip"] : undefined;
  if (typeof xRealIp === "string" && xRealIp.trim().length > 0) {
    return normalizeIp(xRealIp);
  }

  return socketIp;
}
