// api/scanner.ts
import https from "https";
import http from "http";
import tls from "tls";
import { URL } from "url";
import dns from "dns/promises";
import net from "net";

export type ScanStatus = "verified" | "partial" | "failed" | "unavailable";

const DNS_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 7000;
const MAX_REDIRECTS = 3;
const MAX_RESOLVED_ADDRESSES = 4;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_ACTIVE_PER_CLIENT = 2;
const MAX_ACTIVE_SCANS = 8;

type RateEntry = { windowStarted: number; requests: number; active: number };
const rateEntries = new Map<string, RateEntry>();
let activeScans = 0;

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [first, second, third] = parts;
    return first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 2 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0 && third === 113) || first >= 224;
  }
  if (!net.isIPv6(ip)) return true;
  const lower = ip.toLowerCase();
  const mappedV4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4) return isPrivateIp(mappedV4[1]);
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const first = parseInt(mappedHex[1], 16);
    const second = parseInt(mappedHex[2], 16);
    return isPrivateIp(`${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`);
  }
  const firstHextet = parseInt(lower.split(":")[0] || "0", 16);
  return lower === "::" || lower === "::1" ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xff00 && firstHextet <= 0xffff) ||
    lower.startsWith("2001:db8:");
}

function isDisallowedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan");
}

export function isAllowedTargetUrl(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  if (url.port && !["80", "443"].includes(url.port)) return false;
  return !url.port || url.port === (url.protocol === "https:" ? "443" : "80");
}

export type Finding = {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: ScanStatus;
  description: string;
  recommendation: string;
  evidence?: Record<string, string | number | boolean | string[]>;
};

export type CategoryResult = {
  category: string;
  icon: "Eye" | "Bug" | "Network" | "Lock";
  findings: Finding[];
};

export type RealScanResult = {
  target: string;
  score: number | null; // 0–100 (higher = safer), or null when evidence is insufficient
  status: ScanStatus;
  results: CategoryResult[];
  scannedAt: string;
};

type ProbeResult = {
  status: ScanStatus;
  protocol: "http" | "https";
  statusCode?: number;
  headers?: http.IncomingHttpHeaders;
  certificate?: {
    issuer: string;
    validFrom: string;
    validTo: string;
    expired: boolean;
    notYetValid: boolean;
    daysRemaining: number;
  };
  error?: "timeout" | "connection_refused" | "dns_failure" | "tls_failure" | "certificate_expired" | "certificate_not_yet_valid" | "hostname_mismatch" | "untrusted_certificate" | "redirect_blocked" | "connection_error";
  redirect?: { from: string; to: string; followed: boolean };
};

type ScannerRequest = { url?: string; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string | undefined>; socket?: { remoteAddress?: string } };
type ScannerResponse = { setHeader: (name: string, value: string) => void; statusCode: number; end: (body: string) => unknown };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]);
}

export async function resolvePublicIps(hostname: string): Promise<string[]> {
  const addresses = await withTimeout(dns.lookup(hostname, { all: true, verbatim: true }), DNS_TIMEOUT_MS);
  // Validate every answer before applying the connection cap.  Silently
  // discarding a private answer would make the DNS safety decision depend on
  // resolver ordering.
  const allIps = [...new Set(addresses.map((address) => address.address))];
  if (!allIps.length || allIps.some(isPrivateIp)) throw new Error("private_address");
  return allIps.slice(0, MAX_RESOLVED_ADDRESSES);
}

export function getHeaderValue(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value;
}

function certificateState(cert: tls.PeerCertificate) {
  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);
  const now = Date.now();
  return {
    issuer: cert.issuer?.O || cert.issuer?.CN || "Unknown",
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    expired: validTo.getTime() < now,
    notYetValid: validFrom.getTime() > now,
    daysRemaining: Math.ceil((validTo.getTime() - now) / (1000 * 60 * 60 * 24)),
  };
}

async function probeUrlAtAddress(url: URL, ips: string[], redirectDepth = 0, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ProbeResult> {
  const protocol = url.protocol === "https:" ? "https" : "http";
  const transport = protocol === "https" ? https : http;
  const port = Number(url.port) || (protocol === "https" ? 443 : 80);
  const address = ips[0];

  return new Promise<ProbeResult>((resolve) => {
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const request = transport.request({
      hostname: address,
      family: net.isIPv6(address) ? 6 : 4,
      port,
      path: `${url.pathname || "/"}${url.search}`,
      method: "GET",
      ...(protocol === "https" ? { servername: url.hostname, rejectUnauthorized: true } : {}),
      headers: {
        Host: url.host,
        "User-Agent": "PascoAI-CybersecurityScanner/2.0",
        Connection: "close",
      },
      timeout: timeoutMs,
    }, (response) => {
      const location = getHeaderValue(response.headers, "location");
      const base = { protocol, statusCode: response.statusCode, headers: response.headers } as ProbeResult;
      response.destroy();
      void (async () => {
        if (location && response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          let redirectUrl: URL;
          try {
            redirectUrl = new URL(location, url);
            if (!isAllowedTargetUrl(redirectUrl)) throw new Error("invalid_redirect");
            if (redirectDepth >= MAX_REDIRECTS) return finish({ ...base, status: "partial", redirect: { from: url.href, to: redirectUrl.href, followed: false } });
            const redirectIps = await resolvePublicIps(redirectUrl.hostname);
            const next = await probeUrl(redirectUrl, redirectIps, redirectDepth + 1, timeoutMs);
            return finish({ ...next, redirect: { from: url.href, to: redirectUrl.href, followed: true } });
          } catch (error) {
            const message = error instanceof Error ? error.message : "redirect_error";
            const blocked = message === "private_address" || message === "invalid_redirect";
            return finish({ ...base, status: blocked ? "partial" : "failed", redirect: { from: url.href, to: location, followed: false }, error: blocked ? "redirect_blocked" : "dns_failure" });
          }
        }
        finish({ ...base, status: "verified" });
      })();

      if (protocol === "https" && response.socket instanceof tls.TLSSocket) {
        const cert = response.socket.getPeerCertificate(true);
        if (cert?.valid_to) (base as ProbeResult).certificate = certificateState(cert);
      }
    });
    request.once("error", (error: NodeJS.ErrnoException) => {
      const errorCode = error.code === "ECONNREFUSED" ? "connection_refused" :
        error.code === "CERT_HAS_EXPIRED" ? "certificate_expired" :
        error.code === "CERT_NOT_YET_VALID" ? "certificate_not_yet_valid" :
        error.code === "ERR_TLS_CERT_ALTNAME_INVALID" ? "hostname_mismatch" :
        ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"].includes(error.code || "") ? "untrusted_certificate" :
        error.code?.startsWith("ERR_TLS") ? "tls_failure" : "connection_error";
      finish({ status: "failed", protocol, error: errorCode });
    });
    request.once("timeout", () => {
      request.destroy();
      finish({ status: "unavailable", protocol, error: "timeout" });
    });
    request.end();
  });
}

export async function probeUrl(url: URL, ips: string[], redirectDepth = 0, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ProbeResult> {
  let lastResult: ProbeResult | undefined;
  for (const ip of ips) {
    lastResult = await probeUrlAtAddress(url, [ip], redirectDepth, timeoutMs);
    if (lastResult.status === "verified" || lastResult.status === "partial") return lastResult;
  }
  return lastResult || { status: "unavailable", protocol: url.protocol === "https:" ? "https" : "http", error: "connection_error" };
}

function getClientKey(req: ScannerRequest): string {
  // Forwarded headers are client-controlled unless a trusted proxy strips and
  // rewrites them. This deployment has no trusted-proxy configuration.
  const socketAddress = req.socket?.remoteAddress;
  return (socketAddress || "unknown").slice(0, 128);
}

function acquireRateLimit(key: string) {
  const now = Date.now();
  if (activeScans >= MAX_ACTIVE_SCANS) return { allowed: false, retryAfter: 1, release: () => undefined };
  if (rateEntries.size > 10_000) {
    for (const [entryKey, entry] of rateEntries) if (now - entry.windowStarted > RATE_WINDOW_MS) rateEntries.delete(entryKey);
  }
  const entry = rateEntries.get(key);
  if (!entry || now - entry.windowStarted >= RATE_WINDOW_MS) {
    const fresh = { windowStarted: now, requests: 1, active: 1 };
    rateEntries.set(key, fresh);
    activeScans += 1;
    return { allowed: true, retryAfter: 0, release: () => { fresh.active -= 1; activeScans = Math.max(0, activeScans - 1); } };
  }
  const retryAfter = Math.ceil((entry.windowStarted + RATE_WINDOW_MS - now) / 1000);
  if (entry.requests >= MAX_REQUESTS_PER_WINDOW || entry.active >= MAX_ACTIVE_PER_CLIENT || activeScans >= MAX_ACTIVE_SCANS) {
    return { allowed: false, retryAfter, release: () => undefined };
  }
  entry.requests += 1;
  entry.active += 1;
  activeScans += 1;
  return { allowed: true, retryAfter, release: () => { entry.active = Math.max(0, entry.active - 1); activeScans = Math.max(0, activeScans - 1); } };
}

export default async function handler(req: ScannerRequest, res: ScannerResponse) {
  res.setHeader("Content-Type", "application/json");
  let release: () => void = () => undefined;

  try {
    const limit = acquireRateLimit(getClientKey(req));
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfter));
      res.statusCode = 429;
      return res.end(JSON.stringify({ error: "Scanner rate limit exceeded. Retry later.", code: "rate_limited" }));
    }
    release = limit.release;
    const reqUrl = new URL(req.url || "", "http://localhost");
    const bodyTarget = typeof req.body === "object" && req.body !== null && "target" in req.body ? req.body.target : undefined;
    const target = reqUrl.searchParams.get("target") || req.query?.target || bodyTarget;
    if (!target || typeof target !== "string") return sendError(res, 400, "target_required", "Target domain or public IP address is required.");

    const trimmed = target.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (!isAllowedTargetUrl(parsedUrl) || parsedUrl.hash || parsedUrl.pathname !== "/" || parsedUrl.search) throw new Error("invalid_policy");
    } catch {
      return sendError(res, 400, "invalid_target", "Invalid target. Use a public hostname or IP with HTTP or HTTPS.");
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (!hostname || isDisallowedHostname(hostname)) return sendError(res, 400, "private_target", "Scanning local or private hosts is restricted.");

    let resolvedIps: string[];
    try {
      resolvedIps = await resolvePublicIps(hostname);
    } catch (error) {
      const reason = error instanceof Error && error.message === "private_address" ? "private_target" : "dns_failure";
      return sendError(res, 400, reason, reason === "private_target" ? "Target resolves to restricted network space." : "Unable to resolve the target hostname.");
    }

    const reconFindings: Finding[] = [{
      title: "Host Resolution Verified", severity: "info", status: "verified",
      description: "The target resolved to public IP address(es).", recommendation: "Monitor DNS records for unauthorized changes.",
      evidence: { addresses: resolvedIps.slice(0, 4) },
    }];
    let mxAvailable = true;
    try {
      const mx = await withTimeout(dns.resolveMx(hostname), DNS_TIMEOUT_MS);
      if (mx.length) reconFindings.push({
        title: `Mail Exchanger Active (${mx.length} MX records)`, severity: "info", status: "verified",
        description: "An MX record was observed for the target hostname.", recommendation: "Ensure SPF, DKIM, and DMARC are configured separately.",
        evidence: { exchange: mx[0].exchange, priority: mx[0].priority, recordCount: mx.length },
      });
    } catch {
      mxAvailable = false;
      reconFindings.push({ title: "MX Records Unavailable", severity: "info", status: "unavailable", description: "MX lookup did not complete; mail posture was not assessed.", recommendation: "Retry the scan if mail records are required.", evidence: { check: "MX lookup" } });
    }

    const probe = await probeUrl(parsedUrl, resolvedIps);
    const portFindings: Finding[] = [];
    const sslFindings: Finding[] = [];
    const vulnFindings: Finding[] = [];
    let score = 100;

    if (probe.status === "verified") {
      portFindings.push({ title: `Port ${parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80)} Responded`, severity: "info", status: "verified", description: `A ${probe.protocol.toUpperCase()} response with status ${probe.statusCode} was received.`, recommendation: "Review service exposure according to your deployment policy.", evidence: { statusCode: probe.statusCode || 0, protocol: probe.protocol } });
      if (probe.statusCode && probe.statusCode >= 400) portFindings.push({ title: "HTTP Error Response Observed", severity: "info", status: "verified", description: `The server returned HTTP ${probe.statusCode}; HTTPS/network reachability was still verified.`, recommendation: "Review the application response separately from transport security.", evidence: { statusCode: probe.statusCode } });
    } else {
      portFindings.push({ title: "Transport Check Unavailable", severity: "info", status: probe.status, description: probe.error === "timeout" ? "The connection timed out before a response was received." : probe.error === "connection_refused" ? "The connection was refused; port state was not inferred." : "No response was obtained, so service availability could not be verified.", recommendation: "Retry from an authorized network vantage point before drawing conclusions.", evidence: { error: probe.error || "unknown", protocol: probe.protocol } });
    }

    if (probe.protocol === "https") {
      if (probe.status === "verified" && probe.certificate) {
        const cert = probe.certificate;
        if (cert.expired) { score -= 35; sslFindings.push({ title: "TLS Certificate Expired", severity: "critical", status: "verified", description: `The verified certificate expired on ${cert.validTo}.`, recommendation: "Renew and install an updated certificate.", evidence: cert }); }
        else if (cert.notYetValid) { score -= 25; sslFindings.push({ title: "TLS Certificate Not Yet Valid", severity: "high", status: "verified", description: `The verified certificate is not valid until ${cert.validFrom}.`, recommendation: "Install a certificate whose validity period includes the current time.", evidence: cert }); }
        else if (cert.daysRemaining <= 14) { score -= 10; sslFindings.push({ title: `TLS Certificate Expiring Soon (${cert.daysRemaining} days left)`, severity: "medium", status: "verified", description: `The verified certificate expires on ${cert.validTo}.`, recommendation: "Schedule certificate renewal.", evidence: cert }); }
        else sslFindings.push({ title: "TLS Certificate Verified", severity: "info", status: "verified", description: `TLS certificate verification succeeded and the certificate is valid through ${cert.validTo}.`, recommendation: "Maintain automated certificate rotation.", evidence: cert });
      } else if (probe.status !== "verified") {
        const tlsDescription = probe.error === "certificate_expired" ? "The peer certificate was rejected because it is expired." : probe.error === "certificate_not_yet_valid" ? "The peer certificate was rejected because it is not yet valid." : probe.error === "hostname_mismatch" ? "The peer certificate does not match the requested hostname." : probe.error === "untrusted_certificate" ? "The peer certificate chain could not be trusted." : probe.error === "tls_failure" ? "The TLS handshake or certificate verification failed." : "TLS certificate posture could not be verified because the connection did not complete.";
        sslFindings.push({ title: "TLS Verification Unavailable", severity: "info", status: probe.status, description: tlsDescription, recommendation: "Install a correctly trusted certificate for the requested hostname, or retry the scan for transient failures.", evidence: { error: probe.error || "unknown" } });
      }
    }

    const headers = probe.headers;
    if (probe.status === "verified" && headers) {
      const hsts = getHeaderValue(headers, "strict-transport-security");
      const maxAge = hsts?.match(/(?:^|;)\s*max-age\s*=\s*(\d+)/i)?.[1];
      if (probe.protocol !== "https") sslFindings.push({ title: "HSTS Not Assessed", severity: "info", status: "unavailable", description: "The tested response was HTTP, so HSTS was not assessed as an HTTPS control.", recommendation: "Assess HSTS on the HTTPS endpoint.", evidence: { protocol: probe.protocol } });
      else if (hsts && maxAge && Number(maxAge) > 0) sslFindings.push({ title: "HSTS Validated", severity: "info", status: "verified", description: "Strict-Transport-Security was observed with a positive max-age.", recommendation: "Consider includeSubDomains and preload only after validating deployment impact.", evidence: { value: hsts, maxAge: Number(maxAge) } });
      else { score -= 10; vulnFindings.push({ title: "HSTS Not Effectively Configured", severity: "low", status: "verified", description: hsts ? "Strict-Transport-Security was present but no positive max-age was observed." : "Strict-Transport-Security was not present in the response.", recommendation: "Configure an appropriate positive max-age after reviewing subdomain impact.", evidence: { value: hsts || "not present" } }); }

      const csp = getHeaderValue(headers, "content-security-policy");
      if (csp) vulnFindings.push({ title: "Content Security Policy Observed", severity: "info", status: "verified", description: "A Content-Security-Policy header was observed; this scan does not assess whether its directives are strong.", recommendation: "Review directives for unnecessary wildcards and unsafe sources.", evidence: { value: csp } });
      else vulnFindings.push({ title: "Content Security Policy Not Observed", severity: "low", status: "verified", description: "No Content-Security-Policy header was observed in the tested response; this is not proof of an XSS vulnerability.", recommendation: "Consider a restrictive CSP appropriate to the application.", evidence: { value: "not present" } });

      const xFrame = getHeaderValue(headers, "x-frame-options")?.trim().toUpperCase();
      const frameAncestors = csp?.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
      if (xFrame === "DENY" || xFrame === "SAMEORIGIN" || frameAncestors) vulnFindings.push({ title: "Clickjacking Control Validated", severity: "info", status: "verified", description: "A recognized X-Frame-Options value or CSP frame-ancestors directive was observed.", recommendation: "Keep the policy aligned with intended embedding behavior.", evidence: { xFrame: xFrame || "not present", frameAncestors: frameAncestors || "not present" } });
      else { score -= 10; vulnFindings.push({ title: "Clickjacking Control Not Validated", severity: "low", status: "verified", description: "No recognized X-Frame-Options value or CSP frame-ancestors directive was observed.", recommendation: "Configure X-Frame-Options or CSP frame-ancestors.", evidence: { xFrame: xFrame || "not present", frameAncestors: "not present" } }); }

      const contentTypeOptions = getHeaderValue(headers, "x-content-type-options")?.trim().toLowerCase();
      if (contentTypeOptions === "nosniff") vulnFindings.push({ title: "MIME Sniffing Protection Validated", severity: "info", status: "verified", description: "X-Content-Type-Options: nosniff was observed.", recommendation: "Keep this header on responses where MIME confusion could matter.", evidence: { value: contentTypeOptions } });
      else { score -= 5; vulnFindings.push({ title: "MIME Sniffing Protection Not Validated", severity: "low", status: "verified", description: "X-Content-Type-Options: nosniff was not observed in the tested response.", recommendation: "Add X-Content-Type-Options: nosniff.", evidence: { value: contentTypeOptions || "not present" } }); }
    }

    const status: ScanStatus = probe.status === "verified" && mxAvailable ? (probe.redirect && !probe.redirect.followed ? "partial" : "verified") : probe.status === "verified" ? "partial" : probe.status;
    const results: CategoryResult[] = [
      { category: "Reconnaissance", icon: "Eye", findings: reconFindings },
      { category: "Vulnerability Overview", icon: "Bug", findings: vulnFindings },
      { category: "Port & Transport", icon: "Network", findings: portFindings },
      { category: "SSL/TLS Analysis", icon: "Lock", findings: sslFindings },
    ];
    // Any incomplete evidence set is not a complete posture score. In
    // particular, an unavailable DNS/MX or blocked redirect check must never
    // surface as an apparently perfect 100.
    const finalScore = status === "verified" ? Math.max(0, Math.min(100, Math.round(score))) : null;
    const responsePayload: RealScanResult = { target: hostname, score: finalScore, status, results, scannedAt: new Date().toISOString() };
    res.statusCode = 200;
    return res.end(JSON.stringify(responsePayload));
  } catch {
    return sendError(res, 500, "scan_failed", "The scanner could not complete the request.");
  } finally {
    release();
  }
}

function sendError(res: ScannerResponse, statusCode: number, code: string, message: string) {
  res.statusCode = statusCode;
  return res.end(JSON.stringify({ error: message, code }));
}
