/**
 * PASCOAI UNIFIED AUTHENTICATED API CLIENT
 * 
 * Provides centralized, authenticated API access with automatic Bearer token injection,
 * silent token refresh handling, and strict Demo Mode isolation (no credentials/writes).
 */

export interface ApiUser {
  id: string;
  email: string;
  displayName?: string;
}

export interface ApiTenant {
  organizationId: string;
  workspaceId: string;
  role: string;
}

export interface Asset {
  id: string;
  organizationId: string;
  workspaceId: string;
  targetType: "domain" | "hostname" | "ip_address" | "cidr_range" | "url_endpoint" | "email_domain" | "cloud_resource";
  targetValue: string;
  criticality: "tier_1_mission_critical" | "tier_2_business" | "tier_3_internal" | "tier_4_informational";
  tags: string[];
  currentScore: number | null;
  status: "active" | "archived" | "monitoring_paused";
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  assetId: string;
  triggeredBy: string;
  scanType: "on_demand" | "scheduled" | "continuous" | "imported";
  executionStatus: "pending" | "running" | "verified" | "partial" | "failed" | "imported";
  overallScore: number | null;
  isVerified: boolean;
  rawSummary: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface FindingRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  scanId: string;
  domainCategory: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  verificationClass: "VERIFIED_EVIDENCE" | "DETERMINISTIC_DERIVATION" | "IMPORTED_UNVERIFIED" | "AI_ADVISORY" | "TRAINING_EXERCISE";
  recommendation: string;
  remediationStatus: "open" | "in_progress" | "resolved" | "accepted_risk";
  createdAt: string;
}

export interface CreateScanPayload {
  assetId?: string;
  target?: string;
  targetValue?: string;
  targetType?: string;
  overallScore?: number | null;
  isVerified?: boolean;
  scanType?: "on_demand" | "scheduled" | "continuous" | "imported";
  rawSummary?: Record<string, unknown>;
  findings?: Array<{
    domainCategory?: string;
    category?: string;
    title: string;
    description?: string;
    severity?: "critical" | "high" | "medium" | "low" | "info" | string;
    verificationClass?: string;
    recommendation?: string;
    evidence?: Record<string, unknown>;
  }>;
}

class ApiClient {
  private accessToken: string | null = null;
  private isDemo: boolean = false;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;
  private tokenListeners: Array<(token: string | null) => void> = [];

  public setAccessToken(token: string | null): void {
    this.accessToken = token;
    this.notifyTokenListeners(token);
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public setIsDemo(demo: boolean): void {
    this.isDemo = demo;
  }

  public getIsDemo(): boolean {
    return this.isDemo;
  }

  public onTokenChange(listener: (token: string | null) => void): () => void {
    this.tokenListeners.push(listener);
    return () => {
      this.tokenListeners = this.tokenListeners.filter(l => l !== listener);
    };
  }

  private notifyTokenListeners(token: string | null): void {
    this.tokenListeners.forEach(listener => {
      try {
        listener(token);
      } catch {
        // ignore errors in listeners
      }
    });
  }

  /**
   * Refreshes the session via HTTP-only cookie
   */
  public async refreshToken(): Promise<string | null> {
    if (this.isDemo) return null;
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const res = await fetch("/api/auth?action=refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) {
            this.setAccessToken(data.accessToken);
            return data.accessToken as string;
          }
        }
        this.setAccessToken(null);
        return null;
      } catch {
        this.setAccessToken(null);
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Core request dispatcher with auth header injection and automatic token refresh retry
   */
  public async request<T = any>(
    endpoint: string,
    options: RequestInit & { skipAuth?: boolean; workspaceId?: string } = {}
  ): Promise<T> {
    const { skipAuth = false, workspaceId, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    // STRICT DEMO MODE ISOLATION: Never attach auth headers for demo sessions
    if (!this.isDemo && !skipAuth && this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    if (workspaceId) {
      headers.set("x-workspace-id", workspaceId);
    }

    const mergedOptions: RequestInit = {
      ...fetchOptions,
      headers,
      credentials: "include",
    };

    let response = await fetch(endpoint, mergedOptions);

    // If 401 Unauthorized occurs on an authenticated request for a real user, attempt refresh and retry once
    if (response.status === 401 && !this.isDemo && !skipAuth) {
      const newToken = await this.refreshToken();
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(endpoint, {
          ...mergedOptions,
          headers,
        });
      }
    }

    if (!response.ok) {
      let errorPayload: any = null;
      try {
        errorPayload = await response.json();
      } catch {
        // Fallback to statusText
      }

      const errorMessage =
        errorPayload?.error ||
        errorPayload?.message ||
        `Request failed with status ${response.status} (${response.statusText})`;
      
      const error = new Error(errorMessage) as Error & { status?: number; payload?: any };
      error.status = response.status;
      error.payload = errorPayload;
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }
}

export const apiClient = new ApiClient();

/* -------------------- HIGHER-LEVEL SERVICE APIS -------------------- */

export const assetsApi = {
  list: async (workspaceId?: string): Promise<{ assets: Asset[] }> => {
    return apiClient.request<{ assets: Asset[] }>("/api/assets", { workspaceId });
  },

  get: async (id: string, workspaceId?: string): Promise<Asset> => {
    return apiClient.request<Asset>(`/api/assets?id=${encodeURIComponent(id)}`, { workspaceId });
  },

  create: async (
    data: {
      targetType: string;
      targetValue: string;
      criticality?: string;
      tags?: string[];
    },
    workspaceId?: string
  ): Promise<Asset> => {
    return apiClient.request<Asset>("/api/assets", {
      method: "POST",
      body: JSON.stringify(data),
      workspaceId,
    });
  },

  update: async (
    id: string,
    data: Partial<Pick<Asset, "targetValue" | "criticality" | "tags" | "status" | "currentScore">>,
    workspaceId?: string
  ): Promise<Asset> => {
    return apiClient.request<Asset>("/api/assets", {
      method: "PUT",
      body: JSON.stringify({ id, ...data }),
      workspaceId,
    });
  },

  delete: async (id: string, workspaceId?: string): Promise<{ success: boolean }> => {
    return apiClient.request<{ success: boolean }>(`/api/assets?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      workspaceId,
    });
  },
};

export const scansApi = {
  list: async (workspaceId?: string): Promise<{ scans: ScanRecord[]; findings: FindingRecord[] }> => {
    return apiClient.request<{ scans: ScanRecord[]; findings: FindingRecord[] }>("/api/scans", { workspaceId });
  },

  create: async (
    data: CreateScanPayload,
    workspaceId?: string
  ): Promise<{ scan: ScanRecord; findings: FindingRecord[] }> => {
    return apiClient.request<{ scan: ScanRecord; findings: FindingRecord[] }>("/api/scans", {
      method: "POST",
      body: JSON.stringify(data),
      workspaceId,
    });
  },
};

export const migrationApi = {
  importLegacy: async (
    payload: Record<string, unknown>,
    workspaceId?: string
  ): Promise<{
    status: string;
    message: string;
    verificationClass: string;
    metrics: {
      importedAssets: number;
      importedScans: number;
      importedFindings: number;
      verifiedScoreContribution: number;
    };
  }> => {
    return apiClient.request("/api/migration", {
      method: "POST",
      body: JSON.stringify(payload),
      workspaceId,
    });
  },
};

export const authApi = {
  refresh: async () => {
    return apiClient.request<{ accessToken: string; user: ApiUser; tenant: ApiTenant }>("/api/auth?action=refresh", {
      method: "POST",
      skipAuth: true,
    });
  },

  logout: async () => {
    return apiClient.request("/api/auth?action=logout", {
      method: "POST",
      skipAuth: true,
    });
  },

  updateProfile: async (data: { displayName: string }) => {
    return apiClient.request("/api/auth?action=update-profile", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  changePassword: async (data: { oldPassword: string; newPassword: string }) => {
    return apiClient.request("/api/auth?action=change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteAccount: async () => {
    return apiClient.request("/api/auth?action=delete-account", {
      method: "POST",
    });
  },
};
