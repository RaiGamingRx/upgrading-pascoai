/**
 * PASCOAI ENTERPRISE SCANS API (STAGE 8.1)
 * 
 * Provides RLS-guarded and RBAC-gated posture scan access.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { EnterpriseDbClient } from "./db-engine.ts";
import { authenticateAndAuthorize, SecurityAction } from "./rbac.ts";

export default async function scansHandler(
  req: IncomingMessage & { body?: any; query?: any; headers?: any },
  res: ServerResponse & { status: (code: number) => any; json: (data: any) => any }
) {
  const method = req.method || "GET";
  const db = new EnterpriseDbClient();
  const authHeader = req.headers?.authorization;
  const requestedWorkspaceId = req.headers?.["x-workspace-id"] || req.query?.workspaceId;

  try {
    if (method === "GET") {
      const { context } = await authenticateAndAuthorize(
        db,
        authHeader,
        requestedWorkspaceId,
        SecurityAction.VIEW_REPORTS
      );
      const tenantDb = new EnterpriseDbClient(context);
      const scans = await tenantDb.getScans();
      const findings = await tenantDb.getFindings();
      return res.status(200).json({ scans, findings });
    }

    if (method === "POST") {
      // Must have RUN_SCAN permission (Viewer and Auditor will be rejected)
      const { context } = await authenticateAndAuthorize(
        db,
        authHeader,
        requestedWorkspaceId,
        SecurityAction.RUN_SCAN
      );
      const tenantDb = new EnterpriseDbClient(context);
      const { assetId, overallScore, rawSummary } = req.body || {};

      if (!assetId) {
        return res.status(400).json({ error: "assetId is required" });
      }

      const scan = await tenantDb.createScan({
        assetId,
        scanType: 'on_demand',
        isVerified: true,
        overallScore,
        rawSummary,
      });

      await tenantDb.logAuditEvent('scan.initiated', 'scan', scan.id, { assetId });
      return res.status(201).json(scan);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Scan operation failed" });
  }
}
