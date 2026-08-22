import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, before } from "node:test";

let ai;
let health;
let createEmailSecurityHandler;

async function load(entry, name) {
  const source = resolve(entry);
  const output = await build({
    stdin: { contents: await readFile(source, "utf8"), sourcefile: source, resolveDir: resolve("."), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [{ name: "api-test-resolver", setup(build) { build.onResolve({ filter: /^\.\/api-utils$/ }, () => ({ path: resolve("api/api-utils.ts") })); } }],
  });
  const dir = await mkdtemp(join(tmpdir(), "pasco-api-tests-"));
  const file = join(dir, `${name}.cjs`);
  await writeFile(file, output.outputFiles[0].text);
  return import(`file://${file}`);
}

function response() {
  const state = { statusCode: 0, body: "", headers: {} };
  return { state, value: { setHeader(name, value) { state.headers[name] = value; }, get statusCode() { return state.statusCode; }, set statusCode(value) { state.statusCode = value; }, end(body = "") { state.body = body; } } };
}

before(async () => {
  const [aiModule, healthModule, emailModule] = await Promise.all([load("api/ai.ts", "ai"), load("api/health.ts", "health"), load("api/email-security.ts", "email")]);
  ai = aiModule.default?.default ?? aiModule.default ?? aiModule;
  health = healthModule.default?.default ?? healthModule.default ?? healthModule;
  createEmailSecurityHandler = emailModule.createEmailSecurityHandler ?? emailModule.default?.createEmailSecurityHandler;
});

test("AI rejects malformed and oversized input without calling its upstream", async () => {
  const previous = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("unexpected"); };
  const r = response();
  await ai({ method: "POST", body: { prompt: "x".repeat(12_001) }, socket: { remoteAddress: "198.51.100.1" } }, r.value);
  assert.equal(r.state.statusCode, 400);
  assert.equal(JSON.parse(r.state.body).error.code, "invalid_request");
  assert.equal(called, false);
  globalThis.fetch = previous;
});

test("AI validates upstream output and returns a safe unavailable state", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  const r = response();
  await ai({ method: "POST", body: { prompt: "summarize defensive controls", deepMode: false }, socket: { remoteAddress: "198.51.100.2" } }, r.value);
  assert.equal(r.state.statusCode, 502);
  assert.equal(JSON.parse(r.state.body).error.code, "upstream_failure");
  process.env.GEMINI_API_KEY = previousKey;
  globalThis.fetch = previousFetch;
});

test("email inspection distinguishes missing records from DNS failures and keeps score unavailable", async () => {
  const positive = createEmailSecurityHandler({ resolveMx: async () => [{ exchange: "mail.example.com", priority: 10 }], resolveTxt: async (name) => name.startsWith("_dmarc") ? [["v=DMARC1; p=reject"]] : [["v=spf1 -all"]] });
  const positiveResponse = response();
  await positive({ method: "POST", body: { email: "person@example.com" }, socket: { remoteAddress: "198.51.100.30" } }, positiveResponse.value);
  const positiveResult = JSON.parse(positiveResponse.state.body);
  assert.equal(positiveResult.spf.status, "verified");
  assert.equal(positiveResult.dmarc.status, "verified");
  assert.equal(positiveResult.dkim.status, "unavailable");

  const handler = createEmailSecurityHandler({ resolveMx: async () => [], resolveTxt: async () => [] });
  const r = response();
  await handler({ method: "POST", body: { email: "person@example.com", content: "" }, socket: { remoteAddress: "198.51.100.3" } }, r.value);
  const result = JSON.parse(r.state.body);
  assert.equal(r.state.statusCode, 200);
  assert.equal(result.status, "partial");
  assert.equal(result.score, null);
  assert.equal(result.flags.find((flag) => flag.category === "spf").status, "missing");

  const unavailable = createEmailSecurityHandler({ resolveMx: async () => { const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); throw error; }, resolveTxt: async () => { const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); throw error; } });
  const r2 = response();
  await unavailable({ method: "POST", body: { email: "person@example.com" }, socket: { remoteAddress: "198.51.100.4" } }, r2.value);
  const failed = JSON.parse(r2.state.body);
  assert.equal(failed.status, "partial");
  assert.equal(failed.flags.find((flag) => flag.category === "mx").status, "unavailable");
});

test("email inspection rejects malformed input and health never claims missing AI is healthy", async () => {
  const email = createEmailSecurityHandler({ resolveMx: async () => [], resolveTxt: async () => [] });
  const malformed = response();
  await email({ method: "POST", body: { email: "not-an-email" }, socket: { remoteAddress: "198.51.100.5" } }, malformed.value);
  assert.equal(JSON.parse(malformed.state.body).status, "failed");
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const r = response();
  await health({ method: "GET" }, r.value);
  assert.equal(JSON.parse(r.state.body).status, "degraded");
  process.env.GEMINI_API_KEY = previousKey;
});
