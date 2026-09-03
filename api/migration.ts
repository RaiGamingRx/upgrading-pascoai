/**
 * PASCOAI ENTERPRISE MIGRATION ENDPOINT (STAGE 8.1)
 * 
 * Safely imports legacy client-side localStorage history into multi-tenant cloud storage.
 * 
 * CRITICAL SECURITY & TRUTH RULES:
 * 1. Imported localStorage records MUST be classified IMPORTED_UNVERIFIED (never VERIFIED_EVIDENCE).
 * 2. Imported data MUST NOT increase verified security posture scores until independently re-observed.
 * 3. Tenant boundaries and RLS are strictly enforced during ingestion.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { EnterpriseDbClient, inMemoryDb } from "./db-engine.ts";
import { authenticateAndAuthorize, SecurityAction } from "./rbac.ts";

export interface LegacyStoragePayload {
  scannerHistory?: Array<{
    target: string;
    score?: number | null;
    date?: string;
    results?: Array<{
      category: string;
      findings?: Array<{
        title: string;
        severity?: string;
        description?: string;
        recommendation?: string;
      }>;
    }>;
  }>;
  websecHistory?: Array<{
    url: string;
    score?: number | null;
    grade?: string;
    issues?: Array<{
      title: string;
      severity?: string;
      description?: string;
      recommendation?: string;
    }>;
  }>;
  emailHistory?: Array<{
    email: string;
    score?: number | null;
    status?: string;
    flags?: Array<{
      name?: string;
      status?: string;
      description?: string;
    }>;
  }>;
  customTargets?: string[];
}

export default async function migrationHandler(
  req: IncomingMessage & { body?: any; query?: any; headers?: any },
  res: ServerResponse & { status: (code: number) => any; json: (data: any) => any }
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const db = new EnterpriseDbClient();
  const authHeader = req.headers?.authorization;
  const targetWorkspaceId = req.headers?.["x-workspace-id"] || req.query?.workspaceId;

  try {
    // Authenticate and verify tenant context & action permission
    const { context, userPayload } = await authenticateAndAuthorize(
      db,
      authHeader,
      targetWorkspaceId,
      SecurityAction.IMPORT_MIGRATION
    );

    // Initialize context-bound DB client
    const tenantDb = new EnterpriseDbClient(context);

    const payload: LegacyStoragePayload = req.body || {};
    let importedAssetsCount = 0;
    let importedScansCount = 0;
    let importedFindingsCount = 0;

    // Helper map to deduplicate assets within the workspace during this import run
    const existingAssets = await tenantDb.getAssets();
    const assetMap = new Map<string, string>(); // targetValue -> assetId
    for (const a of existingAssets) {
      assetMap.set(a.target_value.toLowerCase(), a.id);
    }

    async function getOrCreateAsset(targetValue: string, targetType: 'domain' | 'hostname' | 'url_endpoint' | 'email_domain'): Promise<string> {
      const normalized = targetValue.trim().toLowerCase();
      if (assetMap.has(normalized)) {
        return assetMap.get(normalized)!;
      }
      const newAsset = await tenantDb.createAsset({
        targetType,
        targetValue: normalized,
        criticality: 'tier_2_business',
        tags: ['imported_legacy'],
      });
      assetMap.set(normalized, newAsset.id);
      importedAssetsCount++;
      return newAsset.id;
    }

    // 1. Process Scanner History
    if (Array.isArray(payload.scannerHistory)) {
      for (const item of payload.scannerHistory) {
        if (!item.target) continue;
        const assetId = await getOrCreateAsset(item.target, 'hostname');
        
        // Create scan record classified as unverified legacy import
        const scan = await tenantDb.createScan({
          assetId,
          scanType: 'imported',
          isVerified: false, // CRITICAL: NEVER automatically VERIFIED_EVIDENCE
          overallScore: null, // CRITICAL: Does NOT inflate verified posture score
          rawSummary: { legacyScore: item.score, legacyDate: item.date, note: "Imported from client localStorage" },
        });
        importedScansCount++;

        // Process findings from results categories
        if (Array.isArray(item.results)) {
          for (const cat of item.results) {
            if (Array.isArray(cat.findings)) {
              for (const f of cat.findings) {
                await tenantDb.createFinding({
                  scanId: scan.id,
                  domainCategory: cat.category || 'Recon',
                  title: f.title || 'Legacy Finding',
                  description: f.description || 'Imported finding from local storage',
                  severity: (f.severity as any) || 'low',
                  verificationClass: 'IMPORTED_UNVERIFIED', // CRITICAL RULE
                  recommendation: f.recommendation || 'Re-run verified probe to substantiate finding.',
                });
                importedFindingsCount++;
              }
            }
          }
        } else if (Array.isArray((item as any).findings)) {
          for (const f of (item as any).findings) {
            await tenantDb.createFinding({
              scanId: scan.id,
              domainCategory: f.domainCategory || f.category || 'Recon',
              title: f.title || 'Legacy Finding',
              description: f.description || 'Imported finding from local storage',
              severity: (f.severity as any) || 'low',
              verificationClass: 'IMPORTED_UNVERIFIED',
              recommendation: f.recommendation || 'Re-run verified probe to substantiate finding.',
            });
            importedFindingsCount++;
          }
        }
      }
    }

    // 2. Process WebSec History
    if (Array.isArray(payload.websecHistory)) {
      for (const item of payload.websecHistory) {
        const targetUrl = item.url || (item as any).finalUrl;
        if (!targetUrl) continue;
        const assetId = await getOrCreateAsset(targetUrl, 'url_endpoint');

        const scan = await tenantDb.createScan({
          assetId,
          scanType: 'imported',
          isVerified: false,
          overallScore: null,
          rawSummary: { legacyGrade: item.grade, legacyScore: item.score },
        });
        importedScansCount++;

        if (Array.isArray(item.issues)) {
          for (const issue of item.issues) {
            const isString = typeof issue === "string";
            const issueStr = typeof issue === "string" ? issue : "";
            const issueObj = typeof issue === "object" && issue !== null ? (issue as any) : {};
            const title = isString ? issueStr : issueObj.title || issueObj.name || 'Legacy Web Security Issue';
            const description = isString ? `Imported web issue: ${issueStr}` : issueObj.description || issueObj.title || 'Imported web security finding';
            const severity = isString
              ? (issueStr.toLowerCase().includes("certificate") || issueStr.toLowerCase().includes("https") || issueStr.toLowerCase().includes("ssl") ? "high" : "medium")
              : (issueObj.severity as any) || 'medium';
            const recommendation = isString ? "Apply recommended TLS and HTTP security header hardening." : issueObj.recommendation || 'Perform automated header probe to verify.';

            await tenantDb.createFinding({
              scanId: scan.id,
              domainCategory: 'AUDIT_DEFENSE',
              title,
              description,
              severity,
              verificationClass: 'IMPORTED_UNVERIFIED',
              recommendation,
            });
            importedFindingsCount++;
          }
        }
      }
    }

    // 3. Process Email Security History
    if (Array.isArray(payload.emailHistory)) {
      for (const item of payload.emailHistory) {
        const targetEmail = item.email || (item as any).domain;
        if (!targetEmail) continue;
        const assetId = await getOrCreateAsset(targetEmail, 'email_domain');

        const scan = await tenantDb.createScan({
          assetId,
          scanType: 'imported',
          isVerified: false,
          overallScore: null,
          rawSummary: { legacyStatus: item.status, legacyScore: item.score },
        });
        importedScansCount++;

        if (Array.isArray(item.flags)) {
          for (const flag of item.flags) {
            const isString = typeof flag === "string";
            const title = isString ? flag : (flag as any).title || flag.name || (flag as any).message || 'Legacy Email Config Flag';
            const description = isString ? flag : flag.description || (flag as any).message || (flag as any).title || 'Imported email posture observation';
            const severity = isString
              ? 'low'
              : ((flag as any).level === "critical" ? "critical" : (flag as any).level === "high" ? "high" : (flag as any).level === "warning" ? "medium" : "low");
            const recommendation = isString ? 'Query authoritative DNS MX/SPF/DMARC records for live status.' : (flag as any).recommendation || 'Query authoritative DNS MX/SPF/DMARC records for live status.';

            await tenantDb.createFinding({
              scanId: scan.id,
              domainCategory: 'EMAIL_SECURITY',
              title,
              description,
              severity,
              verificationClass: 'IMPORTED_UNVERIFIED',
              recommendation,
            });
            importedFindingsCount++;
          }
        }
      }
    }

    // 4. Process Custom Targets
    if (Array.isArray(payload.customTargets)) {
      for (const target of payload.customTargets) {
        if (target && typeof target === "string") {
          await getOrCreateAsset(target, 'hostname');
        }
      }
    }

    // Audit log this migration event
    await tenantDb.logAuditEvent(
      'migration.imported_local_data',
      'workspace',
      context.workspaceId,
      {
        importedAssetsCount,
        importedScansCount,
        importedFindingsCount,
        verificationTaxonomy: 'IMPORTED_UNVERIFIED',
      },
      (req.socket?.remoteAddress as string) || '127.0.0.1'
    );

    return res.status(200).json({
      status: "complete",
      message: "Successfully migrated local history to cloud workspace.",
      verificationClass: "IMPORTED_UNVERIFIED",
      metrics: {
        importedAssets: importedAssetsCount,
        importedScans: importedScansCount,
        importedFindings: importedFindingsCount,
        verifiedScoreContribution: 0, // Guarantees 0 score inflation
      },
    });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Migration failed" });
  }
}
