/**
 * PASCOAI ENTERPRISE ASSETS API (STAGE 8.1)
 * 
 * Provides RLS-guarded asset inventory management.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { EnterpriseDbClient } from "./db-engine.ts";
import { authenticateAndAuthorize, SecurityAction } from "./rbac.ts";

export default async function assetsHandler(
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
      
      const assetId = req.query?.id;
      if (assetId) {
        const asset = await tenantDb.getAssetById(assetId);
        if (!asset) {
          return res.status(404).json({ error: "Asset not found" });
        }
        return res.status(200).json(asset);
      }

      const assets = await tenantDb.getAssets();
      return res.status(200).json({ assets });
    }

    if (method === "POST") {
      const { context } = await authenticateAndAuthorize(
        db,
        authHeader,
        requestedWorkspaceId,
        SecurityAction.CREATE_ASSET
      );
      const tenantDb = new EnterpriseDbClient(context);
      const { targetType, targetValue, criticality, tags } = req.body || {};

      if (!targetType || !targetValue) {
        return res.status(400).json({ error: "targetType and targetValue are required" });
      }

      const asset = await tenantDb.createAsset({
        targetType,
        targetValue,
        criticality,
        tags,
      });

      await tenantDb.logAuditEvent('asset.created', 'asset', asset.id, { targetValue });
      return res.status(201).json(asset);
    }

    if (method === "PUT" || method === "PATCH") {
      const { context } = await authenticateAndAuthorize(
        db,
        authHeader,
        requestedWorkspaceId,
        SecurityAction.MODIFY_ASSET
      );
      const tenantDb = new EnterpriseDbClient(context);
      const assetId = req.query?.id || req.body?.id;
      if (!assetId) {
        return res.status(400).json({ error: "Asset ID is required" });
      }

      const updated = await tenantDb.updateAsset(assetId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Asset not found or access denied" });
      }

      await tenantDb.logAuditEvent('asset.updated', 'asset', assetId, req.body);
      return res.status(200).json(updated);
    }

    if (method === "DELETE") {
      const { context } = await authenticateAndAuthorize(
        db,
        authHeader,
        requestedWorkspaceId,
        SecurityAction.DELETE_ASSET
      );
      const tenantDb = new EnterpriseDbClient(context);
      const assetId = req.query?.id || req.body?.id;
      if (!assetId) {
        return res.status(400).json({ error: "Asset ID is required" });
      }

      const deleted = await tenantDb.deleteAsset(assetId);
      if (!deleted) {
        return res.status(404).json({ error: "Asset not found or access denied" });
      }

      await tenantDb.logAuditEvent('asset.deleted', 'asset', assetId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    const isAuth = err.message?.startsWith("UNAUTHORIZED");
    const isForbidden = err.message?.startsWith("FORBIDDEN");
    const statusCode = isAuth ? 401 : isForbidden ? 403 : 500;
    return res.status(statusCode).json({ error: err.message || "Asset operation failed" });
  }
}
