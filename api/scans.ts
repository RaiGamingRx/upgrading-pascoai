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
      const { target, targetValue, targetType, overallScore, rawSummary, findings, isVerified } = req.body || {};
      let resolvedAssetId = req.body?.assetId;

      if (!resolvedAssetId && (target || targetValue)) {
        const val = (target || targetValue).trim().toLowerCase();
        const type = targetType || 'domain';
        const existingAssets = await tenantDb.getAssets();
        const found = existingAssets.find(a => a.target_value.toLowerCase() === val);
        if (found) {
          resolvedAssetId = found.id;
          if (overallScore !== undefined && overallScore !== null) {
            await tenantDb.updateAsset(resolvedAssetId, { current_score: overallScore });
          }
        } else {
          const created = await tenantDb.createAsset({
            targetType: type,
            targetValue: val,
            criticality: 'tier_2_business',
            tags: ['verified_probe'],
          });
          resolvedAssetId = created.id;
          if (overallScore !== undefined && overallScore !== null) {
            await tenantDb.updateAsset(resolvedAssetId, { current_score: overallScore });
          }
        }
      }

      if (!resolvedAssetId) {
        return res.status(400).json({ error: "assetId or target is required" });
      }

      const scan = await tenantDb.createScan({
        assetId: resolvedAssetId,
        scanType: 'on_demand',
        isVerified: isVerified !== undefined ? isVerified : true,
        overallScore: overallScore !== undefined ? overallScore : null,
        rawSummary,
      });

      const createdFindings = [];
      if (Array.isArray(findings) && findings.length > 0) {
        for (const f of findings) {
          const createdFinding = await tenantDb.createFinding({
            scanId: scan.id,
            domainCategory: f.domainCategory || f.category || 'Recon',
            title: f.title || 'Security Finding',
            description: f.description || '',
            severity: f.severity || 'low',
            verificationClass: f.verificationClass || (isVerified === false ? 'IMPORTED_UNVERIFIED' : 'VERIFIED_EVIDENCE'),
            recommendation: f.recommendation || 'Remediate detected observation.',
          });
          createdFindings.push(createdFinding);
        }
      }

      await tenantDb.logAuditEvent('scan.initiated', 'scan', scan.id, { assetId: resolvedAssetId, score: overallScore });
      return res.status(201).json({ scan, findings: createdFindings });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Scan operation failed" });
  }
}
