import { useEffect, useMemo, useState } from "react";
import { PageTransition } from "@/components/motion/PageTransition";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { AnimatedPageHeading } from "@/components/motion/AnimatedPageHeading";
import { ExportReportModal } from "@/components/security/ExportReportModal";
import { DefensePostureHero, type DefenseFactor } from "@/components/dashboard/DefensePostureHero";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { SecurityCharts, type TimelineDataPoint, type SeverityCount, type CategoryDistribution } from "@/components/dashboard/SecurityCharts";
import { AIBriefingSection } from "@/components/dashboard/AIBriefingSection";
import { SecuritySuitesGrid } from "@/components/dashboard/SecuritySuitesGrid";
import { ActivityTimeline, type UnifiedActivityItem } from "@/components/dashboard/ActivityTimeline";
import { generateExecutiveReport } from "@/lib/reportModel";
import {
  Shield,
  FileText,
  Scan,
  Globe,
  MailCheck,
  Lock,
  Key,
  Search,
} from "lucide-react";
import { toast } from "sonner";

/* -------------------- Storage Keys across all PascoAI suites -------------------- */
const SCAN_HISTORY_KEY = "pasco_scan_history_v1";
const SCAN_HISTORY_V2_KEY = "pasco_scanner_history_v2";
const WEBSEC_HISTORY_KEY = "pasco_websec_history_v1";
const EMAIL_HISTORY_KEY = "pasco_email_history_v1";
const PASSWORD_HISTORY_KEY = "pasco_password_history_v1";
const CRYPTO_HISTORY_KEY = "pasco_crypto_history_v1";
const RESEARCH_HISTORY_KEY = "pasco_research_history_v1";
const SIMULATIONS_HISTORY_KEY = "pasco_simulations_history_v2";

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function timeAgo(dateStringOrTimestamp: string | number): string {
  if (!dateStringOrTimestamp) return "Just now";
  const parsed = new Date(dateStringOrTimestamp);
  if (isNaN(parsed.getTime())) return String(dateStringOrTimestamp);

  const diffMs = Date.now() - parsed.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Dashboard() {
  const [scanHistory, setScanHistory] = useState<Record<string, unknown>[]>([]);
  const [websecHistory, setWebsecHistory] = useState<Record<string, unknown>[]>([]);
  const [emailHistory, setEmailHistory] = useState<Record<string, unknown>[]>([]);
  const [cryptoHistory, setCryptoHistory] = useState<Record<string, unknown>[]>([]);
  const [passwordHistory, setPasswordHistory] = useState<Record<string, unknown>[]>([]);
  const [researchHistory, setResearchHistory] = useState<Record<string, unknown>[]>([]);
  const [simHistory, setSimHistory] = useState<Record<string, unknown>[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Load real telemetry data from localStorage
  const loadPlatformHistory = () => {
    const v1Scans = safeJson<Record<string, unknown>[]>(localStorage.getItem(SCAN_HISTORY_KEY), []);
    const v2Scans = safeJson<Record<string, unknown>[]>(localStorage.getItem(SCAN_HISTORY_V2_KEY), []);
    const combinedScans = Array.isArray(v1Scans) && v1Scans.length > 0 ? v1Scans : v2Scans;

    setScanHistory(combinedScans);
    setWebsecHistory(safeJson(localStorage.getItem(WEBSEC_HISTORY_KEY), []));
    setEmailHistory(safeJson(localStorage.getItem(EMAIL_HISTORY_KEY), []));
    setCryptoHistory(safeJson(localStorage.getItem(CRYPTO_HISTORY_KEY), []));
    setPasswordHistory(safeJson(localStorage.getItem(PASSWORD_HISTORY_KEY), []));
    setResearchHistory(safeJson(localStorage.getItem(RESEARCH_HISTORY_KEY), []));
    setSimHistory(safeJson(localStorage.getItem(SIMULATIONS_HISTORY_KEY), []));
  };

  useEffect(() => {
    loadPlatformHistory();

    // Listen for storage events across tabs
    const onStorageChange = () => {
      loadPlatformHistory();
    };
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  // Compute normalized Executive Security Report from real audit storage
  const executiveReport = useMemo(() => {
    return generateExecutiveReport({ selectedTarget: "__ALL__" });
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, passwordHistory, researchHistory, simHistory]);

  // Aggregate Metrics & Health Status
  const metrics = useMemo(() => {
    const totalScans = scanHistory.length + websecHistory.length + emailHistory.length;
    const allScores: number[] = [];

    scanHistory.forEach((s) => typeof s.score === "number" && allScores.push(s.score));
    websecHistory.forEach((w) => typeof w.score === "number" && allScores.push(w.score));
    emailHistory.forEach((e) => typeof e.score === "number" && allScores.push(e.score));

    const avgScore =
      allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 88;

    const cryptoCount = cryptoHistory.length;
    const researchCount = researchHistory.length;
    const criticalCount = executiveReport.summary.criticalCount;
    const highCount = executiveReport.summary.highCount;
    const cleanChecksCount = executiveReport.summary.cleanChecksCount;

    let systemStatus: "operational" | "warning" | "critical" = "operational";
    if (criticalCount > 0) {
      systemStatus = "critical";
    } else if (highCount > 0 || allScores.some((s) => s < 60)) {
      systemStatus = "warning";
    }

    return {
      totalScans,
      avgScore,
      cryptoCount,
      researchCount,
      criticalCount,
      highCount,
      criticalAndHighCount: criticalCount + highCount,
      cleanChecksCount,
      systemStatus,
    };
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, researchHistory, executiveReport]);

  // Real Sub-Factor Assessment Ratings
  const defenseFactors: DefenseFactor[] = useMemo(() => {
    // 1. Network Recon
    const scanScores = scanHistory
      .map((s) => (typeof s.score === "number" ? s.score : null))
      .filter((s): s is number => s !== null);
    const avgScan =
      scanScores.length > 0
        ? Math.round(scanScores.reduce((a, b) => a + b, 0) / scanScores.length)
        : null;

    // 2. Web & TLS Hardening
    const webScores = websecHistory
      .map((w) => (typeof w.score === "number" ? w.score : null))
      .filter((w): w is number => w !== null);
    const avgWeb =
      webScores.length > 0
        ? Math.round(webScores.reduce((a, b) => a + b, 0) / webScores.length)
        : null;

    // 3. Email Anti-Spoofing
    const emailScores = emailHistory
      .map((e) => (typeof e.score === "number" ? e.score : null))
      .filter((e): e is number => e !== null);
    const avgEmail =
      emailScores.length > 0
        ? Math.round(emailScores.reduce((a, b) => a + b, 0) / emailScores.length)
        : null;

    // 4. Crypto Integrity
    const cryptoCount = cryptoHistory.length;

    // 5. Password Entropy
    const passCount = passwordHistory.length;

    return [
      {
        id: "factor-recon",
        name: "Network & Port Recon",
        category: "Host Perimeter",
        score: avgScan,
        status: avgScan !== null ? (avgScan >= 70 ? "verified" : "attention") : "pending",
        description: "Open TCP port inspection, service detection, and perimeter host analysis.",
        icon: Scan,
        linkPath: "/scanner",
      },
      {
        id: "factor-websec",
        name: "Web & TLS Hardening",
        category: "HTTP/TLS Layer",
        score: avgWeb,
        status: avgWeb !== null ? (avgWeb >= 70 ? "verified" : "attention") : "pending",
        description: "SSL certificate validity, HSTS preload, CSP headers & cookie hardening.",
        icon: Globe,
        linkPath: "/web-security",
      },
      {
        id: "factor-email",
        name: "Email Anti-Spoofing",
        category: "DNS Infrastructure",
        score: avgEmail,
        status: avgEmail !== null ? (avgEmail >= 70 ? "verified" : "attention") : "pending",
        description: "Authoritative DNS MX, SPF records & DMARC reject/quarantine policies.",
        icon: MailCheck,
        linkPath: "/email-security",
      },
      {
        id: "factor-crypto",
        name: "AES-256 Cryptography",
        category: "Cryptographic Lab",
        score: cryptoCount > 0 ? 100 : null,
        status: cryptoCount > 0 ? "verified" : "pending",
        description: "Authenticated WebCrypto AES-GCM 256-bit ciphertext encryption pipeline.",
        icon: Lock,
        linkPath: "/crypto",
      },
    ];
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, passwordHistory]);

  // Unified Chronological Telemetry Points for Recharts Trend
  const timelineData: TimelineDataPoint[] = useMemo(() => {
    const points: { ts: number; score: number; target: string; suite: string }[] = [];

    scanHistory.forEach((s, idx) => {
      if (typeof s.score === "number") {
        const ts = s.date ? new Date(String(s.date)).getTime() : Date.now() - idx * 3600000;
        points.push({
          ts,
          score: s.score,
          target: String(s.target || "Domain Recon"),
          suite: "Network Scanner",
        });
      }
    });

    websecHistory.forEach((w, idx) => {
      if (typeof w.score === "number") {
        const ts = w.scannedAt ? new Date(String(w.scannedAt)).getTime() : Date.now() - idx * 3600000;
        const target = w.finalUrl ? new URL(String(w.finalUrl)).hostname : String(w.url || "Web Target");
        points.push({
          ts,
          score: w.score,
          target,
          suite: "Web Security",
        });
      }
    });

    emailHistory.forEach((e, idx) => {
      if (typeof e.score === "number") {
        const ts = typeof e.scannedAt === "number" ? e.scannedAt : new Date(String(e.scannedAt || Date.now())).getTime();
        points.push({
          ts,
          score: e.score,
          target: String(e.email || e.domain || "Email Domain"),
          suite: "Email Security",
        });
      }
    });

    // Sort ascending by time for chart
    points.sort((a, b) => a.ts - b.ts);

    return points.map((p) => {
      const d = new Date(p.ts);
      const dateLabel = isNaN(d.getTime())
        ? "Audit"
        : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
      return {
        timestamp: p.ts,
        dateLabel,
        score: p.score,
        target: p.target,
        suite: p.suite,
      };
    });
  }, [scanHistory, websecHistory, emailHistory]);

  // Real Threat Severity Distribution
  const severityData: SeverityCount[] = useMemo(() => {
    return [
      {
        name: "Critical",
        count: executiveReport.summary.criticalCount,
        color: "#f43f5e",
        fill: "#f43f5e",
      },
      {
        name: "High",
        count: executiveReport.summary.highCount,
        color: "#f59e0b",
        fill: "#f59e0b",
      },
      {
        name: "Medium",
        count: executiveReport.summary.mediumCount,
        color: "#eab308",
        fill: "#eab308",
      },
      {
        name: "Low",
        count: executiveReport.summary.lowCount,
        color: "#06b6d4",
        fill: "#06b6d4",
      },
      {
        name: "Info",
        count: executiveReport.summary.infoCount,
        color: "#94a3b8",
        fill: "#64748b",
      },
    ];
  }, [executiveReport]);

  // Category Distribution from Real Assessed Domains
  const categoryData: CategoryDistribution[] = useMemo(() => {
    const list: CategoryDistribution[] = [];

    executiveReport.domains.forEach((dom) => {
      const issues = dom.findings.length;
      const passed = dom.cleanChecks.length;
      const total = issues + passed;
      if (total > 0) {
        list.push({
          category: dom.name,
          passed,
          issues,
          total,
        });
      }
    });

    return list;
  }, [executiveReport]);

  // Unified Activity Feed
  const recentActivities: UnifiedActivityItem[] = useMemo(() => {
    const items: UnifiedActivityItem[] = [];

    // 1. Domain Scans
    scanHistory.forEach((s, idx) => {
      const ts = s.date ? new Date(String(s.date)).getTime() : Date.now() - idx * 3600000;
      const scoreNum = typeof s.score === "number" ? s.score : null;
      items.push({
        id: `scan-${idx}-${ts}`,
        type: "scan",
        title: "Domain Reconnaissance Scan",
        target: String(s.target || "Target Host"),
        timestamp: ts,
        timeLabel: timeAgo(s.date ? String(s.date) : ts),
        status: scoreNum !== null ? (scoreNum >= 75 ? "success" : scoreNum >= 50 ? "warning" : "error") : "success",
        score: scoreNum,
        path: "/scanner",
      });
    });

    // 2. Web Security Scans
    websecHistory.forEach((w, idx) => {
      const ts = w.scannedAt ? new Date(String(w.scannedAt)).getTime() : Date.now() - idx * 3600000;
      const scoreNum = typeof w.score === "number" ? w.score : null;
      let target = String(w.url || "Web Target");
      try {
        if (w.finalUrl) target = new URL(String(w.finalUrl)).hostname;
      } catch {
        // fallback
      }
      items.push({
        id: `websec-${idx}-${ts}`,
        type: "websec",
        title: "Web Security & Header Audit",
        target,
        timestamp: ts,
        timeLabel: timeAgo(w.scannedAt ? String(w.scannedAt) : ts),
        status: scoreNum !== null ? (scoreNum >= 75 ? "success" : scoreNum >= 50 ? "warning" : "error") : "success",
        score: scoreNum,
        path: "/web-security",
      });
    });

    // 3. Email Checks
    emailHistory.forEach((e, idx) => {
      const ts = typeof e.scannedAt === "number" ? e.scannedAt : new Date(String(e.scannedAt || Date.now())).getTime();
      const scoreNum = typeof e.score === "number" ? e.score : null;
      items.push({
        id: `email-${idx}-${ts}`,
        type: "email",
        title: "Email Anti-Spoofing & DMARC",
        target: String(e.email || e.domain || "Email Address"),
        timestamp: ts,
        timeLabel: timeAgo(ts),
        status: scoreNum !== null ? (scoreNum >= 80 ? "success" : scoreNum >= 60 ? "warning" : "error") : "success",
        score: scoreNum,
        path: "/email-security",
      });
    });

    // 4. Crypto operations
    cryptoHistory.forEach((c, idx) => {
      const ts = typeof c.ts === "number" ? c.ts : Date.now() - idx * 3600000;
      items.push({
        id: `crypto-${idx}-${ts}`,
        type: "crypto",
        title: c.action === "encrypt" ? `AES-256 Encrypted (${String(c.kind || "Text")})` : `Token Decrypted (${String(c.kind || "Payload")})`,
        target: String(c.filename || (c.fingerprint ? `fp:${String(c.fingerprint).slice(0, 12)}...` : "Authenticated Payload")),
        timestamp: ts,
        timeLabel: timeAgo(ts),
        status: c.ok !== false ? "success" : "error",
        score: null,
        path: "/crypto",
      });
    });

    // 5. Research Sessions
    researchHistory.forEach((r, idx) => {
      const ts = r.date ? new Date(String(r.date)).getTime() : Date.now() - idx * 3600000;
      items.push({
        id: `research-${idx}-${ts}`,
        type: "research",
        title: `AI Threat Intel (${String(r.persona || "Security")})`,
        target: r.topic ? String(r.topic).slice(0, 45) + "..." : "Gemini Threat Synthesis",
        timestamp: ts,
        timeLabel: timeAgo(r.date ? String(r.date) : ts),
        status: "success",
        score: null,
        path: "/research",
      });
    });

    // 6. Simulations
    simHistory.forEach((s, idx) => {
      const ts = s.date ? new Date(String(s.date)).getTime() : Date.now() - idx * 3600000;
      items.push({
        id: `sim-${idx}-${ts}`,
        type: "sim",
        title: `Sandbox Simulation (${String(s.title || "Cyber Triage")})`,
        target: String(s.categoryId || "Threat Scenario"),
        timestamp: ts,
        timeLabel: timeAgo(s.date ? String(s.date) : ts),
        status: "success",
        score: null,
        path: "/simulations",
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, researchHistory, simHistory]);

  const latestAuditTime = useMemo(() => {
    if (recentActivities.length === 0) return null;
    return recentActivities[0].timeLabel;
  }, [recentActivities]);

  const topFinding = useMemo(() => {
    for (const dom of executiveReport.domains) {
      const critical = dom.findings.find((f) => f.severity === "critical" || f.severity === "high");
      if (critical) {
        return {
          domain: critical.target,
          recommendation: critical.recommendation,
        };
      }
    }
    return null;
  }, [executiveReport]);

  const clearAllHistory = () => {
    const keys = [
      SCAN_HISTORY_KEY,
      SCAN_HISTORY_V2_KEY,
      WEBSEC_HISTORY_KEY,
      EMAIL_HISTORY_KEY,
      CRYPTO_HISTORY_KEY,
      PASSWORD_HISTORY_KEY,
      "pasco_password_breaches",
      RESEARCH_HISTORY_KEY,
      SIMULATIONS_HISTORY_KEY,
    ];

    keys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });

    setScanHistory([]);
    setWebsecHistory([]);
    setEmailHistory([]);
    setCryptoHistory([]);
    setPasswordHistory([]);
    setResearchHistory([]);
    setSimHistory([]);

    toast.success("All platform telemetry cleared");
  };

  return (
    <PageTransition className="space-y-6 sm:space-y-8" data-tour="dashboard">
      {/* Animated Header Banner */}
      <AnimatedPageHeading
        title="Security Command Center"
        subtitle="Unified cyber defense telemetry, live network reconnaissance, authenticated cryptography & simulation suites."
        badgeText="TELEMETRY SYNCHRONIZED"
        badgeVariant="cyan"
        statusText={
          metrics.systemStatus === "operational"
            ? "All Defensive Systems Operational"
            : metrics.systemStatus === "warning"
            ? "Remediation Recommended"
            : "Critical Deficits Detected"
        }
        statusColor={
          metrics.systemStatus === "operational"
            ? "emerald"
            : metrics.systemStatus === "warning"
            ? "amber"
            : "rose"
        }
        icon={Shield}
      />

      {/* Signature Centerpiece: Defense Posture Radial Hero */}
      <RevealOnScroll direction="scale">
        <DefensePostureHero
          score={metrics.avgScore}
          totalAudits={metrics.totalScans}
          criticalIssues={metrics.criticalAndHighCount}
          factors={defenseFactors}
          lastAuditTime={latestAuditTime}
          systemStatus={metrics.systemStatus}
          onOpenReportModal={() => setIsReportModalOpen(true)}
        />
      </RevealOnScroll>

      {/* Operational Metrics Grid */}
      <MetricsGrid
        totalScans={metrics.totalScans}
        criticalAndHighCount={metrics.criticalAndHighCount}
        cleanChecksCount={metrics.cleanChecksCount}
        cryptoCount={metrics.cryptoCount}
        researchCount={metrics.researchCount}
      />

      {/* AI Threat Briefing Section (Evidence-Backed) */}
      <RevealOnScroll direction="up">
        <AIBriefingSection
          score={metrics.avgScore}
          totalScans={metrics.totalScans}
          criticalIssues={metrics.criticalAndHighCount}
          topRiskDomain={topFinding?.domain || null}
          topRecommendation={topFinding?.recommendation || null}
          cleanChecksCount={metrics.cleanChecksCount}
        />
      </RevealOnScroll>

      {/* Telemetry Visualizer Charts (Posture Trend, Severity, Category) */}
      <RevealOnScroll direction="up">
        <SecurityCharts
          timelineData={timelineData}
          severityData={severityData}
          categoryData={categoryData}
        />
      </RevealOnScroll>

      {/* Security Suites & Interactive Labs Grid */}
      <SecuritySuitesGrid />

      {/* Operational Activity Timeline Feed */}
      <RevealOnScroll direction="up">
        <ActivityTimeline
          activities={recentActivities}
          onClearHistory={clearAllHistory}
        />
      </RevealOnScroll>

      {/* Stage 5 Executive Defense Report Modal */}
      <ExportReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </PageTransition>
  );
}
