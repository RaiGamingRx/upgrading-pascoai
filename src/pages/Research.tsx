// src/pages/Research.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Upload,
  Loader2,
  Download,
  Trash2,
  Clock,
  Sparkles,
  BookOpen,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Zap,
  Gauge,
  X,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

import { runAI, type AIInlineFile } from "@/lib/aiClient";
import { personas } from "@/ai/personas";

/* ---------- TYPES ---------- */
type PersonaId = (typeof personas)[number]["id"];

interface ResearchResult {
  summary: string;
  keyFindings: string[];
  risks: string[];
  nextSteps: string[];
  sources: string[];
  meta?: { modelUsed?: string };
}

type HistoryItem = {
  topic: string;
  persona: PersonaId;
  deepMode: boolean;
  date: string; // YYYY-MM-DD
};

const HISTORY_KEY = "pasco_research_history_v1";
const MAX_HISTORY = 15;

/* ---------- HELPERS ---------- */
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parses the AI response that is formatted like:
 * Overview:
 * - ...
 * Key Findings:
 * - ...
 * Risks:
 * - ...
 * Mitigations / Next Steps:
 * - ...
 * Sources:
 * - ...
 */
function parseAIResponse(text: string): ResearchResult {
  const sections = {
    summary: "",
    keyFindings: [] as string[],
    risks: [] as string[],
    nextSteps: [] as string[],
    sources: [] as string[],
  };

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let current: keyof typeof sections | null = null;

  for (const line of lines) {
    const l = line.toLowerCase();

    if (l.startsWith("overview")) {
      current = "summary";
      continue;
    }
    if (l.startsWith("key findings") || l.startsWith("key")) {
      current = "keyFindings";
      continue;
    }
    if (l.startsWith("risks") || l.startsWith("risk")) {
      current = "risks";
      continue;
    }
    if (
      l.startsWith("mitigations") ||
      l.startsWith("defensive") ||
      l.startsWith("next steps") ||
      l.startsWith("mitigation")
    ) {
      current = "nextSteps";
      continue;
    }
    if (l.startsWith("sources") || l.startsWith("references") || l.startsWith("source")) {
      current = "sources";
      continue;
    }

    if (!current) continue;

    const cleaned = line.replace(/^[-•\d.]+\s*/, "").trim();
    if (!cleaned) continue;

    if (current === "summary") sections.summary += cleaned + " ";
    else sections[current].push(cleaned);
  }

  const summary = sections.summary.trim() || text.slice(0, 400).trim();

  return {
    summary,
    keyFindings: sections.keyFindings,
    risks: sections.risks,
    nextSteps: sections.nextSteps,
    sources: sections.sources,
    meta: {},
  };
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- REAL METRICS (derived from result) ---------- */
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function computeRiskLevel(risks: string[]): { level: RiskLevel; score: number } {
  const count = risks?.length || 0;
  const text = (risks || []).join(" ").toLowerCase();

  const severeWords = [
    "critical",
    "severe",
    "high",
    "breach",
    "rce",
    "exfil",
    "exfiltration",
    "privilege escalation",
    "persistence",
    "lateral",
    "worm",
    "zero-day",
    "credential stuffing",
    "account takeover",
    "takeover",
  ];

  const hits = severeWords.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);

  // score is deterministic and explainable
  const score = Math.max(0, Math.min(100, Math.round(count * 18 + hits * 10)));

  if (score >= 70) return { level: "HIGH", score };
  if (score >= 35) return { level: "MEDIUM", score };
  return { level: "LOW", score };
}

function computeCoverage(r: ResearchResult): number {
  const parts = [
    Boolean(r.summary?.trim()),
    (r.keyFindings?.length || 0) > 0,
    (r.risks?.length || 0) > 0,
    (r.nextSteps?.length || 0) > 0,
    (r.sources?.length || 0) > 0,
  ];
  const filled = parts.filter(Boolean).length;
  return Math.round((filled / parts.length) * 100);
}

function computeActionability(nextSteps: string[]): number {
  const n = nextSteps?.length || 0;
  // 0..5 steps -> 0..100
  return Math.max(0, Math.min(100, n * 20));
}

function MeterBar({ value, tone }: { value: number; tone: RiskLevel | "OK" | "WARN" }) {
  const bar =
    tone === "HIGH"
      ? "bg-red-500"
      : tone === "MEDIUM"
      ? "bg-yellow-500"
      : tone === "WARN"
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className="w-full h-2 rounded bg-muted overflow-hidden">
      <div className={`${bar} h-full transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

function riskBadge(level: RiskLevel) {
  if (level === "HIGH") return { text: "High Risk", cls: "text-red-400 border-red-500/40" };
  if (level === "MEDIUM") return { text: "Medium Risk", cls: "text-yellow-300 border-yellow-500/40" };
  return { text: "Low Risk", cls: "text-green-400 border-green-500/40" };
}

function bytesToHuman(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

async function fileToBase64NoPrefix(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      // result = data:application/pdf;base64,XXXX
      const comma = result.indexOf(",");
      if (comma === -1) return reject(new Error("Invalid base64"));
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- COMPONENT ---------- */
export default function Research() {
  const [query, setQuery] = useState("");
  const [persona, setPersona] = useState<PersonaId>(personas[0].id);
  const [deepMode, setDeepMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [inlineFile, setInlineFile] = useState<AIInlineFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const saved = safeJsonParse<HistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
    setHistory(Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : []);
  }, []);

  const personaLabelById = useMemo(() => {
    const m = new Map<PersonaId, string>();
    personas.forEach((p) => m.set(p.id, p.label));
    return m;
  }, []);

  const saveHistory = (topic: string, pid: PersonaId, dm: boolean) => {
    const item: HistoryItem = {
      topic: topic.trim(),
      persona: pid,
      deepMode: dm,
      date: todayISO(),
    };

    // de-dup by topic+persona+mode
    const filtered = history.filter(
      (h) => !(h.topic === item.topic && h.persona === item.persona && h.deepMode === item.deepMode)
    );

    const updated = [item, ...filtered].slice(0, MAX_HISTORY);
    setHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    toast.success("History cleared");
  };

  const loadFromHistory = (h: HistoryItem) => {
    setQuery(h.topic);
    setPersona(h.persona);
    setDeepMode(h.deepMode);
    toast.message("Loaded from history");
  };

  const onPickPDF = () => fileInputRef.current?.click();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-pick same file
    if (!f) return;

    if (f.type !== "application/pdf") {
      toast.error("Only PDF supported");
      return;
    }

    if (f.size > 18 * 1024 * 1024) {
      toast.error("PDF too large. Please upload < 18MB");
      return;
    }

    toast.info("Preparing PDF...");
    try {
      const b64 = await fileToBase64NoPrefix(f);
      setInlineFile({
        name: f.name,
        mimeType: f.type,
        dataBase64: b64,
        size: f.size,
      });
      toast.success("PDF attached");
    } catch (err: any) {
      toast.error(err?.message || "Failed to attach PDF");
    }
  };

  const removeFile = () => {
    setInlineFile(null);
    toast.message("PDF removed");
  };

  const runResearch = async () => {
    if (!query.trim()) {
      toast.error("Please enter a research topic");
      return;
    }

    setIsProcessing(true);
    setResult(null);
    toast.info(inlineFile ? "Analyzing topic + PDF..." : "Running security analysis...");

    try {
      const res = await runAI({
        prompt: query.trim(),
        persona,
        deepMode,
        file: inlineFile,
      });

      const parsed = parseAIResponse(res.response || "");
      const withMeta: ResearchResult = {
        ...parsed,
        meta: { modelUsed: res.modelUsed },
      };

      setResult(withMeta);
      saveHistory(query.trim(), persona, deepMode);

      toast.success("Analysis complete");
    } catch (e: any) {
      toast.error(e?.message || "AI analysis failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const exportReport = () => {
    if (!result) return;

    const pLabel = personaLabelById.get(persona) || persona;
    const model = result.meta?.modelUsed ? ` (${result.meta.modelUsed})` : "";

    const risk = computeRiskLevel(result.risks);
    const coverage = computeCoverage(result);
    const action = computeActionability(result.nextSteps);

    const content = [
      `PascoAI Research Suite Report`,
      `Date: ${new Date().toISOString()}`,
      `Persona: ${pLabel}`,
      `Mode: ${deepMode ? "Deep" : "Standard"}${model}`,
      inlineFile ? `Attachment: ${inlineFile.name} (${bytesToHuman(inlineFile.size)})` : `Attachment: (none)`,
      ``,
      `Derived Metrics:`,
      `- Risk: ${risk.level} (${risk.score}%)`,
      `- Coverage: ${coverage}%`,
      `- Actionability: ${action}%`,
      ``,
      `Topic:`,
      `${query.trim()}`,
      ``,
      `Overview:`,
      `- ${result.summary || "(none)"}`,
      ``,
      `Key Findings:`,
      ...(result.keyFindings.length ? result.keyFindings.map((x) => `- ${x}`) : ["- (none)"]),
      ``,
      `Risks:`,
      ...(result.risks.length ? result.risks.map((x) => `- ${x}`) : ["- (none)"]),
      ``,
      `Mitigations / Next Steps:`,
      ...(result.nextSteps.length ? result.nextSteps.map((x) => `- ${x}`) : ["- (none)"]),
      ``,
      `Sources:`,
      ...(result.sources.length ? result.sources.map((x) => `- ${x}`) : ["- (none)"]),
      ``,
    ].join("\n");

    const safeName = `pascoai_research_${todayISO()}_${persona}${deepMode ? "_deep" : ""}.txt`;
    downloadTextFile(safeName, content);
    toast.success("Report exported");
  };

  // derived UI metrics (always real)
  const derived = useMemo<{
    risk: { level: "LOW" | "MEDIUM" | "HIGH"; score: number };
    rb: { text: string; cls: string };
    coverage: number;
    coverageTone: "OK" | "WARN";
    action: number;
    actionTone: "OK" | "WARN";
  } | null>(() => {
    if (!result) return null;
  
    const risk = computeRiskLevel(result.risks);
    const coverage = computeCoverage(result);
    const action = computeActionability(result.nextSteps);
  
    const coverageTone: "OK" | "WARN" = coverage >= 80 ? "OK" : "WARN";
    const actionTone: "OK" | "WARN" = action >= 60 ? "OK" : "WARN";
  
    return {
      risk,
      rb: riskBadge(risk.level),
      coverage,
      coverageTone,
      action,
      actionTone,
    };
  }, [result]);  

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient-cyber">Research Suite</h1>
          <p className="text-muted-foreground mt-1">
            AI-assisted cybersecurity research & learning (Blue / Red / SOC)
          </p>
        </div>

        <Button variant={deepMode ? "default" : "outline"} size="sm" onClick={() => setDeepMode((v) => !v)}>
          <Zap className="w-4 h-4 mr-2" />
          Deep Mode
        </Button>
      </div>

      {/* Input */}
      <Card variant="cyber">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Research Topic</Label>
            <Textarea
              placeholder="e.g. Credential stuffing detection in SOC environments"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[100px] font-mono"
              disabled={isProcessing}
            />
          </div>

          {/* Hidden file input (real) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onFileSelected}
          />

          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 w-full md:w-64">
              <Label>Persona</Label>
              <Select value={persona} onValueChange={(v) => setPersona(v as PersonaId)} disabled={isProcessing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span>{p.icon}</span>
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <Button variant="outline" onClick={onPickPDF} disabled={isProcessing}>
                <Upload className="w-4 h-4 mr-2" />
                Upload PDF
              </Button>

              <Button onClick={runResearch} disabled={isProcessing || !query.trim()}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Attached file badge */}
          {inlineFile && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inlineFile.name}</div>
                  <div className="text-xs text-muted-foreground">{bytesToHuman(inlineFile.size)} • PDF attached</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={removeFile} disabled={isProcessing} title="Remove PDF">
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {deepMode && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Deep Mode Enabled</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Multi-angle reasoning with security-focused analysis</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <Card variant="glow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Summary
                </span>
                <div className="flex items-center gap-2">
                  {result.meta?.modelUsed && (
                    <Badge variant="outline" className="text-xs">
                      {result.meta.modelUsed}
                    </Badge>
                  )}
                  <Badge variant={deepMode ? "default" : "outline"} className="text-xs">
                    {deepMode ? "Deep" : "Standard"}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {result.summary || "No summary returned. Try rephrasing your topic defensively."}
              </p>
            </CardContent>
          </Card>

          {/* Live Metrics */}
          {derived && (
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  Live Metrics
                  <Badge variant="outline" className={`ml-2 ${derived.rb.cls}`}>
                    {derived.rb.text}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Risk Score</span>
                    <span>{derived.risk.score}%</span>
                  </div>
                  <MeterBar value={derived.risk.score} tone={derived.risk.level} />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Coverage</span>
                    <span>{derived.coverage}%</span>
                  </div>
                  <MeterBar value={derived.coverage} tone={derived.coverageTone} />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Actionability</span>
                    <span>{derived.action}%</span>
                  </div>
                  <MeterBar value={derived.action} tone={derived.actionTone} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    Findings: {result.keyFindings.length}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Risks: {result.risks.length}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Steps: {result.nextSteps.length}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Sources: {result.sources.length}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  Key Findings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.keyFindings?.length ? (
                  <ul className="space-y-2">
                    {result.keyFindings.map((f, i) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        • {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No findings returned. Try asking for “top 7 key findings”.</p>
                )}
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  Risks
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.risks?.length ? (
                  <ul className="space-y-2">
                    {result.risks.map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        • {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No risks returned. Try: “list concrete risks with severity”.</p>
                )}
              </CardContent>
            </Card>

            <Card variant="glass" className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" />
                  Mitigations / Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.nextSteps?.length ? (
                  <ul className="space-y-2">
                    {result.nextSteps.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        {i + 1}. {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No mitigations returned. Try: “give 10 actionable mitigations”.</p>
                )}
              </CardContent>
            </Card>

            <Card variant="glass" className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-secondary" />
                  Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.sources?.length ? (
                  <ul className="space-y-2">
                    {result.sources.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground break-words">
                        • {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No sources returned. Try: “include OWASP, NIST, CISA sources”.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Result
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !isProcessing && (
        <Card variant="cyber" className="p-12 text-center">
          <Search className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Start Security Research</h3>
          <p className="text-muted-foreground mb-4">Ask Blue Team, Red Team, or SOC-focused questions</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["OWASP Top 10", "Phishing Detection", "Zero Trust", "API Security"].map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => setQuery(t)}>
                {t}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-secondary" />
            History
          </CardTitle>

          <Button variant="destructive" size="sm" onClick={clearHistory} disabled={history.length === 0}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear History
          </Button>
        </CardHeader>

        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet. Run an analysis and it will appear here.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => (
                <button
                  key={`${h.date}-${h.topic}-${i}`}
                  onClick={() => loadFromHistory(h)}
                  className="w-full text-left rounded-lg p-3 border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition"
                  title="Click to load"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{h.topic}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {personaLabelById.get(h.persona) || h.persona}
                        </Badge>
                        <Badge variant={h.deepMode ? "default" : "outline"} className="text-xs">
                          {h.deepMode ? "Deep" : "Standard"}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{h.date}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
