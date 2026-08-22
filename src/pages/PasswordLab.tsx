// src/pages/PasswordLab.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { toast } from "sonner";
import {
  Key,
  Zap,
  ShieldAlert,
  Copy,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  Shield,
} from "lucide-react";

import { analyzePassword, checkPasswordBreachCount, generatePassword } from "@/lib/password";

const bestPractices = [
  { title: "Use a Password Manager", description: "Store unique, complex passwords for each account securely", icon: Shield },
  { title: "Enable 2FA", description: "Add an extra layer of security beyond just passwords", icon: CheckCircle },
  { title: "Avoid Reuse", description: "Never reuse passwords across sites (breaches spread fast)", icon: AlertTriangle },
  { title: "Prefer Passphrases", description: "Long random word phrases can be strong + memorable", icon: Key },
];

type BreachHistoryItem = {
  id: string;
  ts: number;
  length: number;
  foundCount: number;
  label: string;
};

type ExportFormat = "json" | "txt";

function readExportFormat(): ExportFormat {
  try {
    const saved = localStorage.getItem("pasco_export_format");
    return saved === "txt" ? "txt" : "json";
  } catch {
    return "json";
  }
}

export default function PasswordLab() {
  /* ---------------- Analyzer ---------------- */
  const [password, setPassword] = useState("");

  const analysis = useMemo(() => {
    if (!password) return null;
    return analyzePassword(password);
  }, [password]);

  /* ---------------- Generator ---------------- */
  const [genLen, setGenLen] = useState(16);
  const [optLower, setOptLower] = useState(true);
  const [optUpper, setOptUpper] = useState(true);
  const [optDigits, setOptDigits] = useState(true);
  const [optSymbols, setOptSymbols] = useState(true);
  const [generated, setGenerated] = useState("");

  const generatedAnalysis = useMemo(() => {
    if (!generated) return null;
    return analyzePassword(generated);
  }, [generated]);

  /* ---------------- Breach Checker ---------------- */
  const [breachPwd, setBreachPwd] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [breachCount, setBreachCount] = useState<number | null>(null);
  const [breachHistory, setBreachHistory] = useState<BreachHistoryItem[]>([]);

  const clearBreachHistory = () => {
    setBreachHistory([]);
    toast.success("History cleared");
  };

  /* ---------------- Export format (LIVE sync with Settings) ---------------- */
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");

  useEffect(() => {
    // initial read
    setExportFormat(readExportFormat());

    // updates across tabs/windows
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pasco_export_format") {
        setExportFormat(readExportFormat());
      }
    };

    // updates within same tab (recommended to dispatch from Settings after Save)
    const onCustom = () => setExportFormat(readExportFormat());

    window.addEventListener("storage", onStorage);
    window.addEventListener("pasco_export_format_changed", onCustom as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pasco_export_format_changed", onCustom as EventListener);
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Copy failed");
    }
  };

  const runGenerate = () => {
    const pw = generatePassword({
      length: genLen,
      lower: optLower,
      upper: optUpper,
      digits: optDigits,
      symbols: optSymbols,
    });

    if (!pw) {
      toast.error("Select at least 1 option (lower/upper/digits/symbols)");
      return;
    }

    setGenerated(pw);
    toast.success("Password generated!");
  };

  const runBreachCheck = async () => {
    if (!breachPwd.trim()) {
      toast.error("Enter a password first");
      return;
    }

    setIsChecking(true);
    setBreachCount(null);
    setCheckProgress(0);

    // 3 sec “scanner-like” progress
    const start = Date.now();
    const duration = 3000;

    const tick = () => {
      const t = Date.now() - start;
      const pct = Math.min(100, Math.round((t / duration) * 100));
      setCheckProgress(pct);
      if (t < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    try {
      // wait full 3 sec (even if API responds fast) for UX consistency
      const [count] = await Promise.all([
        checkPasswordBreachCount(breachPwd),
        new Promise((r) => setTimeout(r, duration)),
      ]);

      setBreachCount(count);

      const label = count > 0 ? "Compromised" : "Not found";
      setBreachHistory((prev) => [
        {
          id: crypto.randomUUID(),
          ts: Date.now(),
          length: breachPwd.length,
          foundCount: count,
          label,
        },
        ...prev,
      ]);

      if (count > 0) toast.error(`Found in breaches: ${count.toLocaleString()} times`);
      else toast.success("Not found in known breach datasets");
    } catch (e) {
      toast.error("Breach check failed (network/CORS). Try again.");
    } finally {
      setIsChecking(false);
      setTimeout(() => setCheckProgress(0), 300);
    }
  };

  const exportBreachReport = () => {
    if (breachCount === null) {
      toast.error("Run a breach check first");
      return;
    }

    const payload = {
      tool: "Password Breach Checker",
      checkedAt: new Date().toISOString(),
      passwordLength: breachPwd.length,
      result: {
        compromised: breachCount > 0,
        breachCount,
      },
      note:
        "This uses k-anonymity: your password is NOT sent. Only the first 5 chars of its SHA-1 hash are queried.",
    };

    if (exportFormat === "txt") {
      const lines = [
        "PascoAI - Password Breach Checker Report",
        `Checked At: ${payload.checkedAt}`,
        `Password Length: ${payload.passwordLength}`,
        `Compromised: ${payload.result.compromised ? "YES" : "NO"}`,
        `Breach Count: ${payload.result.breachCount.toLocaleString()}`,
        "",
        payload.note,
      ].join("\n");

      const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pascoai-password-breach-report.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported (.txt)");
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pascoai-password-breach-report.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported (.json)");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gradient-cyber">Password Security Lab</h1>
        <p className="text-muted-foreground mt-1">
          100% real tools: strength analyzer, secure generator, and breach checker (k-anonymity).
        </p>
      </div>

      <Tabs defaultValue="analyzer" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analyzer">
            <Key className="w-4 h-4 mr-2" />
            Analyzer
          </TabsTrigger>
          <TabsTrigger value="generator">
            <Zap className="w-4 h-4 mr-2" />
            Generator
          </TabsTrigger>
          <TabsTrigger value="breach">
            <ShieldAlert className="w-4 h-4 mr-2" />
            Breach Checker
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Analyzer ---------------- */}
        <TabsContent value="analyzer" className="space-y-6">
          <Card variant="cyber">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Password Strength Analyzer
              </CardTitle>
              <CardDescription>Enter a password to analyze its strength and crack-time estimates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">Enter Password</Label>
                <Input
                  id="password"
                  type="text"
                  placeholder="Enter password to analyze."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                />
              </div>

              {password && (
                <>
                  <PasswordStrengthMeter password={password} showDetails />

                  {/* Crack time cards */}
                  {analysis && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card variant="glass" className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary/10">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Online (throttled)</p>
                            <p className="font-bold">{analysis.crack.online}</p>
                          </div>
                        </div>
                      </Card>

                      <Card variant="glass" className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary/10">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Offline fast GPU</p>
                            <p className="font-bold">{analysis.crack.offlineFast}</p>
                          </div>
                        </div>
                      </Card>

                      <Card variant="glass" className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-primary/10">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Offline slow hash</p>
                            <p className="font-bold">{analysis.crack.offlineSlow}</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Tips */}
                  {analysis && (
                    <Card variant="glass" className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <AlertTriangle className="w-5 h-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold">
                            Tips ({analysis.label} • {analysis.score}/100)
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                            {analysis.tips.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Best Practices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestPractices.map((p, idx) => (
              <Card key={idx} variant="glass">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <p.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{p.title}</h4>
                      <p className="text-sm text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ---------------- Generator ---------------- */}
        <TabsContent value="generator" className="space-y-6">
          <Card variant="cyber">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Password Generator
              </CardTitle>
              <CardDescription>Generate strong passwords with full control (secure randomness).</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Length */}
                <Card variant="glass" className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Length</p>
                      <p className="text-sm text-muted-foreground">Choose 8–64 characters</p>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {genLen}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-2">
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={genLen}
                      onChange={(e) => setGenLen(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>8</span>
                      <span>64</span>
                    </div>
                  </div>
                </Card>

                {/* Options */}
                <Card variant="glass" className="p-4">
                  <p className="font-semibold">Options</p>
                  <p className="text-sm text-muted-foreground mb-3">Toggle character sets</p>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={optDigits} onChange={(e) => setOptDigits(e.target.checked)} />
                      Numbers
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={optSymbols} onChange={(e) => setOptSymbols(e.target.checked)} />
                      Symbols
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={optLower} onChange={(e) => setOptLower(e.target.checked)} />
                      Small alphabets
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={optUpper} onChange={(e) => setOptUpper(e.target.checked)} />
                      Large alphabets
                    </label>
                  </div>
                </Card>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <Button onClick={runGenerate} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => (generated ? copyToClipboard(generated) : toast.error("Generate a password first"))}
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>

              {/* Output */}
              <div className="space-y-2">
                <Label>Generated Password</Label>
                <Input value={generated} readOnly className="font-mono" placeholder="Click Generate..." />
              </div>

              {/* Meter + crack */}
              {generated && (
                <div className="space-y-4">
                  <PasswordStrengthMeter password={generated} showDetails />

                  {generatedAnalysis && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card variant="glass" className="p-4">
                        <p className="text-xs text-muted-foreground">Online (throttled)</p>
                        <p className="font-bold">{generatedAnalysis.crack.online}</p>
                      </Card>
                      <Card variant="glass" className="p-4">
                        <p className="text-xs text-muted-foreground">Offline fast GPU</p>
                        <p className="font-bold">{generatedAnalysis.crack.offlineFast}</p>
                      </Card>
                      <Card variant="glass" className="p-4">
                        <p className="text-xs text-muted-foreground">Offline slow hash</p>
                        <p className="font-bold">{generatedAnalysis.crack.offlineSlow}</p>
                      </Card>
                    </div>
                  )}

                  {generatedAnalysis && (
                    <Card variant="glass" className="p-4">
                      <p className="font-semibold mb-1">Tips</p>
                      <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                        {generatedAnalysis.tips.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Breach Checker ---------------- */}
        <TabsContent value="breach" className="space-y-6">
          <Card variant="cyber">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-warning" />
                Password Breach Checker (K-Anonymity)
              </CardTitle>
              <CardDescription>
                Checks if a password appears in known breaches. Your password is never sent — only a hash prefix is queried.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="breachPwd">Enter Password</Label>
                <Input
                  id="breachPwd"
                  type="password"
                  placeholder="Enter password to check..."
                  value={breachPwd}
                  onChange={(e) => setBreachPwd(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <Button onClick={runBreachCheck} disabled={isChecking} className="flex-1">
                  {isChecking ? "Checking..." : "Check for Breach"}
                </Button>

                <Button
                  variant="outline"
                  onClick={exportBreachReport}
                  disabled={breachCount === null}
                  className="flex-1"
                >
                  Export Report ({exportFormat.toUpperCase()})
                </Button>
              </div>

              {/* Progress */}
              {(isChecking || checkProgress > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Scanning breach datasets…</span>
                    <span className="font-mono">{checkProgress}%</span>
                  </div>
                  <Progress value={checkProgress} />
                </div>
              )}

              {/* Result */}
              {breachCount !== null && (
                <Card variant="glass" className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-semibold">Result</p>
                      {breachCount > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-destructive">Compromised:</span>{" "}
                          found <span className="font-mono">{breachCount.toLocaleString()}</span> times.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-emerald-400">Not found</span> in known breach datasets.
                        </p>
                      )}
                    </div>

                    <Badge variant="outline" className="font-mono">
                      len:{breachPwd.length}
                    </Badge>
                  </div>
                </Card>
              )}

              {/* History */}
              <Card variant="glass">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">History</CardTitle>
                    <CardDescription>
                      Most recent checks (stored in memory only for this page session).
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearBreachHistory}
                    disabled={breachHistory.length === 0}
                  >
                    Clear History
                  </Button>
                </CardHeader>

                <CardContent className="space-y-3">
                  {breachHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No checks yet.</p>
                  ) : (
                    breachHistory.slice(0, 8).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold">
                            {h.label === "Compromised" ? (
                              <span className="text-destructive">Compromised</span>
                            ) : (
                              <span className="text-emerald-400">Not found</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.ts).toLocaleString()} • length {h.length}
                          </p>
                        </div>

                        <Badge variant="outline" className="font-mono">
                          {h.foundCount.toLocaleString()}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
