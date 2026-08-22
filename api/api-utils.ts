export type ApiStatus = "verified" | "partial" | "failed" | "unavailable";
export type ApiErrorCode = "method_not_allowed" | "invalid_request" | "rate_limited" | "service_unavailable" | "upstream_failure" | "timeout" | "internal_error";

export type ApiRequest = { method?: string; headers?: Record<string, string | undefined>; socket?: { remoteAddress?: string } };
export type ApiResponse = { setHeader(name: string, value: string): void; statusCode: number; end(body?: string): unknown };

export function sendJson(res: ApiResponse, statusCode: number, payload: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = statusCode;
  return res.end(JSON.stringify(payload));
}

export function sendError(res: ApiResponse, statusCode: number, code: ApiErrorCode, message: string, status: ApiStatus = "failed") {
  return sendJson(res, statusCode, { status, error: { code, message } });
}

export function clientKey(req: ApiRequest) {
  return (req.socket?.remoteAddress || "unknown").slice(0, 128);
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), timeoutMs);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export function createRateLimiter(windowMs: number, maxRequests: number, maxActive: number) {
  const entries = new Map<string, { started: number; requests: number; active: number }>();
  let active = 0;
  return {
    acquire(key: string) {
      const now = Date.now();
      const entry = entries.get(key);
      const current = !entry || now - entry.started >= windowMs ? { started: now, requests: 0, active: 0 } : entry;
      entries.set(key, current);
      const retryAfter = Math.max(1, Math.ceil((current.started + windowMs - now) / 1000));
      if (current.requests >= maxRequests || current.active >= maxActive || active >= maxActive) return { allowed: false, retryAfter, release: () => undefined };
      current.requests += 1;
      current.active += 1;
      active += 1;
      return { allowed: true, retryAfter: 0, release: () => { current.active = Math.max(0, current.active - 1); active = Math.max(0, active - 1); } };
    },
  };
}
