// src/lib/scanner.ts
// Real, SSRF-safe, server-backed cybersecurity scanner

export type Finding = {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: ScanStatus;
  description: string;
  recommendation: string;
  evidence?: Record<string, string | number | boolean | string[]>;
};

export type ScanStatus = "verified" | "partial" | "failed" | "unavailable";

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

const severities = new Set(["critical", "high", "medium", "low", "info"]);
const statuses = new Set<ScanStatus>(["verified", "partial", "failed", "unavailable"]);
const icons = new Set(["Eye", "Bug", "Network", "Lock"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEvidence(value: unknown): value is Finding["evidence"] {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) =>
    typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" ||
    Array.isArray(entry) && entry.every((item) => typeof item === "string")
  );
}

export function parseScanResult(value: unknown): RealScanResult {
  if (!isRecord(value) || typeof value.target !== "string" ||
    !(value.score === null || typeof value.score === "number" && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100) || typeof value.scannedAt !== "string" ||
    !statuses.has(value.status as ScanStatus) || !Array.isArray(value.results)) {
    throw new Error("Scanner returned an invalid response.");
  }

  const results = value.results.map((category) => {
    if (!isRecord(category) || typeof category.category !== "string" || !icons.has(category.icon as string) || !Array.isArray(category.findings)) {
      throw new Error("Scanner returned invalid category data.");
    }
    const findings = category.findings.map((finding) => {
      if (!isRecord(finding) || typeof finding.title !== "string" || typeof finding.description !== "string" ||
        typeof finding.recommendation !== "string" || !severities.has(finding.severity as string) ||
        !statuses.has(finding.status as ScanStatus) || finding.evidence !== undefined && !isEvidence(finding.evidence)) {
        throw new Error("Scanner returned invalid finding data.");
      }
      return finding as unknown as Finding;
    });
    return { category: category.category, icon: category.icon as CategoryResult["icon"], findings };
  });

  return { target: value.target, score: value.score, status: value.status as ScanStatus, scannedAt: value.scannedAt, results };
}

export async function runRealScan(target: string): Promise<RealScanResult> {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error("Target domain or IP address is required");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(`/api/scanner?target=${encodeURIComponent(trimmed)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Scan request timed out.");
    throw new Error("Unable to reach the scanner service.");
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.error) {
    throw new Error(data?.error || `Scan failed with status ${res.status}`);
  }

  return parseScanResult(data);
}
