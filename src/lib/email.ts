// src/lib/email.ts
// Real server-backed email security inspector with DNS MX, SPF, DMARC, and phishing analysis

export type EmailFlagLevel = "safe" | "warning" | "critical";

export interface EmailScanFlag {
  level: EmailFlagLevel;
  category?: string;
  title?: string;
  message: string;
  details?: string;
}

export interface EmailScanResult {
  email: string;
  domain?: string;
  valid: boolean;
  disposable: boolean;
  roleBased: boolean;
  provider: "google" | "microsoft" | "yahoo" | "proton" | "custom";
  confidence?: "high" | "medium" | "low";
  mxRecords?: { exchange: string; priority: number }[];
  spf?: { present: boolean; record?: string; strength: string };
  dmarc?: { present: boolean; record?: string; policy: string };
  score: number;
  flags: EmailScanFlag[];
  scannedAt: number;
}

export async function analyzeEmail(
  email: string,
  content?: string
): Promise<EmailScanResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("Please enter an email address");
  }

  const res = await fetch("/api/email-security", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: trimmed,
      content: content?.trim() || undefined,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.error) {
    throw new Error(data?.error || `Email verification failed (${res.status})`);
  }

  return {
    ...data,
    scannedAt: data.scannedAt ? new Date(data.scannedAt).getTime() : Date.now(),
    confidence: data.valid && !data.disposable && data.mxRecords?.length ? "high" : "medium",
  };
}
