import { ApiRequest, ApiResponse, clientKey, createRateLimiter, sendError, sendJson } from "./api-utils";

const MAX_PROMPT_CHARS = 12_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 32_000;
const limiter = createRateLimiter(60_000, 8, 2);

type InlineFile = { name: string; mimeType: "application/pdf"; dataBase64: string; size: number };
type AiRequest = ApiRequest & { body?: unknown };
type GeminiPart = { text?: unknown };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };

function parseBody(value: unknown): { prompt: string; persona: string; deepMode: boolean; file: InlineFile | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0 || body.prompt.length > MAX_PROMPT_CHARS) return null;
  if (body.persona !== undefined && (typeof body.persona !== "string" || body.persona.length > 64)) return null;
  if (body.deepMode !== undefined && typeof body.deepMode !== "boolean") return null;
  if (body.file === undefined || body.file === null) return { prompt: body.prompt.trim(), persona: typeof body.persona === "string" ? body.persona : "security", deepMode: body.deepMode === true, file: null };
  if (typeof body.file !== "object" || Array.isArray(body.file)) return null;
  const file = body.file as Record<string, unknown>;
  if (typeof file.name !== "string" || file.name.length === 0 || file.name.length > 255 || file.mimeType !== "application/pdf" || typeof file.dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64) || typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES || file.dataBase64.length > MAX_BASE64_CHARS) return null;
  const decodedSize = Math.floor(file.dataBase64.length * 3 / 4) - (file.dataBase64.endsWith("==") ? 2 : file.dataBase64.endsWith("=") ? 1 : 0);
  if (decodedSize !== file.size) return null;
  return { prompt: body.prompt.trim(), persona: typeof body.persona === "string" ? body.persona : "security", deepMode: body.deepMode === true, file: { name: file.name, mimeType: "application/pdf", dataBase64: file.dataBase64, size: file.size } };
}

function extractText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const json = value as GeminiResponse;
  for (const candidate of json.candidates || []) {
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((part) => typeof part.text === "string" ? part.text : "").join("\n").trim();
    if (text && text.length <= MAX_RESPONSE_CHARS) return text;
  }
  return null;
}

export default async function handler(req: AiRequest, res: ApiResponse) {
  if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "Only POST is supported.");
  const limit = limiter.acquire(clientKey(req));
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return sendError(res, 429, "rate_limited", "AI request rate limit exceeded.", "unavailable");
  }
  try {
    const body = parseBody(req.body);
    if (!body) return sendError(res, 400, "invalid_request", "Request must contain a bounded prompt, optional persona, boolean deepMode, and an optional PDF file.");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendError(res, 503, "service_unavailable", "AI analysis is not configured.", "unavailable");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const parts: Array<Record<string, unknown>> = body.file ? [{ inlineData: { mimeType: body.file.mimeType, data: body.file.dataBase64 } }] : [];
      parts.push({ text: `You are a defensive cybersecurity research assistant. Persona: ${body.persona}. Analysis mode: ${body.deepMode ? "deep" : "standard"}. Provide defensive, high-level analysis only.\n\nUser request:\n${body.prompt}` });
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 1400 } }) });
      const text = await upstream.text();
      if (!upstream.ok) return sendError(res, upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : 502, upstream.status === 429 ? "rate_limited" : "upstream_failure", upstream.status === 429 ? "AI provider rate limit reached. Retry later." : "AI provider could not complete the request.", "unavailable");
      if (text.length > MAX_RESPONSE_CHARS * 2) return sendError(res, 502, "upstream_failure", "AI provider returned an oversized response.");
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return sendError(res, 502, "upstream_failure", "AI provider returned an invalid response."); }
      const response = extractText(parsed);
      if (!response) return sendError(res, 502, "upstream_failure", "AI provider returned no usable analysis.");
      return sendJson(res, 200, { status: "verified", response, modelUsed: "gemini-2.5-flash" });
    } catch (error) {
      return sendError(res, error instanceof Error && error.name === "AbortError" ? 504 : 503, error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_failure", error instanceof Error && error.name === "AbortError" ? "AI provider request timed out." : "AI provider is unavailable.", "unavailable");
    } finally { clearTimeout(timer); }
  } finally { limit.release(); }
}
