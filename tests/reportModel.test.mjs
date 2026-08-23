import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

let reportModule;

async function compileReportModel() {
  const sourcePath = resolve("./src/lib/reportModel.ts");
  const output = buildSync({
    stdin: {
      contents: await readFile(sourcePath, "utf8"),
      sourcefile: sourcePath,
      resolveDir: resolve("."),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });

  const moduleText = output.outputFiles[0].text;
  const mod = { exports: {} };
  const fn = new Function("module", "exports", "require", moduleText);
  fn(mod, mod.exports, (name) => {
    throw new Error(`Unexpected import: ${name}`);
  });
  return mod.exports;
}

test("Target Normalization", async (t) => {
  if (!reportModule) reportModule = await compileReportModel();
  const { normalizeTarget } = reportModule;

  await t.test("normalizes https URLs with paths", () => {
    assert.equal(normalizeTarget("https://example.com/login?param=1"), "example.com");
  });

  await t.test("normalizes http URLs with custom ports", () => {
    assert.equal(normalizeTarget("http://api.security.internal:8080/v1"), "api.security.internal");
  });

  await t.test("normalizes bare hostnames with uppercase", () => {
    assert.equal(normalizeTarget("  CYBER.PASCOAI.ORG  "), "cyber.pascoai.org");
  });

  await t.test("extracts domain portion from email addresses", () => {
    assert.equal(normalizeTarget("analyst@enterprise-corp.com"), "enterprise-corp.com");
  });
});

test("Executive Report Generation & Verification Taxonomy", async (t) => {
  if (!reportModule) reportModule = await compileReportModel();
  const { generateExecutiveReport, getAvailableReportTargets } = reportModule;

  const mockStorageData = {
    scannerHistory: [
      {
        target: "portal.defense.net",
        score: 85,
        status: "verified",
        date: "2026-08-20",
        results: [
          {
            category: "Host Recon",
            icon: "Eye",
            findings: [
              {
                title: "Exposed Server Header Detected",
                severity: "low",
                status: "verified",
                description: "Server exposes version in header.",
                recommendation: "Remove Server version banner.",
                evidence: { header: "nginx/1.24" },
              },
            ],
          },
        ],
      },
    ],
    websecHistory: [
      {
        url: "https://portal.defense.net",
        finalUrl: "https://portal.defense.net",
        statusCode: 200,
        https: true,
        score: 90,
        grade: "A",
        issues: [],
        headerStatus: {
          "content-security-policy": { present: true, value: "default-src 'self'" },
          "strict-transport-security": { present: false },
        },
        certificate: {
          issuer: "Let's Encrypt",
          daysRemaining: 65,
          expired: false,
        },
        scannedAt: "2026-08-21T10:00:00.000Z",
      },
    ],
    emailHistory: [
      {
        email: "security@portal.defense.net",
        domain: "portal.defense.net",
        valid: true,
        score: 88,
        spf: { present: true, strength: "strict", record: "v=spf1 include:_spf.google.com ~all" },
        dmarc: { present: true, policy: "quarantine" },
        mxRecords: [{ exchange: "aspmx.l.google.com", priority: 1 }],
        scannedAt: 1724230000000,
      },
    ],
    researchHistory: [
      {
        topic: "Zero-Day Log4j Variant Mitigation",
        persona: "SOC Analyst",
        date: "2026-08-22",
      },
    ],
    simulationHistory: [
      {
        toolId: "dictionary",
        title: "Dictionary Attack Simulation",
        categoryId: "password",
        date: "2026-08-21",
      },
    ],
  };

  await t.test("discovers distinct available targets", () => {
    const targets = getAvailableReportTargets(mockStorageData);
    assert.deepEqual(targets, ["portal.defense.net"]);
  });

  await t.test("generates targeted report with strict taxonomy labeling", () => {
    const report = generateExecutiveReport({
      selectedTarget: "portal.defense.net",
      storageData: mockStorageData,
    });

    assert.equal(report.target, "portal.defense.net");
    assert.equal(report.isMultiTarget, false);
    assert.ok(report.summary.overallPostureScore !== null);
    assert.equal(report.summary.overallPostureScore, 88);
    assert.equal(report.domains.length, 3);

    // Operations / Scanner Domain
    const opsDomain = report.domains.find((d) => d.id === "operations-scanner");
    assert.ok(opsDomain);
    assert.equal(opsDomain.findings[0].verificationClass, "VERIFIED_EVIDENCE");
    assert.equal(opsDomain.findings[0].title, "Exposed Server Header Detected");

    // WebSec Domain
    const webDomain = report.domains.find((d) => d.id === "audit-websec");
    assert.ok(webDomain);
    assert.equal(webDomain.findings[0].verificationClass, "VERIFIED_EVIDENCE");
    assert.ok(webDomain.cleanChecks.length > 0);

    // AI Threat Analysis Isolation
    assert.equal(report.aiAnalysis.length, 1);
    assert.equal(report.aiAnalysis[0].verificationClass, "AI_THREAT_ANALYSIS");
    assert.equal(report.aiAnalysis[0].persona, "SOC ANALYST");

    // Simulation Isolation
    assert.equal(report.simulations.length, 1);
    assert.equal(report.simulations[0].verificationClass, "TRAINING_SIMULATION");
  });

  await t.test("handles empty storage gracefully with INSUFFICIENT DATA", () => {
    const report = generateExecutiveReport({
      selectedTarget: "nonexistent.example.org",
      storageData: {},
    });

    assert.equal(report.summary.overallPostureScore, null);
    assert.equal(report.summary.scoreLabel, "INSUFFICIENT DATA");
    assert.equal(report.domains.length, 0);
    assert.equal(report.summary.totalVerifiedFindings, 0);
  });
});
