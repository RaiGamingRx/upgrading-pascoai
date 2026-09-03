// src/pages/CryptoLab.tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { PageTransition } from "@/components/motion/PageTransition";
import { AnimatedPageHeading } from "@/components/motion/AnimatedPageHeading";
import { useAuth } from "@/hooks/useAuth";
import { scansApi } from "@/lib/api";
import {
  Lock,
  Unlock,
  Copy,
  Download,
  Upload,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  FileText,
  Eye,
  EyeOff,
} from "lucide-react";

import {
  decryptToken,
  downloadBytes,
  downloadText,
  encryptFile,
  encryptText,
  fingerprintFromToken,
} from "@/lib/crypto";

type ExportFormat = "json" | "txt";
function readExportFormat(): ExportFormat {
  try {
    const saved = localStorage.getItem("pasco_export_format");
    return saved === "txt" ? "txt" : "json";
  } catch {
    return "json";
  }
}

type HistoryItem = {
  id: string;
  ts: number;
  action: "encrypt" | "decrypt";
  kind: "text" | "file";
  fingerprint: string;
  filename?: string;
  size?: number;
  note?: string;
  ok: boolean;
};

const HISTORY_KEY = "pasco_crypto_history_v1";
const ATTEMPTS_KEY = "pasco_crypto_attempts_v2"; // per-browser attempts (persists across refresh)

function fmtBytes(n?: number) {
  if (!n && n !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let x = n;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied!");
  } catch {
    toast.error("Copy failed");
  }
}

function loadAttemptsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveAttemptsMap(map: Record<string, number>) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export default function CryptoLab() {
  /* ---------------- Export format (LIVE sync with Settings) ---------------- */
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  useEffect(() => {
    setExportFormat(readExportFormat());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pasco_export_format") setExportFormat(readExportFormat());
    };
    const onCustom = () => setExportFormat(readExportFormat());

    window.addEventListener("storage", onStorage);
    window.addEventListener("pasco_export_format_changed", onCustom as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pasco_export_format_changed", onCustom as EventListener);
    };
  }, []);

  /* ---------------- Encrypt (Text) ---------------- */
  const [plainText, setPlainText] = useState("");
  const [encPassword, setEncPassword] = useState("");
  const [encShowKey, setEncShowKey] = useState(false);
  const [encNote, setEncNote] = useState("");
  const [encBusy, setEncBusy] = useState(false);
  const [encProgress, setEncProgress] = useState(0);
  const [encryptedToken, setEncryptedToken] = useState<string>("");

  /* ---------------- Encrypt (File) ---------------- */
  const [fileToEncrypt, setFileToEncrypt] = useState<File | null>(null);

  /* ---------------- Decrypt ---------------- */
  const [tokenToDecrypt, setTokenToDecrypt] = useState("");
  const [decPassword, setDecPassword] = useState("");
  const [decShowKey, setDecShowKey] = useState(false);
  const [decBusy, setDecBusy] = useState(false);
  const [decProgress, setDecProgress] = useState(0);
  const [decryptedText, setDecryptedText] = useState<string>("");
  const [decryptedFileBytes, setDecryptedFileBytes] = useState<Uint8Array | null>(null);
  const [decryptedFileMeta, setDecryptedFileMeta] = useState<{
    filename: string;
    mime?: string;
    size?: number;
  } | null>(null);

  /* ---------------- Protection (always on) ---------------- */
  const maxAttempts = 5;

  /* ---------------- Paste UX ---------------- */
  const [pasted, setPasted] = useState(false);

  /* ---------------- Auth & Tenant Context ---------------- */
  const { user, isDemo } = useAuth();

  /* ---------------- History ---------------- */
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  useEffect(() => {
    if (user && !isDemo) {
      // REAL USER: Fetch from authenticated Neon database
      scansApi.list()
        .then(({ scans }) => {
          const cryptoScans = (scans || []).filter(
            (s: any) => s.raw_summary?.type === "crypto_operation" || s.rawSummary?.type === "crypto_operation"
          );
          const formatted: HistoryItem[] = cryptoScans.map((s: any) => {
            const raw = s.raw_summary || s.rawSummary || {};
            return {
              id: s.id,
              ts: raw.ts || (s.created_at ? new Date(s.created_at).getTime() : Date.now()),
              action: raw.action || "encrypt",
              kind: raw.kind || "text",
              fingerprint: raw.fingerprint || "n/a",
              filename: raw.filename,
              size: raw.size,
              note: raw.note,
              ok: raw.ok !== false,
            };
          });
          setHistory(formatted.slice(0, 20));
        })
        .catch((err) => {
          console.error("Failed to load crypto history from Neon:", err);
        });
    } else {
      // DEMO USER: Load from local browser storage / memory (ZERO Neon reads)
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) setHistory(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
  }, [user, isDemo]);

  const pushHistory = (item: HistoryItem) => {
    const updated = [item, ...history].slice(0, 20);
    setHistory(updated);

    if (user && !isDemo) {
      // REAL USER: Persist to Neon PostgreSQL via authenticated RLS API
      scansApi.create({
        target: "cryptolab",
        targetType: "url_endpoint",
        isVerified: true,
        overallScore: null,
        rawSummary: {
          type: "crypto_operation",
          action: item.action,
          kind: item.kind,
          fingerprint: item.fingerprint,
          filename: item.filename,
          size: item.size,
          note: item.note,
          ok: item.ok,
          ts: item.ts,
        },
      }).catch((err) => {
        console.error("Failed to persist crypto operation to Neon:", err);
      });
    } else {
      // DEMO USER: Store in local browser storage only (ZERO Neon writes)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  };

  const clearHistory = () => {
    if (!history.length) return;
    if (isDemo || !user) {
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {
        // ignore
      }
    }
    setHistory([]);
    toast.success("Crypto history cleared");
  };

  /* ---------------- Export helpers ---------------- */
  const exportResult = (payload: any, filenameBase: string) => {
    if (exportFormat === "txt") {
      const lines = Object.entries(payload)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n");
      downloadText(lines, `${filenameBase}.txt`);
      return;
    }
    downloadText(JSON.stringify(payload, null, 2), `${filenameBase}.json`);
  };

  const animateProgress = (setter: (n: number) => void, duration = 1500) => {
    const start = Date.now();
    const tick = () => {
      const t = Date.now() - start;
      const pct = Math.min(100, Math.round((t / duration) * 100));
      setter(pct);
      if (t < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ---------------- Encrypt actions ---------------- */
  const runEncryptText = async () => {
    if (!plainText.trim()) return toast.error("Enter text to encrypt");
    if (!encPassword.trim()) return toast.error("Enter a secret key");

    setEncBusy(true);
    setEncProgress(0);
    setEncryptedToken("");
    animateProgress(setEncProgress, 1600);

    try {
      const { token, header, fingerprint } = await encryptText(plainText, {
        password: encPassword,
        note: encNote,
      });

      await new Promise((r) => setTimeout(r, 1600));

      setEncryptedToken(token);
      toast.success("Encrypted successfully");

      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "encrypt",
        kind: "text",
        fingerprint,
        note: header.note,
        ok: true,
      });
    } catch (e: any) {
      toast.error(e?.message || "Encryption failed");
      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "encrypt",
        kind: "text",
        fingerprint: "n/a",
        ok: false,
      });
    } finally {
      setEncBusy(false);
      setTimeout(() => setEncProgress(0), 250);
    }
  };

  const runEncryptFile = async () => {
    if (!fileToEncrypt) return toast.error("Select a file first");
    if (!encPassword.trim()) return toast.error("Enter a secret key");

    setEncBusy(true);
    setEncProgress(0);
    setEncryptedToken("");
    animateProgress(setEncProgress, 1800);

    try {
      const { token, header, fingerprint } = await encryptFile(fileToEncrypt, {
        password: encPassword,
        note: encNote,
      });

      await new Promise((r) => setTimeout(r, 1800));

      setEncryptedToken(token);
      toast.success("File encrypted successfully");

      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "encrypt",
        kind: "file",
        fingerprint,
        filename: header.filename,
        size: header.size,
        note: header.note,
        ok: true,
      });
    } catch (e: any) {
      toast.error(e?.message || "File encryption failed");
      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "encrypt",
        kind: "file",
        fingerprint: "n/a",
        ok: false,
      });
    } finally {
      setEncBusy(false);
      setTimeout(() => setEncProgress(0), 250);
    }
  };

  const downloadEncrypted = () => {
    if (!encryptedToken) return toast.error("Nothing to download yet");

    const payload = {
      tool: "PascoAI Crypto Lab",
      createdAt: new Date().toISOString(),
      format: "PASCO1 token",
      token: encryptedToken,
      note: "Share this token. Only someone with the correct key can decrypt.",
    };

    exportResult(payload, "pascoai-encrypted");
    toast.success(`Exported (${exportFormat})`);
  };

  /* ---------------- Decrypt actions ---------------- */
  const runDecrypt = async () => {
    const token = tokenToDecrypt.trim();
    if (!token) return toast.error("Paste an encrypted token first");
    if (!decPassword.trim()) return toast.error("Enter the secret key");

    setDecBusy(true);
    setDecProgress(0);
    setDecryptedText("");
    setDecryptedFileBytes(null);
    setDecryptedFileMeta(null);

    animateProgress(setDecProgress, 1700);

    try {
      // First try decrypt (gives us fingerprint)
      const res = await decryptToken(token, decPassword);

      // protection check (per-browser, persists across refresh)
      const attemptsMap = loadAttemptsMap();
      const used = attemptsMap[res.fingerprint] ?? 0;
      if (used >= maxAttempts) {
        toast.error("Locked: too many wrong attempts for this token on this device.");
        pushHistory({
          id: crypto.randomUUID(),
          ts: Date.now(),
          action: "decrypt",
          kind: res.kind,
          fingerprint: res.fingerprint,
          filename: res.header.filename,
          size: res.header.size,
          note: res.header.note,
          ok: false,
        });
        setDecBusy(false);
        setTimeout(() => setDecProgress(0), 250);
        return;
      }

      await new Promise((r) => setTimeout(r, 1700));

      if (res.kind === "text") {
        setDecryptedText(res.text || "");
        toast.success("Decrypted successfully");
      } else {
        setDecryptedFileBytes(res.bytes);
        setDecryptedFileMeta({
          filename: res.header.filename || "decrypted.bin",
          mime: res.header.mime,
          size: res.header.size,
        });
        toast.success("File decrypted successfully");
      }

      // reset attempts on success
      attemptsMap[res.fingerprint] = 0;
      saveAttemptsMap(attemptsMap);

      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "decrypt",
        kind: res.kind,
        fingerprint: res.fingerprint,
        filename: res.header.filename,
        size: res.header.size,
        note: res.header.note,
        ok: true,
      });
    } catch (e: any) {
      // On failure, compute a stable fingerprint from the ciphertext so attempts tracking works
      // even when the key is wrong.
      let fp = "unknown";
      try {
        fp = await fingerprintFromToken(token);
      } catch {
        // ignore (bad token)
      }

      if (fp !== "unknown") {
        const attemptsMap = loadAttemptsMap();
        const used = attemptsMap[fp] ?? 0;
        const next = used + 1;
        attemptsMap[fp] = next;
        saveAttemptsMap(attemptsMap);

        const left = Math.max(0, maxAttempts - next);
        if (left <= 0) toast.error("Wrong key. Locked (5/5 attempts used on this device).");
        else toast.error(`Wrong key. Attempts left: ${left}`);
      } else {
        toast.error(e?.message || "Decryption failed");
      }

      pushHistory({
        id: crypto.randomUUID(),
        ts: Date.now(),
        action: "decrypt",
        kind: "text",
        fingerprint: fp,
        ok: false,
      });
    } finally {
      setDecBusy(false);
      setTimeout(() => setDecProgress(0), 250);
    }
  };

  const downloadDecryptedFile = () => {
    if (!decryptedFileBytes || !decryptedFileMeta) return toast.error("No decrypted file available");
    downloadBytes(decryptedFileBytes, decryptedFileMeta.filename, decryptedFileMeta.mime);
    toast.success("Downloaded");
  };

  const exportDecryptReport = () => {
    const payload = {
      tool: "PascoAI Crypto Lab",
      exportedAt: new Date().toISOString(),
      note: "Crypto runs locally in your browser using WebCrypto (AES-256-GCM). The token is shareable; only the correct key can decrypt.",
      decrypted: decryptedFileMeta
        ? { kind: "file", filename: decryptedFileMeta.filename, size: decryptedFileMeta.size, mime: decryptedFileMeta.mime }
        : decryptedText
        ? { kind: "text", length: decryptedText.length }
        : { kind: "none" },
      protection:
        "Protection: locks this device after 5 wrong attempts for the same token fingerprint (persists across refresh).",
    };
    exportResult(payload, "pascoai-crypto-report");
    toast.success(`Report exported (${exportFormat})`);
  };

  async function handlePasteDecrypt() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setTokenToDecrypt(text);
      setPasted(true);
      setTimeout(() => setPasted(false), 1500);
    } catch {
      toast.error("Clipboard access denied");
    }
  }

  return (
    <PageTransition className="space-y-6 max-w-5xl">
      {/* Animated Header */}
      <AnimatedPageHeading
        title="Crypto Lab"
        subtitle="Real, client-side encryption with shareable tokens (AES-256-GCM). Only the correct key can decrypt."
        badgeText="WEBCRYPTO API"
        badgeVariant="purple"
        statusText="Hardware Acceleration Active"
        statusColor="purple"
        icon={Lock}
      />

      <Tabs defaultValue="encrypt" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="encrypt" className="gap-2">
            <Lock className="w-4 h-4" />
            Encrypt
          </TabsTrigger>
          <TabsTrigger value="decrypt" className="gap-2">
            <Unlock className="w-4 h-4" />
            Decrypt
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ---------------- ENCRYPT ---------------- */}
        <TabsContent value="encrypt" className="space-y-6">
          <Card variant="glass" className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Encrypt (Text or File)
              </CardTitle>
              <CardDescription>
                Produces a shareable <span className="font-mono">PASCO1</span> token. Keep the key safe.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="relative">
                    <Input
                      value={encPassword}
                      onChange={(e) => setEncPassword(e.target.value)}
                      type={encShowKey ? "text" : "password"}
                      placeholder="Enter secret key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setEncShowKey((v) => !v)}
                      aria-label={encShowKey ? "Hide key" : "Show key"}
                    >
                      {encShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Tip: use long passphrases. (AES-GCM rejects wrong keys.)</p>
                </div>

                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Input value={encNote} onChange={(e) => setEncNote(e.target.value)} placeholder="e.g. project backup" />
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Export format sync:</span>
                    <Badge variant="outline" className="font-mono">{exportFormat}</Badge>
                  </div>
                </div>
              </div>

              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Text
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={plainText}
                    onChange={(e) => setPlainText(e.target.value)}
                    placeholder="Type the text you want to encrypt."
                    className="min-h-[140px]"
                  />

                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={runEncryptText} disabled={encBusy} className="min-w-[160px]">
                      <Lock className="w-4 h-4 mr-2" />
                      Encrypt Text
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPlainText("");
                        setEncryptedToken("");
                        toast.success("Cleared");
                      }}
                      disabled={encBusy}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  </div>

                  {encBusy && (
                    <div className="space-y-2 animate-fade-in">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Encrypting.</span>
                        <span className="font-mono text-primary">{Math.round(encProgress)}%</span>
                      </div>
                      <Progress value={encProgress} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="glass" className="border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary" />
                    File
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Select file</Label>
                      <Input
                        type="file"
                        onChange={(e) => setFileToEncrypt(e.target.files?.[0] || null)}
                        disabled={encBusy}
                      />
                      <p className="text-xs text-muted-foreground">
                        {fileToEncrypt ? (
                          <>
                            Selected: <span className="font-mono">{fileToEncrypt.name}</span> • {fmtBytes(fileToEncrypt.size)}
                          </>
                        ) : (
                          "No file selected."
                        )}
                      </p>
                    </div>

                    <Button onClick={runEncryptFile} disabled={encBusy || !fileToEncrypt} className="w-full">
                      <Lock className="w-4 h-4 mr-2" />
                      Encrypt File
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Output token */}
              {encryptedToken && (
                <Card variant="glow" className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" />
                      Encrypted Token
                    </CardTitle>
                    <CardDescription>Share this token. Without the key, it cannot be decrypted.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea value={encryptedToken} readOnly className="min-h-[140px] font-mono text-xs" />

                    <div className="flex gap-2 flex-wrap">
                      <Button variant="secondary" onClick={() => copyToClipboard(encryptedToken)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Token
                      </Button>
                      <Button variant="outline" onClick={downloadEncrypted}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Token ({exportFormat})
                      </Button>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground">
                      <span className="text-primary font-semibold">Note:</span> “Lock after 5 attempts” is a{" "}
                      <span className="text-foreground">per-device protection</span> (persists across refresh). If someone
                      copies the token to a different device/browser profile, they still get 5 tries there.
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- DECRYPT ---------------- */}
        <TabsContent value="decrypt" className="space-y-6">
          <Card variant="glass" className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unlock className="w-5 h-5 text-primary" />
                Decrypt Token
              </CardTitle>
              <CardDescription>
                Paste a <span className="font-mono">PASCO1</span> token and enter the key.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="relative">
                    <Input
                      value={decPassword}
                      onChange={(e) => setDecPassword(e.target.value)}
                      type={decShowKey ? "text" : "password"}
                      placeholder="Enter secret key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setDecShowKey((v) => !v)}
                      aria-label={decShowKey ? "Hide key" : "Show key"}
                    >
                      {decShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Protection</Label>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Lock after 5 wrong attempts</p>
                      <p className="text-xs text-muted-foreground">Persists on this device (doesn&apos;t reset on refresh).</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">Always ON</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Encrypted Token</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePasteDecrypt}>
                      Paste
                    </Button>
                    {pasted && <Badge className="threat-low">Pasted</Badge>}
                  </div>
                </div>

                <Textarea
                  value={tokenToDecrypt}
                  onChange={(e) => setTokenToDecrypt(e.target.value)}
                  placeholder="Paste PASCO1 token here."
                  className="min-h-[160px] font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={runDecrypt} disabled={decBusy} className="min-w-[160px]">
                  <Unlock className="w-4 h-4 mr-2" />
                  Decrypt
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setTokenToDecrypt("");
                    setDecryptedText("");
                    setDecryptedFileBytes(null);
                    setDecryptedFileMeta(null);
                    toast.success("Cleared");
                  }}
                  disabled={decBusy}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>

                <Button variant="secondary" onClick={exportDecryptReport} disabled={decBusy}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Report ({exportFormat})
                </Button>
              </div>

              {decBusy && (
                <div className="space-y-2 animate-fade-in">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Decrypting.</span>
                    <span className="font-mono text-primary">{Math.round(decProgress)}%</span>
                  </div>
                  <Progress value={decProgress} className="h-2" />
                </div>
              )}

              {/* Decrypted output */}
              {(decryptedText || decryptedFileBytes) && (
                <Card variant="glow" className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      Decrypted Output
                    </CardTitle>
                    <CardDescription>If you see this, the key was correct.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {decryptedText ? (
                      <>
                        <Textarea value={decryptedText} readOnly className="min-h-[140px]" />
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="secondary" onClick={() => copyToClipboard(decryptedText)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                          <Button variant="outline" onClick={() => downloadText(decryptedText, "pascoai-decrypted.txt")}>
                            <Download className="w-4 h-4 mr-2" />
                            Download .txt
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold">{decryptedFileMeta?.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtBytes(decryptedFileMeta?.size)} • {decryptedFileMeta?.mime || "application/octet-stream"}
                            </p>
                          </div>
                          <Badge variant="outline" className="font-mono">
                            file
                          </Badge>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button variant="secondary" onClick={downloadDecryptedFile}>
                            <Download className="w-4 h-4 mr-2" />
                            Download File
                          </Button>
                        </div>
                      </>
                    )}

                    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                      <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                      <p className="text-muted-foreground">
                        If you lose the key, recovery is not possible (AES-GCM + PBKDF2).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- HISTORY ---------------- */}
        <TabsContent value="history" className="space-y-6">
          <Card variant="glass" className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  History
                </CardTitle>
                <CardDescription>Last {history.length} actions (saved locally).</CardDescription>
              </div>

              <Button variant="outline" size="sm" onClick={clearHistory} disabled={history.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear History
              </Button>
            </CardHeader>

            <CardContent className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No crypto activity yet.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Badge className={h.ok ? "threat-low" : "threat-high"}>{h.ok ? "OK" : "FAIL"}</Badge>
                        <span className="capitalize">{h.action}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-mono text-xs">{h.kind}</span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(h.ts).toLocaleString()} • fp:{h.fingerprint.slice(0, 10)}…
                        {h.filename ? ` • ${h.filename}` : ""}
                        {h.size ? ` • ${fmtBytes(h.size)}` : ""}
                      </p>
                      {h.note && <p className="text-xs text-muted-foreground mt-1 truncate">note: {h.note}</p>}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (h.fingerprint && h.fingerprint !== "n/a" && h.fingerprint !== "unknown") {
                          copyToClipboard(h.fingerprint);
                        } else {
                          toast.error("No fingerprint to copy");
                        }
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy FP
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
