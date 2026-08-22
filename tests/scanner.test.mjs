import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { test, before, after } from "node:test";

let scanner;
let parseScanResult;
let server;
let serverPort;

async function compile(entryPoint) {
  const sourcePath = resolve(entryPoint);
  const output = buildSync({
    stdin: { contents: await readFile(sourcePath, "utf8"), sourcefile: sourcePath, resolveDir: resolve("."), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
  return output.outputFiles[0].text;
}

function requestToHandler(target, remoteAddress = "198.51.100.20") {
  const state = { statusCode: 0, body: "" };
  const response = {
    setHeader() {},
    get statusCode() { return state.statusCode; },
    set statusCode(value) { state.statusCode = value; },
    end(body) { state.body = body; },
  };
  return scanner.default({ url: `/api/scanner?target=${encodeURIComponent(target)}`, headers: {}, socket: { remoteAddress } }, response)
    .then(() => ({ statusCode: state.statusCode, data: JSON.parse(state.body) }));
}

before(async () => {
  const directory = await mkdtemp(join(tmpdir(), "pasco-scanner-tests-"));
  const apiPath = join(directory, "scanner.cjs");
  const clientPath = join(directory, "client.cjs");
  await writeFile(apiPath, await compile("api/scanner.ts"));
  await writeFile(clientPath, await compile("src/lib/scanner.ts"));
  const apiModule = await import(`file://${apiPath}`);
  const clientModule = await import(`file://${clientPath}`);
  scanner = apiModule.default ?? apiModule;
  parseScanResult = clientModule.parseScanResult ?? clientModule.default.parseScanResult;

  server = createServer((request, response) => {
    if (request.url === "/timeout") return;
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: `http://127.0.0.1:${serverPort}/final` });
      response.end();
      return;
    }
    const status = Number(request.url?.slice(1)) || 200;
    response.writeHead(status, { "content-type": "text/plain" });
    if (status === 599) return;
    response.end("fixture");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("blocks private, reserved, loopback, link-local, unique-local, and mapped IPv6 addresses", () => {
  const blocked = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1",
    "192.0.2.1", "192.168.1.1", "198.18.0.1", "203.0.113.1", "224.0.0.1", "::", "::1",
    "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2001:db8::1",
  ];
  for (const address of blocked) assert.equal(scanner.isPrivateIp(address), true, address);
  assert.equal(scanner.isPrivateIp("8.8.8.8"), false);
  assert.equal(scanner.isPrivateIp("2001:4860:4860::8888"), false);
});

test("rejects unsafe target URL policies", () => {
  assert.equal(scanner.isAllowedTargetUrl(new URL("https://example.com")), true);
  for (const value of ["ftp://example.com", "https://user:pass@example.com", "https://example.com:444"]) {
    assert.equal(scanner.isAllowedTargetUrl(new URL(value)), false, value);
  }
});

test("reports HTTP 2xx, 3xx, 4xx, and 5xx responses as verified transport evidence", async () => {
  for (const status of [200, 302, 404, 500]) {
    const result = await scanner.probeUrl(new URL(`http://127.0.0.1:${serverPort}/${status}`), ["127.0.0.1"]);
    assert.equal(result.status, "verified");
    assert.equal(result.statusCode, status);
  }
});

test("follows a redirect only after validating its destination", async () => {
  const result = await scanner.probeUrl(new URL(`http://127.0.0.1:${serverPort}/redirect`), ["127.0.0.1"]);
  assert.equal(result.status, "partial");
  assert.equal(result.redirect?.followed, false);
  assert.equal(result.error, "redirect_blocked");
});

test("tries another already-validated address without hostname re-resolution", async () => {
  const result = await scanner.probeUrl(new URL(`http://example.test:${serverPort}/200`), ["127.0.0.2", "127.0.0.1"]);
  assert.equal(result.status, "verified");
  assert.equal(result.statusCode, 200);
});

test("classifies timeout and connection refusal as unavailable or failed, never as vulnerabilities", async () => {
  const timeout = await scanner.probeUrl(new URL(`http://127.0.0.1:${serverPort}/timeout`), ["127.0.0.1"], 0, 20);
  assert.equal(timeout.status, "unavailable");
  assert.equal(timeout.error, "timeout");
  const refused = await scanner.probeUrl(new URL("http://127.0.0.1:1/"), ["127.0.0.1"], 0, 100);
  assert.equal(refused.status, "failed");
  assert.equal(refused.error, "connection_refused");
});

test("rejects malformed client responses", () => {
  assert.throws(() => parseScanResult({ target: "example.com", score: 100, status: "verified", scannedAt: new Date().toISOString(), results: [{}] }));
  assert.throws(() => parseScanResult({ target: "example.com", score: 100, status: "verified", scannedAt: new Date().toISOString(), results: [{ category: "x", icon: "Eye", findings: [{ title: "x", severity: "high", status: "verified", description: "x", recommendation: "x", evidence: { bad: {} } }] }] }));
});

test("returns controlled DNS and private-target errors", async () => {
  const dnsFailure = await requestToHandler("does-not-exist.invalid");
  assert.equal(dnsFailure.statusCode, 400);
  assert.equal(dnsFailure.data.code, "dns_failure");
  const privateTarget = await requestToHandler("127.0.0.1");
  assert.equal(privateTarget.statusCode, 400);
  assert.equal(privateTarget.data.code, "private_target");
});

test("enforces the per-IP request budget", async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await requestToHandler("does-not-exist.invalid", "198.51.100.40");
    assert.equal(result.statusCode, 400);
  }
  const limited = await requestToHandler("does-not-exist.invalid", "198.51.100.40");
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.data.code, "rate_limited");
});

test("returns no posture score when public TLS verification fails", async () => {
  const result = await requestToHandler("https://expired.badssl.com");
  assert.equal(result.statusCode, 200);
  assert.equal(result.data.status, "failed");
  assert.equal(result.data.score, null);
});
