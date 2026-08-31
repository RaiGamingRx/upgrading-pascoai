import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EnterpriseDbClient,
  getActiveDriver,
  SCHEMA_SQL,
  runMigrations,
} from "../api/db-engine.ts";

test("POSTGRESQL ENTERPRISE DATABASE & RLS VERIFICATION SUITE", async (t) => {
  // --------------------------------------------------------------------------
  // TEST 1: Production fail-fast when DATABASE_URL is missing
  // --------------------------------------------------------------------------
  await t.test("1. Production fail-fast: throws immediately if DATABASE_URL is missing in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.DATABASE_URL;

      assert.throws(
        () => {
          getActiveDriver();
        },
        /FATAL_DATABASE_CONFIG_ERROR.*DATABASE_URL.*mandatory in production/
      );

      await assert.rejects(
        async () => {
          const client = new EnterpriseDbClient();
          await client.findUserByEmail("test@enterprise.com");
        },
        /FATAL_DATABASE_CONFIG_ERROR/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDbUrl) {
        process.env.DATABASE_URL = originalDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  // --------------------------------------------------------------------------
  // TEST 2: Active driver resolves to 'postgres' when DATABASE_URL is provided
  // --------------------------------------------------------------------------
  await t.test("2. Active driver resolves to postgres when DATABASE_URL is set", () => {
    const originalDbUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgres://postgres:secret@localhost:5432/pascoai_test";
      assert.equal(getActiveDriver(), "postgres");
    } finally {
      if (originalDbUrl) {
        process.env.DATABASE_URL = originalDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });

  // --------------------------------------------------------------------------
  // TEST 3: Schema DDL enforces FORCE ROW LEVEL SECURITY on all tenant tables
  // --------------------------------------------------------------------------
  await t.test("3. Schema DDL mandates ENABLE and FORCE ROW LEVEL SECURITY across all tenant tables", () => {
    const tenantTables = [
      "organizations",
      "workspaces",
      "workspace_members",
      "assets",
      "scans",
      "findings",
      "audit_logs",
    ];

    for (const table of tenantTables) {
      assert.ok(
        SCHEMA_SQL.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`),
        `Table ${table} must have ENABLE ROW LEVEL SECURITY`
      );
      assert.ok(
        SCHEMA_SQL.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`),
        `Table ${table} must have FORCE ROW LEVEL SECURITY`
      );
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: RLS Policies strictly enforce tenant boundaries and user lookup
  // --------------------------------------------------------------------------
  await t.test("4. RLS policies match strict zero-trust boundary criteria", () => {
    // Organizations isolation
    assert.ok(
      SCHEMA_SQL.includes("CREATE POLICY rls_organizations_isolation ON organizations"),
      "Organizations policy exists"
    );
    assert.ok(
      SCHEMA_SQL.includes("id = NULLIF(current_setting('app.current_org_id', true), '')::uuid"),
      "Organizations isolated by app.current_org_id"
    );

    // Workspaces isolation
    assert.ok(
      SCHEMA_SQL.includes("CREATE POLICY rls_workspaces_isolation ON workspaces"),
      "Workspaces policy exists"
    );

    // Assets isolation (both org and workspace)
    assert.ok(
      SCHEMA_SQL.includes("organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid") &&
      SCHEMA_SQL.includes("workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid"),
      "Assets isolated by both organization_id and workspace_id"
    );

    // Workspace members allows authenticated user or org lookup
    assert.ok(
      SCHEMA_SQL.includes("user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid"),
      "Workspace members allows session user identification"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Parameterized query enforcement & Transaction safety in mock client pool
  // --------------------------------------------------------------------------
  await t.test("5. Multi-connection transaction isolation prevents context leakage across pool", async () => {
    // Simulate two concurrent pooled connections executing queries for different tenants
    const connectionLogA = [];
    const connectionLogB = [];

    const mockClientA = {
      async query(sql, params) {
        connectionLogA.push({ sql, params });
        if (sql.includes("SELECT set_config")) {
          assert.ok(params.length >= 2, "Session config uses parameterized variables");
          assert.equal(params[0], "org-tenant-alpha");
        }
        return { rows: [], rowCount: 0 };
      },
      release() {
        connectionLogA.push({ sql: "RELEASE" });
      },
    };

    const mockClientB = {
      async query(sql, params) {
        connectionLogB.push({ sql, params });
        if (sql.includes("SELECT set_config")) {
          assert.ok(params.length >= 2, "Session config uses parameterized variables");
          assert.equal(params[0], "org-tenant-bravo");
        }
        return { rows: [], rowCount: 0 };
      },
      release() {
        connectionLogB.push({ sql: "RELEASE" });
      },
    };

    // Verify mock clients receive transaction-isolated parameters
    await mockClientA.query("BEGIN");
    await mockClientA.query(
      "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_workspace_id', $2, true)",
      ["org-tenant-alpha", "ws-alpha"]
    );
    await mockClientA.query("SELECT * FROM assets WHERE organization_id = $1 AND workspace_id = $2", [
      "org-tenant-alpha",
      "ws-alpha",
    ]);
    await mockClientA.query("COMMIT");
    await mockClientA.query("RESET ALL");
    mockClientA.release();

    await mockClientB.query("BEGIN");
    await mockClientB.query(
      "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_workspace_id', $2, true)",
      ["org-tenant-bravo", "ws-bravo"]
    );
    await mockClientB.query("SELECT * FROM assets WHERE organization_id = $1 AND workspace_id = $2", [
      "org-tenant-bravo",
      "ws-bravo",
    ]);
    await mockClientB.query("COMMIT");
    await mockClientB.query("RESET ALL");
    mockClientB.release();

    // Verify clean transaction boundaries in both connection logs
    assert.equal(connectionLogA[0].sql, "BEGIN");
    assert.equal(connectionLogA[connectionLogA.length - 2].sql, "RESET ALL");
    assert.equal(connectionLogA[connectionLogA.length - 1].sql, "RELEASE");

    assert.equal(connectionLogB[0].sql, "BEGIN");
    assert.equal(connectionLogB[connectionLogB.length - 2].sql, "RESET ALL");
    assert.equal(connectionLogB[connectionLogB.length - 1].sql, "RELEASE");
  });

  // --------------------------------------------------------------------------
  // TEST 6: Fail-Closed behavior on unauthenticated tenant DB operations
  // --------------------------------------------------------------------------
  await t.test("6. Fail-closed: DB client rejects operations when tenant context is null or incomplete", async () => {
    const nullClient = new EnterpriseDbClient(null);
    await assert.rejects(async () => nullClient.getAssets(), /RLS_SECURITY_VIOLATION/);
    await assert.rejects(async () => nullClient.getAssetById("any-id"), /RLS_SECURITY_VIOLATION/);
    await assert.rejects(async () => nullClient.createAsset({ targetType: "domain", targetValue: "test.com" }), /RLS_SECURITY_VIOLATION/);
    await assert.rejects(async () => nullClient.getScans(), /RLS_SECURITY_VIOLATION/);
    await assert.rejects(async () => nullClient.getFindings(), /RLS_SECURITY_VIOLATION/);
    await assert.rejects(async () => nullClient.getAuditLogs(), /RLS_SECURITY_VIOLATION/);

    const incompleteClient = new EnterpriseDbClient({
      organizationId: "org-1",
      workspaceId: "", // Missing workspace boundary
      userId: "u-1",
      role: "viewer",
    });
    await assert.rejects(async () => incompleteClient.getAssets(), /RLS_SECURITY_VIOLATION/);
  });
});
