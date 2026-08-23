// src/lib/reportModel.ts
// Pure TypeScript evidence-backed Executive Security Report Aggregator & Model

export type VerificationClass =
  | "VERIFIED_EVIDENCE"
  | "DETERMINISTIC_DERIVATION"
  | "AI_THREAT_ANALYSIS"
  | "TRAINING_SIMULATION";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export interface EvidenceItem {
  key: string;
  label: string;
  value: string | number | boolean | string[];
}

export interface SecurityFinding {
  id: string;
  domainId: string;
  domainName: string;
  target: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  category: string;
  source: string;
  detectedAt: string;
  verificationClass: VerificationClass;
  evidence?: Record<string, string | number | boolean | string[] | undefined> | string;
  recommendation: string;
}

export interface SecurityDomain {
  id: string;
  name: string;
  category: "OPERATIONS" | "AUDIT_DEFENSE" | "SECURITY_LABS" | "AI_INTEL";
  target: string;
  score: number | null;
  status: "verified" | "partial" | "clean" | "attention" | "insufficient_data";
  scannedAt: string;
  findings: SecurityFinding[];
  cleanChecks: string[];
  evidenceSummary?: Record<string, string | number | boolean>;
}

export interface ExecutiveSummary {
  target: string;
  isMultiTarget: boolean;
  assessmentTimestamp: string;
  overallPostureScore: number | null;
  scoreLabel: string;
  totalVerifiedFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  cleanChecksCount: number;
  domainsAssessed: string[];
  coverage: string;
  statusHeadline: string;
}

export interface AIAnalysisSummary {
  topic: string;
  persona: string;
  date: string;
  summary: string;
  keyFindings: string[];
  risks: string[];
  mitigations: string[];
  verificationClass: "AI_THREAT_ANALYSIS";
}

export interface SimulationSummary {
  toolId: string;
  title: string;
  categoryId: string;
  date: string;
  verificationClass: "TRAINING_SIMULATION";
}

export interface ReportMetadata {
  reportId: string;
  generatedAt: string;
  generatorVersion: string;
  classificationNotice: string;
}

export interface ExecutiveSecurityReport {
  metadata: ReportMetadata;
  target: string;
  isMultiTarget: boolean;
  availableTargets: string[];
  summary: ExecutiveSummary;
  domains: SecurityDomain[];
  aiAnalysis: AIAnalysisSummary[];
  simulations: SimulationSummary[];
}

export interface StoredAuditData {
  scannerHistory?: unknown[];
  websecHistory?: unknown[];
  emailHistory?: unknown[];
  researchHistory?: unknown[];
  simulationHistory?: unknown[];
  cryptoHistory?: unknown[];
  passwordHistory?: unknown[];
}

/* -------------------- Storage Keys -------------------- */
export const STORAGE_KEYS = {
  SCAN_HISTORY: "pasco_scan_history_v1",
  SCAN_HISTORY_V2: "pasco_scanner_history_v2",
  WEBSEC_HISTORY: "pasco_websec_history_v1",
  EMAIL_HISTORY: "pasco_email_history_v1",
  RESEARCH_HISTORY: "pasco_research_history_v1",
  SIMULATION_HISTORY: "pasco_simulations_history_v2",
  CRYPTO_HISTORY: "pasco_crypto_history_v1",
  PASSWORD_HISTORY: "pasco_password_history_v1",
} as const;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely normalizes target URLs, domains, and emails for accurate comparison
 * without losing meaningful target semantics.
 */
export function normalizeTarget(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();

  // If email address, return the domain portion
  if (trimmed.includes("@") && !trimmed.startsWith("http")) {
    const parts = trimmed.split("@");
    return parts[parts.length - 1].trim();
  }

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return url.hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .trim();
  }
}

/**
 * Reads all stored data from localStorage or passed object
 */
export function loadStoredAuditData(): StoredAuditData {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  // Check both v1 and v2 scan keys
  const v1Scans = safeJsonParse<unknown[]>(
    localStorage.getItem(STORAGE_KEYS.SCAN_HISTORY),
    []
  );
  const v2Scans = safeJsonParse<unknown[]>(
    localStorage.getItem(STORAGE_KEYS.SCAN_HISTORY_V2),
    []
  );
  const combinedScans = Array.isArray(v1Scans) && v1Scans.length > 0 ? v1Scans : v2Scans;

  return {
    scannerHistory: Array.isArray(combinedScans) ? combinedScans : [],
    websecHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.WEBSEC_HISTORY),
      []
    ),
    emailHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.EMAIL_HISTORY),
      []
    ),
    researchHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.RESEARCH_HISTORY),
      []
    ),
    simulationHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.SIMULATION_HISTORY),
      []
    ),
    cryptoHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.CRYPTO_HISTORY),
      []
    ),
    passwordHistory: safeJsonParse<unknown[]>(
      localStorage.getItem(STORAGE_KEYS.PASSWORD_HISTORY),
      []
    ),
  };
}

/**
 * Discovers all unique targets currently present across stored security checks
 */
export function getAvailableReportTargets(data?: StoredAuditData): string[] {
  const auditData = data || loadStoredAuditData();
  const targets = new Set<string>();

  (auditData.scannerHistory || []).forEach((item) => {
    if (item && typeof item === "object" && "target" in item && typeof item.target === "string") {
      const norm = normalizeTarget(item.target);
      if (norm) targets.add(norm);
    }
  });

  (auditData.websecHistory || []).forEach((item) => {
    if (item && typeof item === "object") {
      const url = "finalUrl" in item && typeof item.finalUrl === "string"
        ? item.finalUrl
        : "url" in item && typeof item.url === "string"
        ? item.url
        : "";
      const norm = normalizeTarget(url);
      if (norm) targets.add(norm);
    }
  });

  (auditData.emailHistory || []).forEach((item) => {
    if (item && typeof item === "object") {
      const email = "email" in item && typeof item.email === "string"
        ? item.email
        : "domain" in item && typeof item.domain === "string"
        ? item.domain
        : "";
      const norm = normalizeTarget(email);
      if (norm) targets.add(norm);
    }
  });

  return Array.from(targets).sort();
}

/**
 * Normalizes Scanner findings into the unified SecurityFinding model
 */
function extractScannerFindings(
  scanItem: Record<string, unknown>,
  targetMatch: string
): { findings: SecurityFinding[]; cleanChecks: string[]; score: number | null; date: string } {
  const findings: SecurityFinding[] = [];
  const cleanChecks: string[] = [];
  const target = String(scanItem.target || targetMatch);
  const score = typeof scanItem.score === "number" ? scanItem.score : null;
  const date = String(scanItem.scannedAt || scanItem.date || new Date().toISOString());

  // If detailed results array exists
  if (Array.isArray(scanItem.results)) {
    scanItem.results.forEach((categoryObj) => {
      if (categoryObj && typeof categoryObj === "object" && Array.isArray(categoryObj.findings)) {
        const catName = String(categoryObj.category || "Network Recon");
        categoryObj.findings.forEach((f, fIdx) => {
          if (f && typeof f === "object") {
            const sev = (String(f.severity || "info").toLowerCase()) as SeverityLevel;
            const title = String(f.title || "Scan Finding");
            const desc = String(f.description || "");
            const rec = String(f.recommendation || "Review host configuration");
            const evidence = f.evidence && typeof f.evidence === "object" ? (f.evidence as Record<string, string | number | boolean | string[]>) : undefined;

            if (sev === "info" && title.toLowerCase().includes("verified") || title.toLowerCase().includes("valid")) {
              cleanChecks.push(`${catName}: ${title}`);
            }

            findings.push({
              id: `scanner-${fIdx}-${Date.now()}`,
              domainId: "operations-scanner",
              domainName: "OPERATIONS / VULNERABILITY",
              target,
              title,
              description: desc,
              severity: ["critical", "high", "medium", "low", "info"].includes(sev) ? sev : "info",
              category: catName,
              source: "SSRF-Guarded Network Scanner",
              detectedAt: date,
              verificationClass: "VERIFIED_EVIDENCE",
              evidence,
              recommendation: rec,
            });
          }
        });
      }
    });
  } else if (score !== null) {
    // If only summary score is recorded
    if (score < 80) {
      findings.push({
        id: `scanner-summary-${Date.now()}`,
        domainId: "operations-scanner",
        domainName: "OPERATIONS / VULNERABILITY",
        target,
        title: "Host Surface Configuration Deficit",
        description: `Automated scan indicated reduced host defense posture (${score}/100).`,
        severity: score < 50 ? "high" : "medium",
        category: "Host Recon",
        source: "SSRF-Guarded Network Scanner",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        recommendation: "Run full granular audit to remediate exposed service headers and TLS configurations.",
      });
    } else {
      cleanChecks.push(`Host Reconnaissance: Baseline security posture verified (${score}/100)`);
    }
  }

  return { findings, cleanChecks, score, date };
}

/**
 * Normalizes Web Security audit results into unified SecurityFinding model
 */
function extractWebSecFindings(
  webItem: Record<string, unknown>,
  targetMatch: string
): { findings: SecurityFinding[]; cleanChecks: string[]; score: number | null; date: string; evidence: Record<string, string | number | boolean> } {
  const findings: SecurityFinding[] = [];
  const cleanChecks: string[] = [];
  const target = String(webItem.finalUrl || webItem.url || targetMatch);
  const score = typeof webItem.score === "number" ? webItem.score : null;
  const date = String(webItem.scannedAt || new Date().toISOString());
  const evidenceSummary: Record<string, string | number | boolean> = {};

  if (typeof webItem.statusCode === "number") {
    evidenceSummary["HTTP Status"] = webItem.statusCode;
  }
  if (typeof webItem.https === "boolean") {
    evidenceSummary["HTTPS Enabled"] = webItem.https;
    if (!webItem.https) {
      findings.push({
        id: `websec-https-${Date.now()}`,
        domainId: "audit-websec",
        domainName: "WEB SECURITY",
        target,
        title: "Unencrypted Plaintext Transport (HTTP)",
        description: "The web host serves content over unencrypted HTTP, allowing man-in-the-middle interception.",
        severity: "critical",
        category: "Transport Security",
        source: "Web Security Suite",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { protocol: "HTTP/1.1 (Non-TLS)" },
        recommendation: "Enforce HTTPS-only redirection and configure strict TLS 1.2/1.3 cipher suites.",
      });
    } else {
      cleanChecks.push("Transport: HTTPS protocol verified");
    }
  }

  // Headers evaluation
  if (webItem.headerStatus && typeof webItem.headerStatus === "object") {
    const hs = webItem.headerStatus as Record<string, { present?: boolean; value?: string }>;
    Object.entries(hs).forEach(([hKey, hVal]) => {
      const isPresent = Boolean(hVal?.present);
      if (!isPresent) {
        let sev: SeverityLevel = "medium";
        let rec = `Configure the '${hKey}' response header.`;
        if (hKey === "content-security-policy") {
          sev = "high";
          rec = "Define a robust Content-Security-Policy (CSP) restricting script execution and frames.";
        } else if (hKey === "strict-transport-security") {
          sev = "high";
          rec = "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'.";
        }

        findings.push({
          id: `websec-header-${hKey}-${Date.now()}`,
          domainId: "audit-websec",
          domainName: "WEB SECURITY",
          target,
          title: `Missing Security Header: ${hKey.toUpperCase()}`,
          description: `The HTTP server does not return the '${hKey}' defense header in responses.`,
          severity: sev,
          category: "HTTP Response Headers",
          source: "Web Security Suite",
          detectedAt: date,
          verificationClass: "VERIFIED_EVIDENCE",
          evidence: { header: hKey, status: "MISSING" },
          recommendation: rec,
        });
      } else {
        cleanChecks.push(`Header: ${hKey} present (${hVal.value ? hVal.value.slice(0, 30) : "Active"})`);
      }
    });
  }

  // Certificate inspection
  if (webItem.certificate && typeof webItem.certificate === "object") {
    const cert = webItem.certificate as { issuer?: string; expired?: boolean; daysRemaining?: number; validTo?: string };
    if (cert.issuer) evidenceSummary["Certificate Issuer"] = cert.issuer;
    if (typeof cert.daysRemaining === "number") evidenceSummary["Days Remaining"] = cert.daysRemaining;

    if (cert.expired) {
      findings.push({
        id: `websec-cert-expired-${Date.now()}`,
        domainId: "audit-websec",
        domainName: "WEB SECURITY",
        target,
        title: "SSL/TLS Certificate Expired",
        description: `The public TLS certificate expired. Browsers will block access with critical security errors.`,
        severity: "critical",
        category: "Certificate Authority",
        source: "Web Security Suite",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { issuer: cert.issuer || "Unknown", daysRemaining: cert.daysRemaining ?? 0 },
        recommendation: "Renew the TLS certificate immediately with a trusted certificate authority.",
      });
    } else if (typeof cert.daysRemaining === "number" && cert.daysRemaining <= 14) {
      findings.push({
        id: `websec-cert-expiring-${Date.now()}`,
        domainId: "audit-websec",
        domainName: "WEB SECURITY",
        target,
        title: "SSL/TLS Certificate Expiring Soon",
        description: `The TLS certificate expires in ${cert.daysRemaining} days.`,
        severity: "medium",
        category: "Certificate Authority",
        source: "Web Security Suite",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { daysRemaining: cert.daysRemaining, validTo: cert.validTo || "Upcoming" },
        recommendation: "Trigger certificate automated renewal to avoid service disruption.",
      });
    } else {
      cleanChecks.push(`TLS Certificate: Valid (${cert.daysRemaining ?? "Active"} days remaining, Issuer: ${cert.issuer || "Trusted"})`);
    }
  }

  // Cookie flags
  if (Array.isArray(webItem.cookieFindings)) {
    webItem.cookieFindings.forEach((ck, cIdx) => {
      if (ck && typeof ck === "object") {
        if (!ck.secure || !ck.httpOnly || ck.sameSite === "missing") {
          findings.push({
            id: `websec-cookie-${cIdx}-${Date.now()}`,
            domainId: "audit-websec",
            domainName: "WEB SECURITY",
            target,
            title: `Insecure Session Cookie Configuration (${ck.raw ? ck.raw.split("=")[0] : "Cookie"})`,
            description: `Cookie is missing essential security flags: ${[!ck.secure && "Secure", !ck.httpOnly && "HttpOnly", ck.sameSite === "missing" && "SameSite"].filter(Boolean).join(", ")}.`,
            severity: "medium",
            category: "Cookie Hardening",
            source: "Web Security Suite",
            detectedAt: date,
            verificationClass: "VERIFIED_EVIDENCE",
            evidence: { cookie: ck.raw || "Cookie definition", secure: Boolean(ck.secure), httpOnly: Boolean(ck.httpOnly) },
            recommendation: "Append 'Secure; HttpOnly; SameSite=Strict' or 'SameSite=Lax' to all Set-Cookie directives.",
          });
        }
      }
    });
  }

  return { findings, cleanChecks, score, date, evidence: evidenceSummary };
}

/**
 * Normalizes Email Security audit results into unified SecurityFinding model
 */
function extractEmailFindings(
  emailItem: Record<string, unknown>,
  targetMatch: string
): { findings: SecurityFinding[]; cleanChecks: string[]; score: number | null; date: string; evidence: Record<string, string | number | boolean> } {
  const findings: SecurityFinding[] = [];
  const cleanChecks: string[] = [];
  const target = String(emailItem.domain || emailItem.email || targetMatch);
  const score = typeof emailItem.score === "number" ? emailItem.score : null;
  const date = typeof emailItem.scannedAt === "number"
    ? new Date(emailItem.scannedAt).toISOString()
    : String(emailItem.scannedAt || new Date().toISOString());
  const evidenceSummary: Record<string, string | number | boolean> = {};

  // SPF check
  if (emailItem.spf && typeof emailItem.spf === "object") {
    const spf = emailItem.spf as { present?: boolean; record?: string; strength?: string };
    evidenceSummary["SPF Present"] = Boolean(spf.present);
    if (spf.record) evidenceSummary["SPF Record"] = spf.record;

    if (!spf.present) {
      findings.push({
        id: `email-spf-missing-${Date.now()}`,
        domainId: "audit-emailsec",
        domainName: "EMAIL SECURITY",
        target,
        title: "Missing SPF (Sender Policy Framework) Record",
        description: "The domain lacks an authoritative SPF TXT record, allowing unauthorized servers to spoof emails.",
        severity: "high",
        category: "DNS Anti-Spoofing",
        source: "Email Security Inspector",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { dnsRecord: "SPF TXT Not Found" },
        recommendation: "Publish a valid SPF record (e.g., 'v=spf1 include:_spf.google.com ~all') in authoritative DNS.",
      });
    } else {
      cleanChecks.push(`SPF: Active (${spf.strength?.toUpperCase() || "Configured"})`);
    }
  }

  // DMARC check
  if (emailItem.dmarc && typeof emailItem.dmarc === "object") {
    const dmarc = emailItem.dmarc as { present?: boolean; record?: string; policy?: string };
    evidenceSummary["DMARC Present"] = Boolean(dmarc.present);
    if (dmarc.policy) evidenceSummary["DMARC Policy"] = dmarc.policy;

    if (!dmarc.present) {
      findings.push({
        id: `email-dmarc-missing-${Date.now()}`,
        domainId: "audit-emailsec",
        domainName: "EMAIL SECURITY",
        target,
        title: "Missing DMARC Alignment Policy",
        description: "No DMARC policy found at _dmarc.<domain>. Mail receivers cannot verify SPF/DKIM alignment.",
        severity: "high",
        category: "DNS Anti-Spoofing",
        source: "Email Security Inspector",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { dmarcQuery: `_dmarc.${target} returned no record` },
        recommendation: "Publish a DMARC policy (e.g. 'v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com').",
      });
    } else if (dmarc.policy === "none") {
      findings.push({
        id: `email-dmarc-none-${Date.now()}`,
        domainId: "audit-emailsec",
        domainName: "EMAIL SECURITY",
        target,
        title: "DMARC Policy Set to 'p=none' (Monitoring Only)",
        description: "DMARC is configured in non-enforcing monitoring mode. Spoofed emails will not be rejected.",
        severity: "medium",
        category: "DNS Anti-Spoofing",
        source: "Email Security Inspector",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        evidence: { policy: "p=none" },
        recommendation: "Upgrade DMARC policy from 'p=none' to 'p=quarantine' or 'p=reject' after analyzing reports.",
      });
    } else {
      cleanChecks.push(`DMARC: Enforcing ('p=${dmarc.policy}')`);
    }
  }

  // MX Records
  if (Array.isArray(emailItem.mxRecords)) {
    evidenceSummary["MX Exchangers"] = emailItem.mxRecords.length;
    if (emailItem.mxRecords.length === 0) {
      findings.push({
        id: `email-mx-missing-${Date.now()}`,
        domainId: "audit-emailsec",
        domainName: "EMAIL SECURITY",
        target,
        title: "No Mail Exchanger (MX) Records Found",
        description: "Domain cannot receive mail due to absence of DNS MX records.",
        severity: "low",
        category: "DNS Routing",
        source: "Email Security Inspector",
        detectedAt: date,
        verificationClass: "VERIFIED_EVIDENCE",
        recommendation: "Configure valid MX records with primary and secondary mail servers.",
      });
    } else {
      cleanChecks.push(`MX: ${emailItem.mxRecords.length} mail exchangers active`);
    }
  }

  return { findings, cleanChecks, score, date, evidence: evidenceSummary };
}

/**
 * Main Report Generation Engine
 * Reads existing persisted evidence and builds a structured, typed ExecutiveSecurityReport.
 */
export function generateExecutiveReport(options?: {
  selectedTarget?: string;
  storageData?: StoredAuditData;
}): ExecutiveSecurityReport {
  const auditData = options?.storageData || loadStoredAuditData();
  const availableTargets = getAvailableReportTargets(auditData);

  const isMulti = !options?.selectedTarget || options.selectedTarget === "__ALL__";
  const rawTarget = isMulti
    ? availableTargets.length > 0
      ? availableTargets[0]
      : "General Defense Environment"
    : options!.selectedTarget!;

  const targetFilter = isMulti ? "" : normalizeTarget(rawTarget);
  const displayTarget = isMulti
    ? availableTargets.length > 1
      ? `Multi-Target Assessment (${availableTargets.length} Assets)`
      : rawTarget
    : rawTarget;

  const domains: SecurityDomain[] = [];
  const allFindings: SecurityFinding[] = [];
  let totalCleanChecks = 0;
  const scores: number[] = [];

  // 1. OPERATIONS / VULNERABILITY SCANNER DOMAIN
  const matchingScans = (auditData.scannerHistory || []).filter((s) => {
    if (!s || typeof s !== "object") return false;
    const t = "target" in s && typeof s.target === "string" ? normalizeTarget(s.target) : "";
    return isMulti ? true : t === targetFilter;
  }) as Record<string, unknown>[];

  if (matchingScans.length > 0) {
    const latestScan = matchingScans[0];
    const { findings, cleanChecks, score, date } = extractScannerFindings(
      latestScan,
      displayTarget
    );
    if (score !== null) scores.push(score);
    totalCleanChecks += cleanChecks.length;
    allFindings.push(...findings);

    domains.push({
      id: "operations-scanner",
      name: "OPERATIONS / VULNERABILITY",
      category: "OPERATIONS",
      target: String(latestScan.target || displayTarget),
      score,
      status: score === null ? "insufficient_data" : score >= 80 ? "clean" : "attention",
      scannedAt: date,
      findings,
      cleanChecks,
    });
  }

  // 2. WEB SECURITY SUITE DOMAIN
  const matchingWeb = (auditData.websecHistory || []).filter((w) => {
    if (!w || typeof w !== "object") return false;
    const url = "finalUrl" in w && typeof w.finalUrl === "string"
      ? w.finalUrl
      : "url" in w && typeof w.url === "string"
      ? w.url
      : "";
    const t = normalizeTarget(url);
    return isMulti ? true : t === targetFilter;
  }) as Record<string, unknown>[];

  if (matchingWeb.length > 0) {
    const latestWeb = matchingWeb[0];
    const { findings, cleanChecks, score, date, evidence } = extractWebSecFindings(
      latestWeb,
      displayTarget
    );
    if (score !== null) scores.push(score);
    totalCleanChecks += cleanChecks.length;
    allFindings.push(...findings);

    domains.push({
      id: "audit-websec",
      name: "WEB SECURITY SUITE",
      category: "AUDIT_DEFENSE",
      target: String(latestWeb.finalUrl || latestWeb.url || displayTarget),
      score,
      status: score === null ? "insufficient_data" : score >= 80 ? "clean" : "attention",
      scannedAt: date,
      findings,
      cleanChecks,
      evidenceSummary: evidence,
    });
  }

  // 3. EMAIL SECURITY DOMAIN
  const matchingEmail = (auditData.emailHistory || []).filter((e) => {
    if (!e || typeof e !== "object") return false;
    const email = "email" in e && typeof e.email === "string"
      ? e.email
      : "domain" in e && typeof e.domain === "string"
      ? e.domain
      : "";
    const t = normalizeTarget(email);
    return isMulti ? true : t === targetFilter;
  }) as Record<string, unknown>[];

  if (matchingEmail.length > 0) {
    const latestEmail = matchingEmail[0];
    const { findings, cleanChecks, score, date, evidence } = extractEmailFindings(
      latestEmail,
      displayTarget
    );
    if (score !== null) scores.push(score);
    totalCleanChecks += cleanChecks.length;
    allFindings.push(...findings);

    domains.push({
      id: "audit-emailsec",
      name: "EMAIL SECURITY POSTURE",
      category: "AUDIT_DEFENSE",
      target: String(latestEmail.domain || latestEmail.email || displayTarget),
      score,
      status: score === null ? "insufficient_data" : score >= 80 ? "clean" : "attention",
      scannedAt: date,
      findings,
      cleanChecks,
      evidenceSummary: evidence,
    });
  }

  // 4. AI THREAT INTELLIGENCE (Strictly separated)
  const aiSummaries: AIAnalysisSummary[] = [];
  (auditData.researchHistory || []).forEach((r) => {
    if (r && typeof r === "object") {
      const topic = "topic" in r && typeof r.topic === "string" ? r.topic : "Threat Analysis";
      const persona = "persona" in r && typeof r.persona === "string" ? r.persona : "SOC Analyst";
      const date = "date" in r && typeof r.date === "string" ? r.date : new Date().toISOString().slice(0, 10);
      aiSummaries.push({
        topic,
        persona: persona.toUpperCase(),
        date,
        summary: `Gemini AI threat inquiry conducted by ${persona} persona.`,
        keyFindings: [`Topic investigated: ${topic}`],
        risks: ["Advisory assessment based on threat intelligence synthesis."],
        mitigations: ["Verify mitigation steps against production environment controls."],
        verificationClass: "AI_THREAT_ANALYSIS",
      });
    }
  });

  // 5. TRAINING SIMULATIONS (Strictly isolated from posture score)
  const simSummaries: SimulationSummary[] = [];
  (auditData.simulationHistory || []).forEach((s) => {
    if (s && typeof s === "object") {
      simSummaries.push({
        toolId: "toolId" in s && typeof s.toolId === "string" ? s.toolId : "simulation",
        title: "title" in s && typeof s.title === "string" ? s.title : "Security Lab Simulation",
        categoryId: "categoryId" in s && typeof s.categoryId === "string" ? s.categoryId : "defense",
        date: "date" in s && typeof s.date === "string" ? s.date : new Date().toISOString().slice(0, 10),
        verificationClass: "TRAINING_SIMULATION",
      });
    }
  });

  // Aggregate Severity Counts
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  allFindings.forEach((f) => {
    if (f.severity === "critical") criticalCount++;
    else if (f.severity === "high") highCount++;
    else if (f.severity === "medium") mediumCount++;
    else if (f.severity === "low") lowCount++;
    else infoCount++;
  });

  // Overall Posture Calculation
  const overallScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  let scoreLabel = "INSUFFICIENT DATA";
  let statusHeadline = "Audit Data Pending";

  if (overallScore !== null) {
    if (overallScore >= 90) {
      scoreLabel = "EXCELLENT (A)";
      statusHeadline = "Robust Security Posture — Minimal Attack Surface";
    } else if (overallScore >= 80) {
      scoreLabel = "GOOD (B)";
      statusHeadline = "Favorable Posture — Minor Configuration Deficits";
    } else if (overallScore >= 70) {
      scoreLabel = "MODERATE (C)";
      statusHeadline = "Moderate Risk — Actionable Vulnerabilities Detected";
    } else if (overallScore >= 60) {
      scoreLabel = "POOR (D)";
      statusHeadline = "Elevated Exposure — Defense Remediation Required";
    } else {
      scoreLabel = "CRITICAL DEFICIT (F)";
      statusHeadline = "Critical Security Exposure — Immediate Action Required";
    }
  }

  const reportId = `PASCO-SEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  return {
    metadata: {
      reportId,
      generatedAt: new Date().toISOString(),
      generatorVersion: "PascoAI Cyber Defense Engine v2.4 LTS",
      classificationNotice:
        "EVIDENCE CLASSIFICATION: Findings in this report are categorized into VERIFIED_EVIDENCE (direct network & DNS queries), DETERMINISTIC_DERIVATION (mathematical formulas), AI_THREAT_ANALYSIS (Gemini intelligence synthesis), and TRAINING_SIMULATION (educational sandbox).",
    },
    target: displayTarget,
    isMultiTarget: isMulti,
    availableTargets,
    summary: {
      target: displayTarget,
      isMultiTarget: isMulti,
      assessmentTimestamp: new Date().toISOString(),
      overallPostureScore: overallScore,
      scoreLabel,
      totalVerifiedFindings: allFindings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      cleanChecksCount: totalCleanChecks,
      domainsAssessed: domains.map((d) => d.name),
      coverage: `${domains.length} Domain${domains.length === 1 ? "" : "s"} Verified`,
      statusHeadline,
    },
    domains,
    aiAnalysis: aiSummaries.slice(0, 5),
    simulations: simSummaries.slice(0, 5),
  };
}

/**
 * Downloads the normalized ExecutiveSecurityReport as a structured JSON file
 */
export function exportReportAsJson(report: ExecutiveSecurityReport): void {
  if (typeof window === "undefined") return;

  const sanitizedTarget = report.target.replace(/[^a-zA-Z0-9.-]/g, "_").toLowerCase();
  const dateStr = new Date(report.metadata.generatedAt).toISOString().slice(0, 10);
  const filename = `pascoai-security-report-${sanitizedTarget}-${dateStr}.json`;

  const jsonString = JSON.stringify(report, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
