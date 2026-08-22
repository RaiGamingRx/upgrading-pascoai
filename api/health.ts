import { ApiRequest, ApiResponse, sendError, sendJson } from "./api-utils";

type HealthRequest = ApiRequest;

export default async function handler(req: HealthRequest, res: ApiResponse) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "method_not_allowed", "Only GET and HEAD are supported.");
  const aiConfigured = typeof process.env.GEMINI_API_KEY === "string" && process.env.GEMINI_API_KEY.length > 0;
  const payload = {
    status: aiConfigured ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    services: {
      ai: { status: aiConfigured ? "configured" : "unavailable" },
      scanner: { status: "available" },
      webSecurity: { status: "available" },
      emailSecurity: { status: "available" },
    },
  };
  if (req.method === "HEAD") {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    return res.end();
  }
  return sendJson(res, 200, payload);
}
