import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { SecurityGauge } from "@/components/security/SecurityGauge";
import { PageTransition } from "@/components/motion/PageTransition";
import { AnimatedPageHeading } from "@/components/motion/AnimatedPageHeading";
import {
  Globe,
  Lock,
  FileCode,
  Network,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  Download,
  RefreshCw,
  Cookie,
  Server,
  Layers,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { scanWebsite, type WebSecurityResult } from "@/lib/webSecurity";

const HISTORY_KEY = "pasco_websec_history_v1";

const HEADER_DEFINITIONS: Record<string, { purpose: string; recommend: string }> = {
  "content-security-policy": {
    purpose: "Restricts script, styling, and frame sources to prevent XSS and malicious data injection.",
    recommend: "default-src 'self'; script-src 'self'; object-src 'none'",
  },
  "strict-transport-security": {
    purpose: "Enforces HTTPS encryption and prevents SSL-stripping downgrade attacks.",
    recommend: "max-age=31536000; includeSubDomains; preload",
  },
  "x-frame-options": {
    purpose: "Controls whether the site can be rendered inside an iframe, preventing clickjacking.",
    recommend: "DENY or SAMEORIGIN",
  },
  "x-content-type-options": {
    purpose: "Blocks browser MIME-type sniffing to prevent executing non-executable files.",
    recommend: "nosniff",
  },
  "referrer-policy": {
    purpose: "Controls how much referrer information is sent in HTTP headers during navigation.",
    recommend: "strict-origin-when-cross-origin",
  },
  "permissions-policy": {
    purpose: "Controls browser feature access (camera, microphone, geolocation, payment).",
    recommend: "camera=(), microphone=(), geolocation=()",
  },
};

export default function WebSecurity() {
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<WebSecurityResult | null>(null);
  const [history, setHistory] = useState<WebSecurityResult[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const clearHistory = () => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
    setHistory([]);
    toast.success("Web security history cleared");
  };

  async function onScan(targetUrl?: string) {
    const toScan = (targetUrl || url).trim();
    if (!toScan) {
      toast.error("Please enter a website URL");
      return;
    }

    setErr(null);
    setLoading(true);

    try {
      const r = await scanWebsite(toScan);
      setResult(r);

      const updated = [r, ...history.filter((h) => h.url !== r.url)].slice(0, 15);
      setHistory(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

      toast.success(`Web security audit complete (Score: ${r.score}/100)`);
    } catch (e: any) {
      setErr(e?.message || "Scan failed");
      toast.error(e?.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const exportReport = (format: "json" | "txt" = "json") => {
    if (!result) return;

    if (format === "txt") {
      const lines = [
        "========================================",
        "  PASCOAI WEB SECURITY AUDIT REPORT",
        "========================================",
        `Target URL: ${result.finalUrl || result.url}`,
        `Score: ${result.score}/100 (Grade ${result.grade})`,
        `Status Code: ${result.statusCode}`,
        `HTTPS: ${result.https ? "Yes" : "No"}`,
        `Scanned At: ${result.scannedAt}`,
        "----------------------------------------",
        "",
        "[SECURITY HEADERS]",
        ...Object.entries(result.headerStatus).map(
          ([k, v]) => `• ${k}: ${v.present ? "PRESENT (" + (v.value || "") + ")" : "MISSING"}`
        ),
        "",
        "[SSL / TLS CERTIFICATE]",
        result.certificate
          ? `Issuer: ${result.certificate.issuer}\nValid From: ${result.certificate.validFrom}\nValid To: ${result.certificate.validTo}\nDays Remaining: ${result.certificate.daysRemaining}`
          : "No certificate detected",
        "",
        "[ISSUES DETECTED]",
        ...(result.issues.length > 0 ? result.issues.map((i) => `• ${i}`) : ["No issues identified"]),
      ].join("\n");

      const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `websec-${new URL(result.url).hostname}.txt`;
      a.click();
      URL.revokeObjectURL(dlUrl);
      toast.success("Exported TXT report");
      return;
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `websec-${new URL(result.url).hostname}.json`;
    a.click();
    URL.revokeObjectURL(dlUrl);
    toast.success("Exported JSON report");
  };

  return (
    <PageTransition className="space-y-6 max-w-6xl">
      {/* Animated Header */}
      <AnimatedPageHeading
        title="Web Security Scanner Suite"
        subtitle="Inspect HTTP security headers, TLS peer certificates, DNS infrastructure records, and cookie safety attributes."
        badgeText="LIVE PROTOCOL PROBE"
        badgeVariant="cyan"
        statusText={loading ? "Protocol Handshake in Progress" : "Inspector Ready"}
        statusColor={loading ? "amber" : "emerald"}
        icon={Globe}
      />

      {/* Target Input */}
      <GlassPanel variant="cyber">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="web-url" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Website URL
            </Label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
              <Input
                id="web-url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && onScan()}
                className="pl-10 font-mono text-sm bg-black/40 border-white/10"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => onScan()}
              disabled={loading || !url.trim()}
              className="w-full md:w-auto min-w-[140px] bg-primary text-primary-foreground font-semibold shadow-neon-cyan"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inspecting...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Audit Security
                </>
              )}
            </Button>
          </div>
        </div>

        {err && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </GlassPanel>

      {/* Results View */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Score Banner */}
          <InteractiveCard glowColor="cyan" className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                <SecurityGauge score={result.score} size="lg" label="" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-xl font-bold font-mono text-foreground truncate max-w-[320px]">
                      {result.finalUrl || result.url}
                    </h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      HTTP {result.statusCode}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {result.issues.length === 0
                      ? "Zero high-risk configuration issues detected."
                      : `${result.issues.length} potential security exposure point(s) found.`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => onScan()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Re-test
                </Button>
                <Button variant="secondary" size="sm" onClick={() => exportReport("json")}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportReport("txt")}>
                  TXT
                </Button>
              </div>
            </div>
          </InteractiveCard>

          {/* Detailed Tabs */}
          <Tabs defaultValue="headers" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2 bg-black/40 p-1.5 border border-white/10 rounded-xl">
              <TabsTrigger value="headers" className="text-xs md:text-sm">
                <FileCode className="w-4 h-4 mr-2" />
                Headers
              </TabsTrigger>
              <TabsTrigger value="tls" className="text-xs md:text-sm">
                <Lock className="w-4 h-4 mr-2" />
                TLS / SSL
              </TabsTrigger>
              <TabsTrigger value="dns" className="text-xs md:text-sm">
                <Network className="w-4 h-4 mr-2" />
                DNS Records
              </TabsTrigger>
              <TabsTrigger value="cookies" className="text-xs md:text-sm">
                <Cookie className="w-4 h-4 mr-2" />
                Cookies
              </TabsTrigger>
              <TabsTrigger value="methods" className="text-xs md:text-sm">
                <Server className="w-4 h-4 mr-2" />
                Methods
              </TabsTrigger>
            </TabsList>

            {/* 1. Headers Tab */}
            <TabsContent value="headers" className="space-y-3 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(result.headerStatus).map(([name, status]) => {
                  const meta = HEADER_DEFINITIONS[name];
                  return (
                    <GlassPanel
                      key={name}
                      variant="default"
                      className={`p-4 border ${status.present ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-amber-500/20 bg-amber-500/[0.02]"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {status.present ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            )}
                            <h4 className="font-mono text-sm font-semibold text-foreground">{name}</h4>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">{meta?.purpose}</p>
                        </div>
                        <Badge variant="outline" className={status.present ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40"}>
                          {status.present ? "PRESENT" : "MISSING"}
                        </Badge>
                      </div>

                      {status.present && status.value && (
                        <div className="mt-3 p-2 rounded bg-black/40 border border-white/5 font-mono text-[11px] text-cyan-300 break-all">
                          {status.value}
                        </div>
                      )}

                      {!status.present && meta?.recommend && (
                        <div className="mt-3 p-2 rounded bg-white/[0.02] border border-white/5 text-[11px]">
                          <span className="text-amber-400 font-semibold">Recommended: </span>
                          <span className="font-mono text-muted-foreground">{meta.recommend}</span>
                        </div>
                      )}
                    </GlassPanel>
                  );
                })}
              </div>
            </TabsContent>

            {/* 2. TLS Tab */}
            <TabsContent value="tls" className="space-y-4 mt-4">
              {result.certificate ? (
                <GlassPanel variant="default" className="p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-5 h-5 text-emerald-400" />
                      <div>
                        <h4 className="font-semibold text-sm">TLS Peer Certificate Information</h4>
                        <p className="text-xs text-muted-foreground">Issued by {result.certificate.issuer}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={result.certificate.expired ? "text-red-400 border-red-500/40" : "text-emerald-400 border-emerald-500/40"}>
                      {result.certificate.expired ? "EXPIRED" : "VALID"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                      <span className="text-muted-foreground block">Valid From</span>
                      <span className="font-mono text-foreground mt-1 block">{result.certificate.validFrom}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                      <span className="text-muted-foreground block">Valid To</span>
                      <span className="font-mono text-foreground mt-1 block">{result.certificate.validTo}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                      <span className="text-muted-foreground block">Days Remaining</span>
                      <span className="font-mono text-cyan-400 font-bold mt-1 block text-sm">{result.certificate.daysRemaining} days</span>
                    </div>
                  </div>
                </GlassPanel>
              ) : (
                <GlassPanel variant="subtle" className="p-8 text-center text-muted-foreground text-xs">
                  No active TLS certificate details returned for this host.
                </GlassPanel>
              )}
            </TabsContent>

            {/* 3. DNS Tab */}
            <TabsContent value="dns" className="space-y-3 mt-4">
              <GlassPanel variant="default" className="p-5">
                <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                  <Network className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-semibold text-sm">Resolved DNS Records</h4>
                </div>

                <div className="mt-4 space-y-2 font-mono text-xs">
                  {result.dns && result.dns.length > 0 ? (
                    result.dns.map((rec, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded bg-black/30 border border-white/5">
                        <Badge variant="outline" className="font-mono text-[10px] text-cyan-400 border-cyan-500/30">
                          {rec.type}
                        </Badge>
                        <span className="text-muted-foreground truncate max-w-[80%]">
                          {rec.address || rec.exchange || rec.host || JSON.stringify(rec.entries || rec)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-muted-foreground text-xs">
                      No DNS records available or query completed with standard host lookup.
                    </div>
                  )}
                </div>
              </GlassPanel>
            </TabsContent>

            {/* 4. Cookies Tab */}
            <TabsContent value="cookies" className="space-y-3 mt-4">
              {result.cookieFindings && result.cookieFindings.length > 0 ? (
                result.cookieFindings.map((c, idx) => (
                  <GlassPanel key={idx} variant="default" className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-cyan-300 break-all">{c.raw.split(";")[0]}</span>
                      <div className="flex gap-1.5">
                        <Badge variant="outline" className={c.secure ? "text-emerald-400" : "text-amber-400"}>
                          {c.secure ? "Secure" : "No Secure"}
                        </Badge>
                        <Badge variant="outline" className={c.httpOnly ? "text-emerald-400" : "text-amber-400"}>
                          {c.httpOnly ? "HttpOnly" : "No HttpOnly"}
                        </Badge>
                        <Badge variant="outline" className="text-cyan-400">
                          SameSite={c.sameSite}
                        </Badge>
                      </div>
                    </div>
                  </GlassPanel>
                ))
              ) : (
                <GlassPanel variant="subtle" className="p-8 text-center text-muted-foreground text-xs">
                  No Set-Cookie response headers were sent by the target on root request.
                </GlassPanel>
              )}
            </TabsContent>

            {/* 5. Methods Tab */}
            <TabsContent value="methods" className="space-y-3 mt-4">
              <GlassPanel variant="default" className="p-5">
                <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                  <Server className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-sm">HTTP Allowed Methods Exposure</h4>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.allowedMethods && result.allowedMethods.length > 0 ? (
                    result.allowedMethods.map((m) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className={`font-mono text-xs py-1 px-2.5 ${m === "TRACE" || m === "DELETE" ? "text-red-400 border-red-500/40" : "text-emerald-400 border-emerald-500/40"}`}
                      >
                        {m}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">
                      Standard GET, HEAD, OPTIONS supported (No unsafe TRACE methods permitted).
                    </span>
                  )}
                </div>
              </GlassPanel>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* History */}
      {!loading && history.length > 0 && (
        <GlassPanel variant="default" className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Website Audits</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={clearHistory} disabled={history.length === 0} className="text-xs text-destructive hover:text-destructive">
              Clear
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {history.map((h, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setUrl(h.url);
                  onScan(h.url);
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="font-mono text-sm group-hover:text-cyan-300 transition-colors truncate max-w-[280px]">{h.url}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={h.score >= 80 ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>
                    {h.grade} • {h.score}/100
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">{h.scannedAt.slice(0, 10)}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </PageTransition>
  );
}
