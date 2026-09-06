import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ROOT = resolve(process.env.CLIENT_DIST_DIR || join(process.cwd(), "dist"));
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1_048_576);

type ApiHandler = (req: IncomingMessage & { body?: unknown; query?: Record<string, string> }, res: ServerResponse & {
  status: (code: number) => ServerResponse;
  json: (data: unknown) => ServerResponse;
  send: (data: string | Buffer) => ServerResponse;
}) => unknown;

const apiRoutes: Record<string, () => Promise<unknown>> = {
  ai: () => import("../api/ai.ts"),
  assets: () => import("../api/assets.ts"),
  auth: () => import("../api/auth.ts"),
  "email-security": () => import("../api/email-security.ts"),
  health: () => import("../api/health.ts"),
  migration: () => import("../api/migration.ts"),
  scanner: () => import("../api/scanner.ts"),
  scans: () => import("../api/scans.ts"),
  "web-security": () => import("../api/web-security.ts"),
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function logServerError(message: string) {
  console.error(`[production-http] ${message}`);
}

function respondJson(res: ServerResponse, statusCode: number, payload: unknown) {
  if (res.headersSent) return res;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
  return res;
}

function respondApiNotFound(res: ServerResponse) {
  return respondJson(res, 404, { error: "API route not found" });
}

function attachResponseHelpers(res: ServerResponse) {
  const enhanced = res as ServerResponse & { status: (code: number) => ServerResponse; json: (data: unknown) => ServerResponse; send: (data: string | Buffer) => ServerResponse };
  enhanced.status = (code) => {
    enhanced.statusCode = code;
    return enhanced;
  };
  enhanced.json = (data) => {
    if (!enhanced.headersSent) enhanced.setHeader("Content-Type", "application/json; charset=utf-8");
    enhanced.end(JSON.stringify(data));
    return enhanced;
  };
  enhanced.send = (data) => {
    enhanced.end(data);
    return enhanced;
  };
  return enhanced;
}

async function parseBody(req: IncomingMessage) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) return {};

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    req.resume();
    throw Object.assign(new Error("request_body_too_large"), { statusCode: 413 });
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("request_body_too_large"), { statusCode: 413 });
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return {};
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw Object.assign(new Error("malformed_json"), { statusCode: 400 });
    }
  }
  return rawBody;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL) {
  const routeName = pathname.slice("/api/".length).replace(/\/$/, "");
  const loadHandler = apiRoutes[routeName];
  if (!loadHandler) return respondApiNotFound(res);

  try {
    const body = await parseBody(req);
    const enhancedReq = req as IncomingMessage & { body?: unknown; query?: Record<string, string> };
    enhancedReq.body = body;
    enhancedReq.query = Object.fromEntries(url.searchParams.entries());
    const module = await loadHandler() as { default?: ApiHandler } | ApiHandler;
    const handler = typeof module === "function" ? module : module.default;
    if (typeof handler !== "function") return respondApiNotFound(res);
    await handler(enhancedReq, attachResponseHelpers(res));
    if (!res.writableEnded) res.end();
  } catch (error) {
    const statusCode = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 500;
    if (statusCode === 400) return respondJson(res, 400, { error: "Malformed request body" });
    if (statusCode === 413) return respondJson(res, 413, { error: "Request body too large" });
    logServerError(`API request failed method=${req.method || "UNKNOWN"} route=${pathname}`);
    return respondJson(res, 500, { error: "Internal server error" });
  }
}

function safeClientPath(pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded.replace(/^\/+/, "");
  const candidate = resolve(CLIENT_ROOT, normalize(relativePath));
  return candidate === CLIENT_ROOT || candidate.startsWith(CLIENT_ROOT + "\\") || candidate.startsWith(CLIENT_ROOT + "/") ? candidate : null;
}

function serveFrontend(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (req.method !== "GET" && req.method !== "HEAD") return respondJson(res, 405, { error: "Method not allowed" });
  let clientPath: string | null;
  try {
    clientPath = safeClientPath(pathname);
  } catch {
    return respondJson(res, 400, { error: "Malformed URL" });
  }
  if (!clientPath) return respondJson(res, 400, { error: "Invalid path" });

  const requestedFile = existsSync(clientPath) && statSync(clientPath).isFile() ? clientPath : join(CLIENT_ROOT, "index.html");
  if (!existsSync(requestedFile)) return respondJson(res, 503, { error: "Frontend build is unavailable" });
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extname(requestedFile).toLowerCase()] || "application/octet-stream");
  if (req.method === "HEAD") return res.end();
  return createReadStream(requestedFile).pipe(res);
}

export function createProductionServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname, url);
      return serveFrontend(req, res, url.pathname);
    } catch {
      logServerError("Request parsing failed");
      return respondJson(res, 400, { error: "Malformed request" });
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  const server = createProductionServer();
  server.listen(PORT, HOST, () => console.log(`[production-http] listening on ${HOST}:${PORT}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}