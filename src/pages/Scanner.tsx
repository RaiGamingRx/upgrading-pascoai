import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { SecurityGauge } from "@/components/security/SecurityGauge";
import { PageTransition } from "@/components/motion/PageTransition";
import { AnimatedPageHeading } from "@/components/motion/AnimatedPageHeading";
import { AnimatedRadar } from "@/components/motion/AnimatedRadar";
import { PulseIndicator } from "@/components/motion/PulseIndicator";
import {
  Shield,
  Scan,
  Globe,
  CheckCircle,
  Info,
  Loader2,
  Download,
  RefreshCw,
  Clock,
  Target,
  Lock,
  Bug,
  Eye,
  Network,
  AlertTriangle,
  FileText,
  Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { runRealScan, type RealScanResult, type ScanStatus } from "@/lib/scanner";
import { useAuth } from "@/hooks/useAuth";
import { scansApi, assetsApi } from "@/lib/api";

interface ScanResultUI {
  category: string;
  icon: React.ElementType;
  findings: {
    title: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    status: ScanStatus;
    description: string;
    recommendation: string;
    evidence?: Record<string, string | number | boolean | string[]>;
  }[];
}

type HistoryItem = { target: string; date: string; score: number; status: ScanStatus; source?: "cloud" | "demo" };

const DEMO_HISTORY_KEY = "pasco_demo_scan_history_v1";

function isTargetFormatValid(value: string) {
  try {
    const trimmed = value.trim();
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const allowedProtocol = url.protocol === "http:" || url.protocol === "https:";
    const allowedPort = !url.port || url.port === (url.protocol === "https:" ? "443" : "80");
    return Boolean(url.hostname) && allowedProtocol && allowedPort && !url.username && !url.password && !url.hash && url.pathname === "/" && !url.search;
  } catch {
    return false;
  }
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function Scanner() {
  const { user, isDemo } = useAuth();
  const [target, setTarget] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResultUI[] | null>(null);
  const [threatScore, setThreatScore] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [lastScanTarget, setLastScanTarget] = useState("");
  const [lastScannedAt, setLastScannedAt] = useState("");
  const [scanHistory, setScanHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const scanInFlight = useRef(false);

  // Load history based on auth context
  const loadHistory = useCallback(async () => {
    if (user && !isDemo) {
      // REAL USER: Load directly from Neon PostgreSQL via authenticated API
      setIsLoadingHistory(true);
      try {
        const [{ scans }, { assets }] = await Promise.all([
          scansApi.list(),
          assetsApi.list(),
        ]);

        const assetMap = new Map<string, string>();
        assets.forEach((a: any) => assetMap.set(a.id, a.target_value || a.targetValue));

        const historyItems: HistoryItem[] = (scans || [])
          .filter((s: any) => s.overall_score !== null && s.overall_score !== undefined)
          .map((s: any) => {
            const targetVal = assetMap.get(s.asset_id || s.assetId) || "Hostname";
            const dateStr = s.created_at || s.createdAt || new Date().toISOString();
            const execStatus = s.execution_status || s.executionStatus;
            const status: ScanStatus =
              execStatus === "verified"
                ? "verified"
                : execStatus === "partial"
                ? "partial"
                : execStatus === "failed"
                ? "failed"
                : "verified";

            return {
              target: targetVal,
              date: typeof dateStr === "string" ? dateStr.slice(0, 10) : todayISO(),
              score: Number(s.overall_score ?? s.overallScore),
              status,
              source: "cloud",
            };
          });

        setScanHistory(historyItems.slice(0, 15));
      } catch (err) {
        console.error("Failed to load authenticated scans from Neon:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    } else {
      // DEMO USER: Load from isolated session storage (ZERO Neon reads/writes)
      try {
        const raw = sessionStorage.getItem(DEMO_HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setScanHistory(
              parsed
                .filter(
                  (item): item is HistoryItem =>
                    item &&
                    typeof item.target === "string" &&
                    typeof item.date === "string" &&
                    typeof item.score === "number" &&
                    ["verified", "partial", "failed", "unavailable"].includes(item.status ?? "verified")
                )
                .map((item) => ({ ...item, status: item.status ?? "verified", source: "demo" }))
            );
          }
        }
      } catch {
        // ignore
      }
    }
  }, [user, isDemo]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const clearScanHistory = () => {
    if (isDemo || !user) {
      try {
        sessionStorage.removeItem(DEMO_HISTORY_KEY);
      } catch {
        // ignore
      }
      setScanHistory([]);
      toast.success("Demo scan history cleared");
    } else {
      setScanHistory([]);
      toast.success("Workspace scan view refreshed");
    }
  };

  const iconMap: Record<string, React.ElementType> = useMemo(
    () => ({
      Eye,
      Bug,
      Network,
      Lock,
    }),
    []
  );

  const runScan = async (requestedTarget = target) => {
    if (scanInFlight.current || isScanning) return;
    const raw = requestedTarget.trim();
    if (!raw) {
      toast.error("Please enter a domain or IP address");
      return;
    }
    if (!isTargetFormatValid(raw)) {
      toast.error("Enter a public hostname or IP using HTTP or HTTPS.");
      return;
    }

    scanInFlight.current = true;
    setIsScanning(true);
    setScanProgress(20);
    setScanResults(null);
    setThreatScore(null);
    setScanStatus(null);

    toast.info("Connecting to server-side security engine...");

    const progressInterval = setInterval(() => {
      setScanProgress((prev) => (prev >= 85 ? 85 : prev + 15));
    }, 180);

    try {
      const res: RealScanResult = await runRealScan(raw);

      const uiResults: ScanResultUI[] = res.results.map((r) => {
        const Icon = iconMap[r.icon] ?? Info;
        return {
          category: r.category,
          icon: Icon,
          findings: r.findings,
        };
      });

      setScanResults(uiResults);
      setThreatScore(res.score);
      setScanStatus(res.status);
      setLastScanTarget(res.target);
      setLastScannedAt(res.scannedAt);

      if (res.score != null) {
        const item: HistoryItem = {
          target: res.target,
          date: todayISO(),
          score: res.score,
          status: res.status,
          source: user && !isDemo ? "cloud" : "demo",
        };

        if (user && !isDemo) {
          // REAL USER: Persist into Neon PostgreSQL via authenticated RLS pipeline
          try {
            await scansApi.create({
              target: res.target,
              targetType: "hostname",
              overallScore: res.score,
              isVerified: res.status === "verified",
              rawSummary: {
                status: res.status,
                scannedAt: res.scannedAt,
                totalFindings: res.results.reduce((acc, c) => acc + c.findings.length, 0),
              },
              findings: res.results.flatMap((cat) =>
                cat.findings.map((f) => ({
                  domainCategory: cat.category,
                  title: f.title,
                  description: f.description,
                  severity: f.severity,
                  recommendation: f.recommendation,
                  verificationClass: f.status === "verified" ? "VERIFIED_EVIDENCE" : "IMPORTED_UNVERIFIED",
                }))
              ),
            });
            // Update state
            setScanHistory((prev) => [item, ...prev.filter((x) => x.target !== item.target)].slice(0, 15));
          } catch (dbErr) {
            console.error("Failed to persist scan to Neon PostgreSQL:", dbErr);
            toast.error("Scan verified, but failed to save record to cloud database.");
          }
        } else {
          // DEMO USER: Session-only storage (ZERO Neon writes)
          const updated = [item, ...scanHistory.filter((x) => x.target !== item.target)].slice(0, 15);
          setScanHistory(updated);
          sessionStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(updated));
        }
      }

      toast[res.status === "verified" ? "success" : "warning"](`Security scan ${res.status}.`);
    } catch (e: unknown) {
      setScanStatus("failed");
      toast.error(e instanceof Error ? e.message : "Scan failed. Please verify the target.");
    } finally {
      clearInterval(progressInterval);
      setScanProgress(100);
      setTimeout(() => {
        scanInFlight.current = false;
        setIsScanning(false);
        setScanProgress(0);
      }, 300);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/40">CRITICAL</Badge>;
      case "high":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40">HIGH</Badge>;
      case "medium":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">MEDIUM</Badge>;
      case "low":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">LOW</Badge>;
      default:
        return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/40">INFO</Badge>;
    }
  };

  const exportReport = (format: "json" | "txt" = "json") => {
    if (!scanResults || !scanStatus) return;

    const payload = {
      platform: "PascoAI Cybersecurity Intelligence Suite",
      target: lastScanTarget,
      score: threatScore,
      status: scanStatus,
      scannedAt: lastScannedAt,
      results: scanResults,
    };

    if (format === "txt") {
      const lines = [
        "========================================",
        "  PASCOAI CYBERSECURITY SCAN REPORT",
        "========================================",
        `Target: ${payload.target}`,
        `Score: ${payload.score == null ? "Unavailable" : `${payload.score}/100`}`,
        `Scanned At: ${payload.scannedAt}`,
        "----------------------------------------",
        "",
        ...scanResults.flatMap((cat) => [
          `[CATEGORY: ${cat.category.toUpperCase()}]`,
          ...cat.findings.map((f) => `• [${f.severity.toUpperCase()}] ${f.title}\n  Details: ${f.description}\n  Remediation: ${f.recommendation}`),
          "",
        ]),
      ].join("\n");

      const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pasco-scan-${lastScanTarget.replace(/[^a-zA-Z0-9.-]/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported TXT report");
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pasco-scan-${lastScanTarget.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported JSON report");
  };

  return (
    <PageTransition className="space-y-6 max-w-6xl">
      {/* Animated Header */}
      <AnimatedPageHeading
        title="Cybersecurity Scanner"
        subtitle="Server-side non-intrusive security analysis, DNS reconnaissance, TLS inspection, and security header audit."
        badgeText="SSRF-RESTRICTED"
        badgeVariant="cyan"
        statusText={isScanning ? "Active Probing in Progress" : "Scanner Ready"}
        statusColor={isScanning ? "amber" : "emerald"}
        icon={Scan}
      />

      {/* Target Input Card */}
      <GlassPanel variant="cyber">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="target" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Domain or Public IP Address
            </Label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
              <Input
                id="target"
                placeholder="example.com, github.com, or public IP"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isScanning && runScan()}
                className="pl-10 font-mono text-sm bg-black/40 border-white/10 focus:border-cyan-500/50"
                disabled={isScanning}
              />
            </div>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => runScan()}
              disabled={!target.trim() || !isTargetFormatValid(target) || isScanning}
              className="w-full md:w-auto min-w-[140px] bg-primary text-primary-foreground font-semibold shadow-neon-cyan active:scale-95 transition-all"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 mr-2" />
                  Execute Scan
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Live Progress Bar with Radar Telemetry */}
        {isScanning && (
          <div className="mt-5 pt-4 border-t border-white/10 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AnimatedRadar size={44} active color="cyan" />
                <div>
                  <p className="text-xs font-mono font-medium text-cyan-400 flex items-center gap-1.5">
                    <PulseIndicator color="cyan" size="sm" pulse />
                    Active Surface Inspection
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Querying DNS, TLS socket & HTTP security headers...
                  </p>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-cyan-400">{scanProgress}%</span>
            </div>
            <Progress value={scanProgress} className="h-1.5 bg-white/5" />
          </div>
        )}
      </GlassPanel>

      {/* Results Overview */}
      {scanResults && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Score Banner */}
          <InteractiveCard glowColor="cyan" className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                {threatScore != null ? <SecurityGauge score={threatScore} size="lg" label="" /> : <Badge variant="outline" className="text-amber-400 border-amber-500/30">SCORE UNAVAILABLE</Badge>}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-2xl font-bold font-mono text-foreground">{lastScanTarget}</h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      {scanStatus.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scanResults.reduce((acc, c) => acc + c.findings.length, 0)} evidence items across 4 categories. {threatScore == null ? "A posture score is unavailable because the transport check did not complete." : "Score reflects verified security observations only."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => runScan()} disabled={isScanning}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Re-scan
                </Button>
                <Button variant="secondary" size="sm" onClick={() => exportReport("json")}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportReport("txt")}>
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  TXT
                </Button>
              </div>
            </div>
          </InteractiveCard>

          {/* Categorized Findings Tabs */}
          <Tabs defaultValue={scanResults[0]?.category} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 bg-black/40 p-1.5 border border-white/10 rounded-xl">
              {scanResults.map((cat) => (
                <TabsTrigger
                  key={cat.category}
                  value={cat.category}
                  className="text-xs md:text-sm py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 border border-transparent rounded-lg"
                >
                  <cat.icon className="w-4 h-4 mr-2" />
                  {cat.category}
                </TabsTrigger>
              ))}
            </TabsList>

            {scanResults.map((cat) => (
              <TabsContent key={cat.category} value={cat.category} className="space-y-3 mt-4">
                {cat.findings.map((f, idx) => (
                  <GlassPanel key={idx} variant="default" className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="font-semibold text-sm text-foreground">{f.title}</h4>
                          {getSeverityBadge(f.severity)}
                          {f.status !== "verified" && <Badge variant="outline" className="text-cyan-400 border-cyan-500/30">{f.status.toUpperCase()}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                        <div className="flex items-start gap-2.5 mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/5">
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <span className="font-semibold text-emerald-400">Remediation: </span>
                            <span className="text-foreground/90 font-mono">{f.recommendation}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlassPanel>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Scan History */}
      {!isScanning && (
        <GlassPanel variant="default" className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Target History</h3>
            </div>
            {scanHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={clearScanHistory}
                disabled={scanHistory.length === 0}
              >
                Clear
              </Button>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {scanHistory.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No past scans recorded. Enter a target above to start.
              </div>
            ) : (
              scanHistory.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setTarget(item.target);
                    runScan(item.target);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <Target className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                    <span className="font-mono text-sm group-hover:text-cyan-300 transition-colors">{item.target}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={item.score >= 80 ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>
                      {item.score}/100
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{item.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassPanel>
      )}
    </PageTransition>
  );
}
