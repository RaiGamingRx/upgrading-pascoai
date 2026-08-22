export type WebSecurityScan = {
  url: string;
  finalUrl: string;
  redirects: string[];
  statusCode: number;
  https: boolean;
  headers: Record<string, string | string[] | undefined>;
  certificate: null | {
    issuer: string;
    validFrom: string;
    validTo: string;
    expired: boolean;
    daysRemaining: number;
  };
  dns: any[];
  allow?: string | string[];
  scannedAt: string;
};

export type WebSecurityResult = WebSecurityScan & {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: string[];
  headerStatus: Record<string, { present: boolean; value?: string }>;
  cookieFindings: {
    raw: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "strict" | "lax" | "none" | "missing";
  }[];
  allowedMethods: string[];
};

const REQUIRED_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

function lowerHeaders(h: WebSecurityScan["headers"]) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  }
  return out;
}

function parseCookies(headersRaw: WebSecurityScan["headers"]) {
  const setCookie = headersRaw["set-cookie"];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];

  return list.map((c) => {
    const lc = c.toLowerCase();
    let sameSite: "strict" | "lax" | "none" | "missing" = "missing";
    if (lc.includes("samesite=strict")) sameSite = "strict";
    else if (lc.includes("samesite=lax")) sameSite = "lax";
    else if (lc.includes("samesite=none")) sameSite = "none";

    return {
      raw: c,
      secure: lc.includes("secure"),
      httpOnly: lc.includes("httponly"),
      sameSite,
    };
  });
}

function grade(score: number): WebSecurityResult["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export async function scanWebsite(url: string): Promise<WebSecurityResult> {
  const r = await fetch(`/api/web-security?url=${encodeURIComponent(url)}`);
  const text = await r.text();

  let data: WebSecurityScan & { error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Backend did not return JSON");
  }

  if (!r.ok || data.error) {
    throw new Error(data.error || "Scan failed");
  }

  const h = lowerHeaders(data.headers);

  // Header status
  const headerStatus: WebSecurityResult["headerStatus"] = {};
  for (const key of REQUIRED_HEADERS) {
    headerStatus[key] = { present: !!h[key], value: h[key] };
  }

  // Allowed methods
  const allowStr = Array.isArray(data.allow) ? data.allow.join(",") : (data.allow || "");
  const allowedMethods = allowStr
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Cookies
  const cookieFindings = parseCookies(data.headers);

  // Scoring (explainable)
  let score = 100;
  const issues: string[] = [];

  if (!data.https) {
    score -= 30;
    issues.push("HTTPS is not enabled.");
  }

  for (const [k, st] of Object.entries(headerStatus)) {
    if (!st.present) {
      const penalty = k === "content-security-policy" ? 15 : k === "strict-transport-security" ? 12 : 8;
      score -= penalty;
      issues.push(`Missing security header: ${k}`);
    }
  }

  if ("server" in h || "x-powered-by" in h) {
    score -= 5;
    issues.push("Server technology is exposed.");
  }

  for (const c of cookieFindings) {
    if (!c.secure) { score -= 4; issues.push("Cookie missing Secure flag."); }
    if (!c.httpOnly) { score -= 4; issues.push("Cookie missing HttpOnly flag."); }
    if (c.sameSite === "missing") { score -= 3; issues.push("Cookie missing SameSite attribute."); }
  }

  if (data.https && data.certificate) {
    if (data.certificate.expired) {
      score -= 25;
      issues.push("SSL certificate is expired.");
    } else if (data.certificate.daysRemaining <= 14) {
      score -= 10;
      issues.push(`SSL certificate expires soon (${data.certificate.daysRemaining} days).`);
    }
  }

  if (allowedMethods.includes("TRACE")) {
    score -= 8;
    issues.push("TRACE method is allowed.");
  }

  if (score < 0) score = 0;

  return {
    ...data,
    score,
    grade: grade(score),
    issues,
    headerStatus,
    cookieFindings,
    allowedMethods,
  };
}
