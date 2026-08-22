// src/lib/aiClient.ts

export type AIInlineFile = {
  name: string;
  mimeType: string; // e.g. "application/pdf"
  dataBase64: string; // base64 WITHOUT data: prefix
  size: number;
};

export async function runAI({
  prompt,
  persona,
  deepMode,
  file,
}: {
  prompt: string;
  persona: string;
  deepMode: boolean;
  file?: AIInlineFile | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ prompt, persona, deepMode, file }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || "AI request failed");
    }

    return data as { response: string; modelUsed?: string };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Request timed out. Try again (or upload a smaller PDF).");
    }
    throw new Error(e?.message || "AI request failed");
  } finally {
    clearTimeout(timeout);
  }
}
