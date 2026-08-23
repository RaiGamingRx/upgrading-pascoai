import assert from "node:assert/strict";
import { test } from "node:test";
import { EnterpriseDbClient, inMemoryDb } from "../api/db-engine.ts";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  rotateRefreshToken,
} from "../api/auth-engine.ts";
import { authenticateAndAuthorize, isPermitted, SecurityAction } from "../api/rbac.ts";
import authHandler from "../api/auth.ts";
import migrationHandler from "../api/migration.ts";
import assetsHandler from "../api/assets.ts";
import scansHandler from "../api/scans.ts";

function mockResponse() {
  const state = { statusCode: 200, body: "", headers: {} };
  return {
    state,
    value: {
      setHeader(name, value) {
        state.headers[name.toLowerCase()] = value;
      },
      status(code) {
        state.statusCode = code;
        return this;
      },
      json(data) {
        state.body = JSON.stringify(data);
        return this;
      },
      send(data) {
        state.body = data;
        return this;
      },
      end(data = "") {
        if (data) state.body = data;
      },
    },
  };
}

test("PASCOAI ENTERPRISE OS — STAGE 8.1 SECURITY & RLS AUDIT SUITE", async (t) => {
  // Clear in-memory database before test suite runs
  inMemoryDb.clear();

  const db = new EnterpriseDbClient();

  // --------------------------------------------------------------------------
  // TEST FIXTURES SETUP
  // --------------------------------------------------------------------------
  // Organization A (Acme Cyber)
  const orgA = await db.createOrganization("Acme Cyber Inc", "acme-cyber");
  const wsA1 = await db.createWorkspace(orgA.id, "Acme Production Perimeter", "production", true);
  const wsA2 = await db.createWorkspace(orgA.id, "Acme Staging Perimeter", "staging", false);

  // Organization B (Globex Defense)
  const orgB = await db.createOrganization("Globex Defense Corp", "globex-defense");
  const wsB1 = await db.createWorkspace(orgB.id, "Globex Cloud Perimeter", "production", true);

  // Users in Org A
  const passwordHash = await hashPassword("ComplexPass123!_SecOps");
  const userAdminA = await db.createUser({
    email: "admin@acme.com",
    display_name: "Acme Admin",
    password_hash: passwordHash,
    is_active: true,
  });
  await db.addWorkspaceMember(orgA.id, wsA1.id, userAdminA.id, "org_admin");
  await db.addWorkspaceMember(orgA.id, wsA2.id, userAdminA.id, "org_admin");

  const userSecOpsA = await db.createUser({
    email: "secops@acme.com",
    display_name: "Acme SecOps Analyst",
    password_hash: passwordHash,
    is_active: true,
  });
  await db.addWorkspaceMember(orgA.id, wsA1.id, userSecOpsA.id, "secops_analyst");

  const userAuditorA = await db.createUser({
    email: "auditor@acme.com",
    display_name: "Acme Compliance Auditor",
    password_hash: passwordHash,
    is_active: true,
  });
  await db.addWorkspaceMember(orgA.id, wsA1.id, userAuditorA.id, "compliance_auditor");

  const userViewerA = await db.createUser({
    email: "viewer@acme.com",
    display_name: "Acme Read Only Viewer",
    password_hash: passwordHash,
    is_active: true,
  });
  await db.addWorkspaceMember(orgA.id, wsA1.id, userViewerA.id, "viewer");

  // User in Org B
  const userAdminB = await db.createUser({
    email: "admin@globex.com",
    display_name: "Globex Admin",
    password_hash: passwordHash,
    is_active: true,
  });
  await db.addWorkspaceMember(orgB.id, wsB1.id, userAdminB.id, "org_admin");

  // Populate Assets in Org A (wsA1)
  const clientA = new EnterpriseDbClient({
    organizationId: orgA.id,
    workspaceId: wsA1.id,
    userId: userAdminA.id,
    role: "org_admin",
  });
  const assetA1 = await clientA.createAsset({
    targetType: "domain",
    targetValue: "acme-defense.internal",
    criticality: "tier_1_mission_critical",
  });

  // Populate Assets in Org B (wsB1)
  const clientB = new EnterpriseDbClient({
    organizationId: orgB.id,
    workspaceId: wsB1.id,
    userId: userAdminB.id,
    role: "org_admin",
  });
  const assetB1 = await clientB.createAsset({
    targetType: "domain",
    targetValue: "globex-secret.defense",
    criticality: "tier_1_mission_critical",
  });

  // Sign Tokens for tests
  const tokenAdminA = signAccessToken({
    sub: userAdminA.id,
    email: userAdminA.email,
    displayName: userAdminA.display_name,
    organizationId: orgA.id,
    workspaceId: wsA1.id,
    role: "org_admin",
  });

  const tokenSecOpsA = signAccessToken({
    sub: userSecOpsA.id,
    email: userSecOpsA.email,
    displayName: userSecOpsA.display_name,
    organizationId: orgA.id,
    workspaceId: wsA1.id,
    role: "secops_analyst",
  });

  const tokenAuditorA = signAccessToken({
    sub: userAuditorA.id,
    email: userAuditorA.email,
    displayName: userAuditorA.display_name,
    organizationId: orgA.id,
    workspaceId: wsA1.id,
    role: "compliance_auditor",
  });

  const tokenViewerA = signAccessToken({
    sub: userViewerA.id,
    email: userViewerA.email,
    displayName: userViewerA.display_name,
    organizationId: orgA.id,
    workspaceId: wsA1.id,
    role: "viewer",
  });

  const tokenAdminB = signAccessToken({
    sub: userAdminB.id,
    email: userAdminB.email,
    displayName: userAdminB.display_name,
    organizationId: orgB.id,
    workspaceId: wsB1.id,
    role: "org_admin",
  });

  // --------------------------------------------------------------------------
  // TEST 1: Tenant A cannot read Tenant B
  // --------------------------------------------------------------------------
  await t.test("1. Tenant A cannot read Tenant B", async () => {
    // User from Org A queries assets endpoint
    const res = mockResponse();
    await assetsHandler(
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenAdminA}` },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 200);
    const data = JSON.parse(res.state.body);
    const targetValues = data.assets.map((a) => a.target_value);
    
    assert.ok(targetValues.includes("acme-defense.internal"), "Tenant A sees own asset");
    assert.ok(!targetValues.includes("globex-secret.defense"), "Tenant A CANNOT see Tenant B asset");
  });

  // --------------------------------------------------------------------------
  // TEST 2: Tenant A cannot modify Tenant B
  // --------------------------------------------------------------------------
  await t.test("2. Tenant A cannot modify Tenant B", async () => {
    // User from Org A attempts to modify asset belonging to Org B
    const res = mockResponse();
    await assetsHandler(
      {
        method: "PUT",
        headers: { authorization: `Bearer ${tokenAdminA}` },
        query: { id: assetB1.id },
        body: { target_value: "hacked-by-tenant-a.com" },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 404, "Modification denied; returns 404/denial");
    
    // Verify Org B asset is unchanged
    const bAsset = await clientB.getAssetById(assetB1.id);
    assert.equal(bAsset.target_value, "globex-secret.defense");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Workspace A cannot access Workspace B within the same organization when unauthorized
  // --------------------------------------------------------------------------
  await t.test("3. Workspace A cannot access Workspace B within same org when unauthorized", async () => {
    // userSecOpsA is only a member of wsA1 (not wsA2)
    const res = mockResponse();
    await assetsHandler(
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${tokenSecOpsA}`,
          "x-workspace-id": wsA2.id, // Trying to access wsA2
        },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 403, "Access to unauthorized workspace is forbidden");
    assert.ok(JSON.parse(res.state.body).error.includes("FORBIDDEN"));
  });

  // --------------------------------------------------------------------------
  // TEST 4: SecOps Analyst cannot perform Admin actions
  // --------------------------------------------------------------------------
  await t.test("4. SecOps Analyst cannot perform Admin actions", async () => {
    // Check RBAC engine action gating
    assert.equal(isPermitted("secops_analyst", SecurityAction.MANAGE_ORG), false);
    assert.equal(isPermitted("secops_analyst", SecurityAction.MANAGE_MEMBERS), false);
    assert.equal(isPermitted("secops_analyst", SecurityAction.DELETE_ASSET), false);

    // SecOps Analyst tries to delete asset
    const res = mockResponse();
    await assetsHandler(
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokenSecOpsA}` },
        query: { id: assetA1.id },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 403);
    assert.ok(JSON.parse(res.state.body).error.includes("FORBIDDEN"));
  });

  // --------------------------------------------------------------------------
  // TEST 5: Viewer cannot initiate scans
  // --------------------------------------------------------------------------
  await t.test("5. Viewer cannot initiate scans", async () => {
    assert.equal(isPermitted("viewer", SecurityAction.RUN_SCAN), false);

    const res = mockResponse();
    await scansHandler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${tokenViewerA}` },
        body: { assetId: assetA1.id },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 403);
    assert.ok(JSON.parse(res.state.body).error.includes("FORBIDDEN"));
  });

  // --------------------------------------------------------------------------
  // TEST 6: Compliance Auditor cannot modify assets
  // --------------------------------------------------------------------------
  await t.test("6. Compliance Auditor cannot modify assets", async () => {
    assert.equal(isPermitted("compliance_auditor", SecurityAction.MODIFY_ASSET), false);
    assert.equal(isPermitted("compliance_auditor", SecurityAction.CREATE_ASSET), false);

    const res = mockResponse();
    await assetsHandler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${tokenAuditorA}` },
        body: { targetType: "domain", targetValue: "auditor-attempt.com" },
      },
      res.value
    );
    assert.equal(res.state.statusCode, 403);
    assert.ok(JSON.parse(res.state.body).error.includes("FORBIDDEN"));
  });

  // --------------------------------------------------------------------------
  // TEST 7: Guessing another resource UUID returns denial/not-found without disclosure
  // --------------------------------------------------------------------------
  await t.test("7. Guessing another resource UUID returns denial/not-found without disclosure", async () => {
    // Org A queries asset ID of Org B directly
    const res = mockResponse();
    await assetsHandler(
      {
        method: "GET",
        headers: { authorization: `Bearer ${tokenAdminA}` },
        query: { id: assetB1.id }, // Target Org B UUID
      },
      res.value
    );
    assert.equal(res.state.statusCode, 404);
    const body = JSON.parse(res.state.body);
    assert.equal(body.error, "Asset not found");
    assert.equal(body.target_value, undefined, "No metadata leaked");
  });

  // --------------------------------------------------------------------------
  // TEST 8: Missing tenant context fails closed
  // --------------------------------------------------------------------------
  await t.test("8. Missing tenant context fails closed", async () => {
    const unauthenticatedClient = new EnterpriseDbClient(null);
    await assert.rejects(
      async () => {
        await unauthenticatedClient.getAssets();
      },
      /RLS_SECURITY_VIOLATION/
    );

    await assert.rejects(
      async () => {
        await unauthenticatedClient.getScans();
      },
      /RLS_SECURITY_VIOLATION/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 9: RLS remains enforced even if application-level filtering is accidentally omitted
  // --------------------------------------------------------------------------
  await t.test("9. RLS remains enforced even if application-level filtering is omitted", async () => {
    // Direct DB client query for Org A
    const assetsForA = await clientA.getAssets();
    const assetsForB = await clientB.getAssets();

    assert.equal(assetsForA.every((a) => a.organization_id === orgA.id), true);
    assert.equal(assetsForB.every((b) => b.organization_id === orgB.id), true);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Refresh-token reuse invalidates the token family
  // --------------------------------------------------------------------------
  await t.test("10. Refresh-token reuse invalidates the token family", async () => {
    // 1. Create fresh token family
    const { rawToken: token1, familyId } = await createRefreshToken(db, userAdminA.id);

    // 2. Normal rotation: use token1 -> get token2
    const rotation1 = await rotateRefreshToken(db, token1);
    assert.ok(rotation1 !== null, "Initial token rotation succeeds");
    const token2 = rotation1.newRawToken;

    // 3. Normal rotation: use token2 -> get token3
    const rotation2 = await rotateRefreshToken(db, token2);
    assert.ok(rotation2 !== null, "Second token rotation succeeds");
    const token3 = rotation2.newRawToken;

    // 4. ATTACK: Attacker replays consumed token1!
    const replayAttack = await rotateRefreshToken(db, token1);
    assert.equal(replayAttack, null, "Replay of consumed token is rejected");

    // 5. VERIFY BREACH DEFENSE: Legitimate user now tries to use token3
    // The entire token family MUST now be revoked!
    const legitimateAttempt = await rotateRefreshToken(db, token3);
    assert.equal(legitimateAttempt, null, "Entire token family is revoked after reuse detection");
  });

  // --------------------------------------------------------------------------
  // TEST 11: Imported legacy records remain IMPORTED_UNVERIFIED
  // --------------------------------------------------------------------------
  await t.test("11. Imported legacy records remain IMPORTED_UNVERIFIED and do not inflate score", async () => {
    const legacyMockPayload = {
      scannerHistory: [
        {
          target: "legacy-unverified.corp",
          score: 95, // Legacy unverified claimed score
          results: [
            {
              category: "Host Recon",
              findings: [
                {
                  title: "Legacy Open Port",
                  severity: "high",
                  description: "Old cached scan finding",
                },
              ],
            },
          ],
        },
      ],
      websecHistory: [
        {
          url: "https://legacy-unverified.corp",
          score: 90,
          issues: [
            {
              title: "Legacy Missing Header",
              severity: "medium",
            },
          ],
        },
      ],
    };

    const res = mockResponse();
    await migrationHandler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${tokenAdminA}` },
        body: legacyMockPayload,
      },
      res.value
    );

    assert.equal(res.state.statusCode, 200);
    const body = JSON.parse(res.state.body);
    assert.equal(body.status, "complete");
    assert.equal(body.verificationClass, "IMPORTED_UNVERIFIED");
    assert.equal(body.metrics.verifiedScoreContribution, 0, "Guarantees 0 score inflation");

    // Inspect database records created by migration
    const findings = await clientA.getFindings();
    const importedFindings = findings.filter((f) => f.verification_class === "IMPORTED_UNVERIFIED");
    
    assert.ok(importedFindings.length >= 2, "Findings saved with IMPORTED_UNVERIFIED class");
    for (const f of importedFindings) {
      assert.notEqual(f.verification_class, "VERIFIED_EVIDENCE", "Must NEVER be automatically VERIFIED_EVIDENCE");
    }

    // Verify scans created have is_verified = false and overall_score = null
    const scans = await clientA.getScans();
    const importedScans = scans.filter((s) => s.scan_type === "imported");
    for (const s of importedScans) {
      assert.equal(s.is_verified, false, "Imported scans must have is_verified = false");
      assert.equal(s.overall_score, null, "Imported scans must have overall_score = null");
    }
  });

  // --------------------------------------------------------------------------
  // BONUS: Argon2id Password Hashing & Verification Test
  // --------------------------------------------------------------------------
  await t.test("12. Argon2id password hashing and verification validation", async () => {
    const rawPass = "SuperStrongPassword2026!#$";
    const hashed = await hashPassword(rawPass);
    assert.ok(hashed.startsWith("$argon2id$v=19$m="), "Hashes with valid Argon2id header");
    
    const valid = await verifyPassword(rawPass, hashed);
    assert.equal(valid, true, "Correct password verifies");

    const invalid = await verifyPassword("WrongPassword123", hashed);
    assert.equal(invalid, false, "Wrong password fails verification");
  });
});
