import assert from "node:assert/strict";
import { request } from "node:http";
import { test, before, after } from "node:test";

process.env.NODE_ENV = "test";
const { createProductionServer } = await import("../dist-server/server.js");
const server = createProductionServer();
let baseUrl;

function get(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${path}`, { method: options.method || "GET", headers: options.headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("serves frontend HTML and SPA routes without Vite", async () => {
  const root = await get("/");
  assert.equal(root.status, 200);
  assert.match(root.type, /text\/html/);
  assert.match(root.body, /<!doctype html>/i);

  const spa = await get("/dashboard");
  assert.equal(spa.status, 200);
  assert.match(spa.type, /text\/html/);
});

test("keeps API routing separate from SPA fallback", async () => {
  const health = await get("/api/health");
  assert.equal(health.status, 200);
  assert.match(health.type, /application\/json/);

  const missing = await get("/api/unknown-route");
  assert.equal(missing.status, 404);
  assert.match(missing.type, /application\/json/);
  assert.doesNotMatch(missing.body, /<!doctype html>/i);
});

test("rejects malformed JSON at the production boundary", async () => {
  const response = await get("/api/health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{malformed",
  });
  assert.equal(response.status, 400);
  assert.match(response.type, /application\/json/);
  assert.deepEqual(JSON.parse(response.body), { error: "Malformed request body" });
});