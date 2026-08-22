import dns from "dns/promises";
import { URL } from "url";
import { getHeaderValue, isAllowedTargetUrl, probeUrl, resolvePublicIps } from "./scanner";

const DNS_TIMEOUT_MS = 5_000;
const MAX_TARGET_LENGTH = 2_048;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requestCounts = new Map<string, { started: number; count: number }>();

type Request = { method?: string; url?: string; query?: Record<string, unknown>; socket?: { remoteAddress?: string } };
type Response = { setHeader(name: string, value: string): void; statusCode: number; end(body: string): unknown };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), DNS_TIMEOUT_MS))]);
}

function allowRequest(key: string) {
  const now = Date.now();
  const existing = requestCounts.get(key);
  if (!existing || now - existing.started >= RATE_WINDOW_MS) {
    requestCounts.set(key, { started: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= MAX_REQUESTS_PER_WINDOW) return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.started + RATE_WINDOW_MS - now) / 1000)) };
  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function sendError(res: Response, statusCode: number, code: string, error: string) {
  res.statusCode = statusCode;
  return res.end(JSON.stringify({ error, code }));
}

export default async function handler(req: Request, res: Response) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method && req.method !== "GET") return sendError(res, 405, "method_not_allowed", "Only GET is supported.");

  // Forwarded headers are client-controlled unless a trusted proxy is configured.
  const limit = allowRequest((req.socket?.remoteAddress || "unknown").slice(0, 128));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return sendError(res, 429, "rate_limited", "Web security scan rate limit exceeded. Retry later.");
  }

  const reqUrl = new URL(req.url || "", "http://localhost");
  const target = reqUrl.searchParams.get("url") || req.query?.url;
  if (typeof target !== "string" || !target.trim()) return sendError(res, 400, "target_required", "Target URL is required.");
  if (target.length > MAX_TARGET_LENGTH) return sendError(res, 400, "invalid_target", "Target URL is too long.");

  let url: URL;
  try {
    const trimmed = target.trim();
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!isAllowedTargetUrl(url) || url.username || url.password || url.hash) throw new Error("invalid_target");
  } catch {
    return sendError(res, 400, "invalid_target", "Use a public HTTP or HTTPS URL on its default port.");
  }

  let addresses: string[];
  try {
    addresses = await resolvePublicIps(url.hostname);
  } catch (error) {
    const privateTarget = error instanceof Error && error.message === "private_address";
    return sendError(res, 400, privateTarget ? "private_target" : "dns_failure", privateTarget ? "Target resolves to restricted network space." : "Unable to resolve target hostname.");
  }

  // DNS lookup failures remain explicit missing evidence rather than absent records.
  const dnsQueries = await Promise.allSettled([
    withTimeout(dns.resolve4(url.hostname)).then((records) => records.map((address) => ({ type: "A", address }))),
    withTimeout(dns.resolve6(url.hostname)).then((records) => records.map((address) => ({ type: "AAAA", address }))),
    withTimeout(dns.resolveMx(url.hostname)).then((records) => records.map((record) => ({ type: "MX", exchange: record.exchange, priority: record.priority }))),
    withTimeout(dns.resolveTxt(url.hostname)).then((records) => records.map((entries) => ({ type: "TXT", entries }))),
    withTimeout(dns.resolveNs(url.hostname)).then((records) => records.map((host) => ({ type: "NS", host }))),
  ]);
  const dnsRecords: unknown[] = [];
  for (const result of dnsQueries) {
    if (result.status === "fulfilled") dnsRecords.push(...result.value);
  }
  const dnsUnavailable = dnsQueries.some((result) => result.status === "rejected");

  // This pins the connection to a just-validated address, validates TLS,
  // validates every redirect destination, and never buffers a response body.
  const probe = await probeUrl(url, addresses);
  if (probe.status === "failed" || probe.status === "unavailable") {
    return sendError(res, probe.error === "timeout" ? 504 : 502, "target_unavailable", "The target could not be securely reached or verified.");
  }

  const headers = probe.headers || {};
  res.statusCode = 200;
  return res.end(JSON.stringify({
    url: url.href,
    finalUrl: probe.redirect?.followed ? probe.redirect.to : url.href,
    redirects: probe.redirect ? [probe.redirect.from, probe.redirect.to] : [url.href],
    https: probe.protocol === "https",
    statusCode: probe.statusCode || 0,
    headers,
    certificate: probe.certificate || null,
    dns: dnsRecords,
    dnsStatus: dnsUnavailable ? "partial" : "verified",
    allow: getHeaderValue(headers, "allow") || getHeaderValue(headers, "access-control-allow-methods") || "",
    scanStatus: probe.status === "partial" || dnsUnavailable ? "partial" : "verified",
    scannedAt: new Date().toISOString(),
  }));
}
