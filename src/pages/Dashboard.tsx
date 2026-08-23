import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { SecurityGauge } from "@/components/security/SecurityGauge";
import { PageTransition } from "@/components/motion/PageTransition";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { AnimatedPageHeading } from "@/components/motion/AnimatedPageHeading";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Shield,
  Key,
  Search,
  Scan,
  ArrowRight,
  Clock,
  TrendingUp,
  Activity,
  Zap,
  Lock,
  Globe,
  MailCheck,
  Trash2,
  Cpu,
  Layers,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ExportReportModal } from "@/components/security/ExportReportModal";

/* -------------------- Storage Keys across all PascoAI suites -------------------- */
const SCAN_HISTORY_KEY = "pasco_scan_history_v1";
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

type UnifiedActivity = {
  id: string;
  type: "scan" | "websec" | "email" | "crypto" | "password" | "research" | "sim";
  title: string;
  target: string;
  timestamp: number;
  timeLabel: string;
  status: "success" | "warning" | "error";
  score?: number | null;
  path: string;
};

const quickActionTools = [
  {
    icon: Scan,
    label: "Domain Scanner",
    description: "Real-time host reconnaissance, open services & headers",
    path: "/scanner",
    color: "text-primary",
    glow: "cyan" as const,
    badge: "Scanner",
  },
  {
    icon: Globe,
    label: "Web Security Suite",
    description: "Live TLS cert, DNS records & cookie flag security audit",
    path: "/web-security",
    color: "text-emerald-400",
    glow: "emerald" as const,
    badge: "TLS / DNS",
  },
  {
    icon: Lock,
    label: "Crypto Lab",
    description: "AES-256-GCM authenticated text & file encryption engine",
    path: "/crypto",
    color: "text-secondary",
    glow: "purple" as const,
    badge: "WebCrypto",
  },
  {
    icon: MailCheck,
    label: "Email Security",
    description: "DNS MX, SPF, DMARC validation & phishing heuristics",
    path: "/email-security",
    color: "text-amber-400",
    glow: "amber" as const,
    badge: "Anti-Spoof",
  },
  {
    icon: Key,
    label: "Password Lab",
    description: "NIST entropy math & HaveIBeenPwned API verification",
    path: "/password-lab",
    color: "text-primary",
    glow: "cyan" as const,
    badge: "Entropy",
  },
  {
    icon: Search,
    label: "AI Research Suite",
    description: "Gemini-powered Blue/Red/SOC security threat research",
    path: "/research",
    color: "text-emerald-400",
    glow: "emerald" as const,
    badge: "AI Threat",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const [scanHistory, setScanHistory] = useState<Record<string, unknown>[]>([]);
  const [websecHistory, setWebsecHistory] = useState<Record<string, unknown>[]>([]);
  const [emailHistory, setEmailHistory] = useState<Record<string, unknown>[]>([]);
  const [cryptoHistory, setCryptoHistory] = useState<Record<string, unknown>[]>([]);
  const [passwordHistory, setPasswordHistory] = useState<Record<string, unknown>[]>([]);
  const [researchHistory, setResearchHistory] = useState<Record<string, unknown>[]>([]);
  const [simHistory, setSimHistory] = useState<Record<string, unknown>[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    setScanHistory(safeJson(localStorage.getItem(SCAN_HISTORY_KEY), []));
    setWebsecHistory(safeJson(localStorage.getItem(WEBSEC_HISTORY_KEY), []));
    setEmailHistory(safeJson(localStorage.getItem(EMAIL_HISTORY_KEY), []));
    setCryptoHistory(safeJson(localStorage.getItem(CRYPTO_HISTORY_KEY), []));
    setPasswordHistory(safeJson(localStorage.getItem(PASSWORD_HISTORY_KEY), []));
    setResearchHistory(safeJson(localStorage.getItem(RESEARCH_HISTORY_KEY), []));
    setSimHistory(safeJson(localStorage.getItem(SIMULATIONS_HISTORY_KEY), []));
  }, []);

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
    const hasLowScore = allScores.some((s) => s < 60);

    return {
      totalScans,
      avgScore,
      cryptoCount,
      researchCount,
      systemStatus: hasLowScore ? ("warning" as const) : ("operational" as const),
    };
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, researchHistory]);

  const recentActivity: UnifiedActivity[] = useMemo(() => {
    const items: UnifiedActivity[] = [];

    // 1. Domain Scans
    scanHistory.forEach((s, idx) => {
      const ts = s.date ? new Date(s.date).getTime() : Date.now() - idx * 3600000;
      items.push({
        id: `scan-${idx}`,
        type: "scan",
        title: "Domain Security Scan",
        target: s.target || "Target Host",
        timestamp: ts,
        timeLabel: timeAgo(s.date || ts),
        status: s.score >= 75 ? "success" : s.score >= 50 ? "warning" : "error",
        score: s.score,
        path: "/scanner",
      });
    });

    // 2. Web Security Scans
    websecHistory.forEach((w, idx) => {
      const ts = w.scannedAt ? new Date(w.scannedAt).getTime() : Date.now() - idx * 3600000;
      items.push({
        id: `websec-${idx}`,
        type: "websec",
        title: "Web Suite Audit",
        target: w.finalUrl ? new URL(w.finalUrl).hostname : w.url || "Web Target",
        timestamp: ts,
        timeLabel: timeAgo(w.scannedAt || ts),
        status: w.score >= 75 ? "success" : w.score >= 50 ? "warning" : "error",
        score: w.score,
        path: "/web-security",
      });
    });

    // 3. Email Checks
    emailHistory.forEach((e, idx) => {
      const ts = typeof e.scannedAt === "number" ? e.scannedAt : new Date(e.scannedAt || Date.now()).getTime();
      items.push({
        id: `email-${idx}`,
        type: "email",
        title: "Email Security Verification",
        target: e.email || "Email Address",
        timestamp: ts,
        timeLabel: timeAgo(ts),
        status: e.score >= 80 ? "success" : e.score >= 60 ? "warning" : "error",
        score: e.score,
        path: "/email-security",
      });
    });

    // 4. Crypto operations
    cryptoHistory.forEach((c, idx) => {
      const ts = c.ts || Date.now() - idx * 3600000;
      items.push({
        id: `crypto-${idx}`,
        type: "crypto",
        title: c.action === "encrypt" ? `AES-256 Encrypted (${c.kind})` : `Token Decrypted (${c.kind})`,
        target: c.filename || (c.fingerprint ? `fp:${c.fingerprint.slice(0, 10)}...` : "Secure Payload"),
        timestamp: ts,
        timeLabel: timeAgo(ts),
        status: c.ok ? "success" : "error",
        score: null,
        path: "/crypto",
      });
    });

    // 5. Research Sessions
    researchHistory.forEach((r, idx) => {
      const ts = r.date ? new Date(r.date).getTime() : Date.now() - idx * 3600000;
      items.push({
        id: `research-${idx}`,
        type: "research",
        title: `AI Research (${r.persona || "Security"})`,
        target: r.topic ? r.topic.slice(0, 40) + "..." : "Cybersecurity Research",
        timestamp: ts,
        timeLabel: timeAgo(r.date || ts),
        status: "success",
        score: null,
        path: "/research",
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  }, [scanHistory, websecHistory, emailHistory, cryptoHistory, researchHistory]);

  const clearAllHistory = () => {
    if (!confirm("Clear all activity history across all security tools?")) return;

    localStorage.removeItem(SCAN_HISTORY_KEY);
    localStorage.removeItem(WEBSEC_HISTORY_KEY);
    localStorage.removeItem(EMAIL_HISTORY_KEY);
    localStorage.removeItem(CRYPTO_HISTORY_KEY);
    localStorage.removeItem(PASSWORD_HISTORY_KEY);
    localStorage.removeItem(RESEARCH_HISTORY_KEY);
    localStorage.removeItem(SIMULATIONS_HISTORY_KEY);

    setScanHistory([]);
    setWebsecHistory([]);
    setEmailHistory([]);
    setCryptoHistory([]);
    setPasswordHistory([]);
    setResearchHistory([]);
    setSimHistory([]);

    toast.success("All platform history cleared");
  };

  return (
    <PageTransition className="space-y-6 sm:space-y-8" data-tour="dashboard">
      {/* Animated Header Banner */}
      <AnimatedPageHeading
        title="Security Command Center"
        subtitle="Unified threat intelligence, live network inspection, cryptography & simulation suites."
        badgeText="LIVE TELEMETRY"
        badgeVariant="cyan"
        statusText={metrics.systemStatus === "operational" ? "All Systems Operational" : "Action Required"}
        statusColor={metrics.systemStatus === "operational" ? "emerald" : "amber"}
        icon={Shield}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReportModalOpen(true)}
            className="text-xs font-mono border-primary/30 hover:border-primary/60 text-primary bg-primary/5 hover:bg-primary/10 shadow-[0_0_12px_rgba(34,211,238,0.12)] active:scale-95 transition-all"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-primary" />
            <span>Export Executive Briefing</span>
          </Button>
        }
      />

      {/* Top Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left: Overall Health Dial */}
        <RevealOnScroll direction="scale" className="lg:col-span-4 h-full">
          <div data-tour="defense-gauge" className="h-full">
            <InteractiveCard glowColor="cyan" className="p-6 flex flex-col items-center justify-center h-full min-h-[220px]">
              <SecurityGauge score={metrics.avgScore} size="lg" label="Defense Score" />
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span>Aggregated posture rating</span>
              </div>
            </InteractiveCard>
          </div>
        </RevealOnScroll>

        {/* Right: Key Stat Cards */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <RevealOnScroll direction="up" delay={50}>
            <InteractiveCard glowColor="cyan" className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Scans Run
                </span>
                <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
                  <Scan className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 sm:mt-4">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-primary">
                  <CountUp end={metrics.totalScans} />
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Domains & headers</p>
              </div>
            </InteractiveCard>
          </RevealOnScroll>

          <RevealOnScroll direction="up" delay={100}>
            <InteractiveCard glowColor="purple" className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Crypto Ops
                </span>
                <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/15 text-secondary">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 sm:mt-4">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-secondary">
                  <CountUp end={metrics.cryptoCount} />
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">AES-256 tokens</p>
              </div>
            </InteractiveCard>
          </RevealOnScroll>

          <RevealOnScroll direction="up" delay={150} className="col-span-2 sm:col-span-1">
            <InteractiveCard glowColor="emerald" className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI Runs
                </span>
                <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Search className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 sm:mt-4">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                  <CountUp end={metrics.researchCount} />
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Threat reports</p>
              </div>
            </InteractiveCard>
          </RevealOnScroll>

          {/* Quick Security Tip Banner */}
          <RevealOnScroll direction="up" delay={200} className="col-span-2 sm:col-span-3">
            <GlassPanel variant="cyber" className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <p className="text-xs sm:text-sm text-foreground">
                  <span className="font-semibold text-amber-400">Pro Recommendation:</span> Enforce HSTS preload directives and strict CSP headers to protect web services against downgrade attacks.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/web-security")}
                className="text-xs text-primary hover:text-primary hover:bg-primary/10 self-end sm:self-auto shrink-0 font-medium"
              >
                Audit Headers <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </GlassPanel>
          </RevealOnScroll>
        </div>
      </div>

      {/* Quick Launchpad */}
      <div data-tour="security-suites">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Layers className="w-4 h-4 text-primary" />
            Security Suites & Interactive Labs
          </h2>
          <span className="text-xs text-muted-foreground font-mono">7 Engines Active</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {quickActionTools.map((tool, idx) => (
            <RevealOnScroll key={tool.label} direction="up" delay={40 * idx}>
              <InteractiveCard
                glowColor={tool.glow}
                onClick={() => navigate(tool.path)}
                className="p-4 sm:p-5 cursor-pointer group hover:border-primary/50 h-full flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className={`p-2.5 rounded-xl bg-card border border-border/80 ${tool.color} group-hover:scale-110 group-hover:shadow-neon-cyan-sm transition-all duration-300`}>
                      <tool.icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground">
                      {tool.badge}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm sm:text-base font-bold group-hover:text-primary transition-colors">
                    {tool.label}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {tool.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-xs font-mono text-primary">
                  <span>Open Suite</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </InteractiveCard>
            </RevealOnScroll>
          ))}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <GlassPanel variant="default" className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-4 border-b border-border/60 gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-sm sm:text-base">Recent Platform Telemetry</h3>
              <p className="text-xs text-muted-foreground">Cross-module operational history</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllHistory}
            disabled={recentActivity.length === 0}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 self-end sm:self-auto h-8"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear Log
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No Recorded Telemetry"
              description="Run a vulnerability scan, inspect TLS certificates, or derive cryptographic tokens to generate live activity."
              actionLabel="Launch Domain Scanner"
              onAction={() => navigate("/scanner")}
            />
          ) : (
            recentActivity.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(item.path)}
                className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      item.type === "scan"
                        ? "bg-primary/10 text-primary"
                        : item.type === "websec"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : item.type === "email"
                        ? "bg-amber-500/10 text-amber-400"
                        : item.type === "crypto"
                        ? "bg-secondary/15 text-secondary"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {item.type === "scan" && <Scan className="w-4 h-4" />}
                    {item.type === "websec" && <Globe className="w-4 h-4" />}
                    {item.type === "email" && <MailCheck className="w-4 h-4" />}
                    {item.type === "crypto" && <Lock className="w-4 h-4" />}
                    {item.type === "research" && <Search className="w-4 h-4" />}
                    {item.type === "password" && <Key className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold group-hover:text-primary transition-colors truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {item.target}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {typeof item.score === "number" && (
                    <Badge
                      variant="outline"
                      className={`font-mono text-[11px] ${
                        item.score >= 80
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                          : item.score >= 60
                          ? "border-amber-500/40 text-amber-400 bg-amber-500/5"
                          : "border-red-500/40 text-red-400 bg-red-500/5"
                      }`}
                    >
                      {item.score}/100
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                    {item.timeLabel}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))
          )}
        </div>
      </GlassPanel>

      {/* Stage 5 Executive Defense Report Modal */}
      <ExportReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </PageTransition>
  );
}
