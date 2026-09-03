import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

function apiDevPlugin(): Plugin {
  return {
    name: "pascoai-api-dev-server",
    configureServer(server) {
      // Ensure .env variables are loaded into process.env for API handlers
      const env = loadEnv(server.config.mode, process.cwd(), "");
      Object.assign(process.env, env);

      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          const parsedUrl = new URL(req.url, "http://localhost:8080");
          const endpointName = parsedUrl.pathname
            .replace(/^\/api\//, "")
            .split("?")[0]
            .replace(/\/$/, "");
          const modulePath = path.resolve(__dirname, `api/${endpointName}.ts`);

          if (fs.existsSync(modulePath)) {
            try {
              let body: any = {};
              if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
                }
                const rawBody = Buffer.concat(chunks).toString("utf-8");
                if (rawBody) {
                  try {
                    body = JSON.parse(rawBody);
                  } catch {
                    body = rawBody;
                  }
                }
              }

              (req as any).body = body;
              (req as any).query = Object.fromEntries(parsedUrl.searchParams.entries());

              const enhancedRes = res as any;
              enhancedRes.status = (code: number) => {
                enhancedRes.statusCode = code;
                return enhancedRes;
              };
              enhancedRes.json = (data: any) => {
                if (!enhancedRes.headersSent) {
                  enhancedRes.setHeader("Content-Type", "application/json");
                }
                enhancedRes.end(JSON.stringify(data));
                return enhancedRes;
              };
              enhancedRes.send = (data: any) => {
                enhancedRes.end(data);
                return enhancedRes;
              };

              const mod = await server.ssrLoadModule(`/api/${endpointName}.ts`);
              const handler = mod.default || mod;
              await handler(req, enhancedRes);
              return;
            } catch (err: any) {
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err?.message || "Internal server error in API route" }));
              }
              return;
            }
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  plugins: [
    react(),
    apiDevPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
