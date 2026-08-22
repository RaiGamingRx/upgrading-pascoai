import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { SecurityGauge } from "@/components/security/SecurityGauge";
import { PageTransition } from "@/components/motion/PageTransition";
import {
  Mail,
  MailCheck,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Clock,
  Download,
  RefreshCw,
  Server,
  Layers,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";
import { analyzeEmail, type EmailScanResult } from "@/lib/email";

const HISTORY_KEY = "pasco_email_history_v1";

export default function EmailSecurity() {
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmailScanResult | null>(null);
  const [history, setHistory] = useState<EmailScanResult[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  async function runScan(targetEmail?: string) {
    const toScan = (targetEmail || email).trim();
    if (!toScan) {
      toast.error("Please enter an email address to analyze");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const r = await analyzeEmail(toScan, content);
      setResult(r);

      const updated = [r, ...history.filter((h) => h.email !== r.email)].slice(0, 15);
      setHistory(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

      toast.success("Email & domain security verification complete!");
    } catch (e: any) {
      toast.error(e?.message || "Email check failed");
    } finally {
      setLoading(false);
    }
  }

  const exportReport = (format: "json" | "txt" = "json") => {
    if (!result) return;

    if (format === "txt") {
      const lines = [
        "========================================",
        "  PASCOAI EMAIL SECURITY AUDIT REPORT",
        "========================================",
        `Email: ${result.email}`,
        `Score: ${result.score}/100`,
        `Provider: ${result.provider}`,
        `Disposable: ${result.disposable ? "Yes (High Risk)" : "No"}`,
        `Role-Based: ${result.roleBased ? "Yes" : "No"}`,
        `Scanned At: ${new Date(result.scannedAt).toISOString()}`,
        "----------------------------------------",
        "",
        "[DNS AUTHENTICATION (MX / SPF / DMARC)]",
        `• MX Records: ${result.mxRecords?.length || 0} active`,
        `• SPF Status: ${result.spf?.present ? result.spf.strength?.toUpperCase() : "MISSING"}`,
        `• DMARC Policy: ${result.dmarc?.present ? result.dmarc.policy?.toUpperCase() : "MISSING"}`,
        "",
        "[SECURITY FINDINGS]",
        ...result.flags.map((f) => `• [${f.level.toUpperCase()}] ${f.title || f.message}`),
      ].join("\n");

      const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `email-audit-${result.email.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported TXT report");
      return;
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-audit-${result.email.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported JSON report");
  };

  return (
    <PageTransition className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gradient-cyber">Email & Phishing Intelligence</h1>
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 font-mono text-xs">
            LIVE DNS AUDIT
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Verify domain MX delivery records, SPF/DMARC anti-spoofing policies, disposable mailbox blacklists, and phishing keywords.
        </p>
      </div>

      {/* Target Input */}
      <GlassPanel variant="cyber">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Email Address
            </Label>
            <div className="relative">
              <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
              <Input
                id="email-input"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && runScan()}
                className="pl-10 font-mono text-sm bg-black/40 border-white/10"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex justify-between">
              <span>Optional Email Body Text (Phishing Heuristics)</span>
              <span className="text-[10px] text-muted-foreground">Paste suspicious message or urgent prompts</span>
            </Label>
            <Textarea
              id="content-input"
              placeholder="Paste email text or headers to scan for urgent social engineering tactics, credential requests, or deceptive links..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-xs bg-black/40 border-white/10 min-h-[80px]"
              disabled={loading}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => runScan()}
              disabled={loading || !email.trim()}
              className="bg-primary text-primary-foreground font-semibold shadow-neon-cyan min-w-[150px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inspecting DNS...
                </>
              ) : (
                <>
                  <MailCheck className="w-4 h-4 mr-2" />
                  Analyze Email
                </>
              )}
            </Button>
          </div>
        </div>
      </GlassPanel>

      {/* Result Display */}
      {result && (
        <div className="space-y-6 animate-fade-in">
          <InteractiveCard glowColor="cyan" className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                <SecurityGauge score={result.score} size="lg" label="" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-xl font-bold font-mono text-foreground">{result.email}</h3>
                    <Badge variant="outline" className="font-mono text-xs capitalize">
                      {result.provider} Provider
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {result.disposable ? "⚠️ Disposable email provider detected." : "Established domain identity verified."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => runScan()}>
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

          {/* Key DNS Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <GlassPanel variant="default" className="p-4 flex items-center justify-between">
              <div>
                <span className="text-muted-foreground block text-[11px]">Mail Gateway (MX)</span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {result.mxRecords && result.mxRecords.length > 0 ? `${result.mxRecords.length} Active Records` : "No MX Records"}
                </span>
              </div>
              <Badge variant="outline" className={result.mxRecords && result.mxRecords.length > 0 ? "text-emerald-400" : "text-red-400"}>
                {result.mxRecords && result.mxRecords.length > 0 ? "RESOLVED" : "FAILED"}
              </Badge>
            </GlassPanel>

            <GlassPanel variant="default" className="p-4 flex items-center justify-between">
              <div>
                <span className="text-muted-foreground block text-[11px]">SPF Authentication</span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {result.spf?.present ? `v=spf1 (${result.spf.strength?.toUpperCase()})` : "Missing Record"}
                </span>
              </div>
              <Badge variant="outline" className={result.spf?.present ? "text-emerald-400" : "text-amber-400"}>
                {result.spf?.present ? "CONFIGURED" : "MISSING"}
              </Badge>
            </GlassPanel>

            <GlassPanel variant="default" className="p-4 flex items-center justify-between">
              <div>
                <span className="text-muted-foreground block text-[11px]">DMARC Policy</span>
                <span className="font-semibold text-foreground mt-0.5 block">
                  {result.dmarc?.present ? `p=${result.dmarc.policy?.toUpperCase()}` : "No Policy"}
                </span>
              </div>
              <Badge variant="outline" className={result.dmarc?.present ? "text-cyan-400" : "text-amber-400"}>
                {result.dmarc?.present ? "ACTIVE" : "UNENFORCED"}
              </Badge>
            </GlassPanel>
          </div>

          {/* Granular Flags */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Security Findings & Policy Evaluations
            </h4>

            {result.flags.map((flag, idx) => (
              <GlassPanel
                key={idx}
                variant="default"
                className={`p-4 border ${
                  flag.level === "safe"
                    ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                    : flag.level === "warning"
                    ? "border-amber-500/20 bg-amber-500/[0.02]"
                    : "border-red-500/20 bg-red-500/[0.02]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {flag.level === "safe" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : flag.level === "warning" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{flag.title || flag.message}</p>
                    <p className="text-xs text-muted-foreground">{flag.message}</p>
                    {flag.details && (
                      <p className="text-[11px] font-mono text-cyan-300 mt-1">{flag.details}</p>
                    )}
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {!loading && history.length > 0 && (
        <GlassPanel variant="default" className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Email Audits</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Clear email history?")) {
                  localStorage.removeItem(HISTORY_KEY);
                  setHistory([]);
                  toast.success("History cleared");
                }
              }}
              className="text-xs text-destructive hover:text-destructive"
            >
              Clear
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {history.map((h, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setEmail(h.email);
                  runScan(h.email);
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="font-mono text-sm group-hover:text-cyan-300 transition-colors truncate">{h.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={h.score >= 80 ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>
                    {h.score}/100
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(h.scannedAt).toISOString().slice(0, 10)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </PageTransition>
  );
}
