import dns from "dns/promises";
import { ApiRequest, ApiResponse, ApiStatus, clientKey, createRateLimiter, sendError, sendJson, withTimeout } from "./api-utils";

const DNS_TIMEOUT_MS = 5_000;
const MAX_EMAIL_CHARS = 320;
const MAX_CONTENT_CHARS = 20_000;
const limiter = createRateLimiter(60_000, 15, 3);
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const DISPOSABLE = new Set(["tempmail.com", "temp-mail.org", "mailinator.com", "10minutemail.com", "guerrillamail.com", "yopmail.com", "trashmail.com", "dropmail.me"]);
const ROLES = new Set(["admin", "administrator", "support", "help", "info", "contact", "sales", "billing", "security", "abuse", "postmaster", "hostmaster", "webmaster"]);

type EmailRequest = ApiRequest & { url?: string; query?: Record<string, unknown>; body?: unknown };
type CheckState = "verified" | "missing" | "failed" | "unavailable";
type Evidence = Record<string, string | number | boolean | string[]>;
type Finding = { level: "safe" | "warning" | "critical" | "info"; category: "syntax" | "mx" | "spf" | "dkim" | "dmarc" | "disposable" | "role" | "content"; title: string; message: string; status: CheckState; evidence: Evidence };

function dnsState(error: unknown): CheckState {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "ETIMEDOUT" || code === "ETIMEOUT" || code === "ESERVFAIL" || code === "EREFUSED") return "unavailable";
  return "failed";
}
async function lookup<T>(operation: Promise<T>): Promise<{ state: CheckState; value?: T; code?: string }> {
  try { return { state: "verified", value: await withTimeout(operation, DNS_TIMEOUT_MS) }; }
  catch (error) { return { state: dnsState(error), code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "unknown") : "unknown" }; }
}
function provider(mx: { exchange: string; priority: number }[]) { const all = mx.map((x) => x.exchange.toLowerCase()).join(" "); return all.includes("google") ? "google" : all.includes("outlook") || all.includes("microsoft") ? "microsoft" : all.includes("yahoo") ? "yahoo" : all.includes("proton") ? "proton" : "custom"; }

type DnsResolver = Pick<typeof dns, "resolveMx" | "resolveTxt">;

export function createEmailSecurityHandler(resolver: DnsResolver = dns) {
return async function handler(req: EmailRequest, res: ApiResponse) {
  if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "Only POST is supported.");
  const limit = limiter.acquire(clientKey(req));
  if (!limit.allowed) { res.setHeader("Retry-After", String(limit.retryAfter)); return sendError(res, 429, "rate_limited", "Email inspection rate limit exceeded.", "unavailable"); }
  try {
    const url = new URL(req.url || "", "http://localhost");
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    const rawEmail = body.email ?? url.searchParams.get("email") ?? req.query?.email;
    const rawContent = body.content ?? url.searchParams.get("content") ?? "";
    if (typeof rawEmail !== "string" || typeof rawContent !== "string" || rawEmail.length > MAX_EMAIL_CHARS || rawContent.length > MAX_CONTENT_CHARS) return sendError(res, 400, "invalid_request", "Email or content input is invalid or too large.");
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return sendJson(res, 200, { status: "failed", email, domain: "", valid: false, score: null, flags: [{ level: "critical", category: "syntax", title: "Invalid email format", message: "The address could not be parsed as the supported email format.", status: "verified", evidence: { reason: "syntax_invalid" } }], scannedAt: new Date().toISOString() });
    const [localPart, domain] = email.split("@");
    const flags: Finding[] = [{ level: "safe", category: "syntax", title: "Email syntax parsed", message: "The address matches the supported email syntax.", status: "verified", evidence: { domain } }];
    const disposable = DISPOSABLE.has(domain);
    flags.push({ level: disposable ? "warning" : "info", category: "disposable", title: disposable ? "Known disposable domain" : "Disposable-list check complete", message: disposable ? "The domain is on this service's limited disposable-domain list." : "The domain was not found on this service's limited disposable-domain list.", status: "verified", evidence: { domain, listMatch: disposable } });
    const roleBased = ROLES.has(localPart);
    flags.push({ level: roleBased ? "warning" : "info", category: "role", title: roleBased ? "Role-based local part" : "Role-address check complete", message: roleBased ? "The local part is a common shared mailbox name." : "The local part was not a configured shared-mailbox name.", status: "verified", evidence: { localPart, listMatch: roleBased } });

    const [mxCheck, txtCheck, dmarcCheck] = await Promise.all([lookup(resolver.resolveMx(domain)), lookup(resolver.resolveTxt(domain)), lookup(resolver.resolveTxt(`_dmarc.${domain}`))]);
    const mx = mxCheck.value ? [...mxCheck.value].sort((a, b) => a.priority - b.priority).slice(0, 20) : [];
    if (mxCheck.state === "verified") flags.push({ level: mx.length ? "safe" : "warning", category: "mx", title: mx.length ? "MX records observed" : "No MX records observed", message: mx.length ? "Mail exchanger records were returned by DNS." : "DNS answered successfully but returned no MX records.", status: mx.length ? "verified" : "missing", evidence: { recordCount: mx.length, exchanges: mx.map((x) => x.exchange) } });
    else flags.push({ level: "info", category: "mx", title: "MX lookup unavailable", message: "MX posture was not verified because DNS lookup did not complete.", status: mxCheck.state, evidence: { dnsCode: mxCheck.code || "unknown" } });
    const txt = txtCheck.value?.map((entry) => entry.join("")) || [];
    const spfRecord = txt.find((entry) => /^v=spf1\b/i.test(entry));
    const spfStatus: CheckState = txtCheck.state === "verified" ? spfRecord ? "verified" : "missing" : txtCheck.state;
    flags.push({ level: spfStatus === "verified" ? "safe" : spfStatus === "missing" ? "warning" : "info", category: "spf", title: spfStatus === "verified" ? "SPF record observed" : spfStatus === "missing" ? "No SPF record observed" : "SPF lookup unavailable", message: spfStatus === "verified" ? "An SPF record was returned by DNS; this scan does not evaluate all authorization paths." : spfStatus === "missing" ? "DNS answered successfully but no SPF record was returned." : "SPF posture was not verified because DNS lookup did not complete.", status: spfStatus, evidence: spfRecord ? { record: spfRecord } : { dnsCode: txtCheck.code || "verified" } });
    const dmarc = dmarcCheck.value?.map((entry) => entry.join("")).find((entry) => /^v=dmarc1\b/i.test(entry));
    const dmarcStatus: CheckState = dmarcCheck.state === "verified" ? dmarc ? "verified" : "missing" : dmarcCheck.state;
    flags.push({ level: dmarcStatus === "verified" ? "safe" : dmarcStatus === "missing" ? "warning" : "info", category: "dmarc", title: dmarcStatus === "verified" ? "DMARC record observed" : dmarcStatus === "missing" ? "No DMARC record observed" : "DMARC lookup unavailable", message: dmarcStatus === "verified" ? "A DMARC record was returned by DNS; enforcement depends on receiving systems and policy details." : dmarcStatus === "missing" ? "DNS answered successfully but no DMARC record was returned." : "DMARC posture was not verified because DNS lookup did not complete.", status: dmarcStatus, evidence: dmarc ? { record: dmarc } : { dnsCode: dmarcCheck.code || "verified" } });
    flags.push({ level: "info", category: "dkim", title: "DKIM not assessed", message: "DKIM cannot be assessed from a domain alone because selectors are not provided by DNS discovery.", status: "unavailable", evidence: { reason: "selector_or_message_headers_required" } });
    const content = rawContent.trim();
    if (content) { const shortLinks = content.match(/https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|is\.gd)\/[^\s]+/gi) || []; flags.push({ level: shortLinks.length ? "warning" : "info", category: "content", title: shortLinks.length ? "URL shortener observed" : "Content heuristic complete", message: shortLinks.length ? "Shortened URLs can obscure destinations; this is not proof of phishing." : "No configured shortener was observed in the supplied text.", status: "verified", evidence: { contentLength: content.length, shortLinks: shortLinks.slice(0, 5) } }); }
    const complete = [mxCheck, txtCheck, dmarcCheck].every((check) => check.state === "verified");
    const status: ApiStatus = [mxCheck, txtCheck, dmarcCheck].some((check) => check.state === "failed") ? "failed" : "partial";
    return sendJson(res, 200, { status, email, domain, valid: true, disposable, roleBased, provider: provider(mx), mxRecords: mx, spf: { present: Boolean(spfRecord), record: spfRecord, status: spfStatus }, dkim: { status: "unavailable", reason: "selector_or_message_headers_required" }, dmarc: { present: Boolean(dmarc), record: dmarc, status: dmarcStatus }, score: complete ? null : null, flags, scannedAt: new Date().toISOString() });
  } catch { return sendError(res, 500, "internal_error", "Email security inspection could not be completed."); }
  finally { limit.release(); }
};
}

export default createEmailSecurityHandler();
