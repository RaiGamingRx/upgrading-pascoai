import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  lastLogin?: number;
  role?: string;
  organizationId?: string;
  workspaceId?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  accessToken: string | null;
  isDemo: boolean;

  login: (email: string, password: string) => Promise<{ error: string | null }>;
  signup: (email: string, password: string, displayName?: string, organizationName?: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (oldPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;

  demoLogin: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void> | void;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_SESSION_KEY = "pasco_demo_session";

const tempDomains = [
  "tempmail",
  "mailinator",
  "10minutemail",
  "guerrillamail",
  "yopmail",
  "temp-mail",
];

const isTempEmail = (email: string) =>
  tempDomains.some((d) => email.toLowerCase().includes(d));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ───────── SESSION RESTORATION (Backend refresh + Demo memory) ─────────
  useEffect(() => {
    let isMounted = true;

    // Defense-in-depth: Clear obsolete legacy client-side user stores
    try {
      localStorage.removeItem("pascoai_users");
      localStorage.removeItem("pascoai_user");
    } catch {
      // Ignore localStorage access errors
    }

    async function restoreSession() {
      try {
        // 1. Check if temporary Demo Mode was active in this session
        const isDemoActive = sessionStorage.getItem(DEMO_SESSION_KEY) === "true";
        if (isDemoActive) {
          if (isMounted) {
            setUser({
              id: "demo-user",
              email: "demo@pascoai.com",
              displayName: "Security Lead (Demo)",
              lastLogin: Date.now(),
              role: "security_lead",
            });
            setIsLoading(false);
          }
          return;
        }

        // 2. Real user session restoration via backend refresh endpoint
        const res = await fetch("/api/auth?action=refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.accessToken && data.user) {
            setAccessToken(data.accessToken);
            setUser({
              id: data.user.id,
              email: data.user.email,
              displayName: data.user.displayName,
              organizationId: data.tenant?.organizationId,
              workspaceId: data.tenant?.workspaceId,
              role: data.tenant?.role,
              lastLogin: Date.now(),
            });
          }
        } else {
          if (isMounted) {
            setUser(null);
            setAccessToken(null);
          }
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setAccessToken(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // ───────── REAL USER LOGIN (Backend Argon2id + PostgreSQL) ─────────
  const login = async (email: string, password: string) => {
    if (!email || !password) {
      return { error: "Email and password are required" };
    }

    try {
      const res = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Authentication failed" };
      }

      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setAccessToken(data.accessToken);
      setUser({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName,
        organizationId: data.tenant?.organizationId,
        workspaceId: data.tenant?.workspaceId,
        role: data.tenant?.role,
        lastLogin: Date.now(),
      });

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Authentication service is currently unavailable" };
    }
  };

  // ───────── REAL USER SIGNUP (Backend Argon2id + PostgreSQL) ─────────
  const signup = async (
    email: string,
    password: string,
    displayName?: string,
    organizationName?: string
  ) => {
    if (!email || !email.includes("@")) {
      return { error: "Valid email address is required" };
    }

    if (isTempEmail(email)) {
      return { error: "Disposable or temporary email domains are not allowed" };
    }

    if (password.length < 8) {
      return { error: "Password must be at least 8 characters" };
    }

    const name = displayName?.trim() || email.split("@")[0];
    const orgName = organizationName?.trim() || `${name}'s Security Perimeter`;

    try {
      const res = await fetch("/api/auth?action=register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: name,
          organizationName: orgName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Registration failed" };
      }

      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setAccessToken(data.accessToken);
      setUser({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName,
        organizationId: data.tenant?.organizationId,
        workspaceId: data.tenant?.workspaceId,
        role: data.tenant?.role,
        lastLogin: Date.now(),
      });

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Registration service is currently unavailable" };
    }
  };

  // ───────── DEMO MODE (Isolated Non-Persistent Session) ─────────
  const demoLogin = async () => {
    sessionStorage.setItem(DEMO_SESSION_KEY, "true");
    setAccessToken(null);
    setUser({
      id: "demo-user",
      email: "demo@pascoai.com",
      displayName: "Security Lead (Demo)",
      lastLogin: Date.now(),
      role: "security_lead",
    });
  };

  // ───────── REAL USER LOGOUT (Backend Revocation + Cookie Clear) ─────────
  const logout = async () => {
    try {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      await fetch("/api/auth?action=logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch {
      // Proceed with client logout even if network fails
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  // ───────── REAL USER UPDATE DISPLAY NAME ─────────
  const updateDisplayName = async (name: string) => {
    if (!user || user.id === "demo-user") {
      if (user?.id === "demo-user") {
        setUser((prev) => (prev ? { ...prev, displayName: name.trim() } : null));
      }
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/auth?action=update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ displayName: trimmed }),
      });

      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, displayName: trimmed } : null));
      }
    } catch {
      setUser((prev) => (prev ? { ...prev, displayName: trimmed } : null));
    }
  };

  // ───────── REAL USER UPDATE PASSWORD ─────────
  const updatePassword = async (oldPassword: string, newPassword: string) => {
    if (!user || user.id === "demo-user") {
      return { error: "Password changes are disabled in demo mode" };
    }

    if (!oldPassword || !newPassword) {
      return { error: "All password fields are required" };
    }

    if (newPassword.length < 8) {
      return { error: "New password must be at least 8 characters" };
    }

    try {
      const res = await fetch("/api/auth?action=change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Failed to update password" };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to connect to authentication service" };
    }
  };

  // ───────── REAL USER DELETE ACCOUNT ─────────
  const deleteAccount = async () => {
    if (!user || user.id === "demo-user") {
      return { error: "Cannot delete demo account" };
    }

    try {
      const res = await fetch("/api/auth?action=delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Failed to delete account" };
      }
      await logout();
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || "Failed to reach authentication service" };
    }
  };

  // ───────── RESET PASSWORD STUB ─────────
  const resetPassword = async (email: string) => {
    if (!email || !email.includes("@")) {
      return { error: "Enter a valid email" };
    }
    return { error: null };
  };

  const getAccessToken = useCallback(() => accessToken, [accessToken]);
  const isDemo = user?.id === "demo-user";

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        accessToken,
        login,
        signup,
        logout,
        resetPassword,
        updatePassword,
        deleteAccount,
        demoLogin,
        updateDisplayName,
        getAccessToken,
        isDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
