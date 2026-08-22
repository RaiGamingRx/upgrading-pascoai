import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  displayName?: string;
  lastLogin?: number;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<{ error: string | null }>;
  signup: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (oldPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;

  demoLogin: () => Promise<void>;

  updateDisplayName: (name: string) => void;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "pascoai_user";
const USERS_KEY = "pascoai_users";

/* ───────── Helpers ───────── */

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

const hash = async (text: string) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const getUsers = (): User[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveUsers = (users: User[]) =>
  localStorage.setItem(USERS_KEY, JSON.stringify(users));

/* ───────── Provider ───────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const persistUser = (u: User) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  };

  /* ───────── LOGIN ───────── */
  const login = async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 400));

    if (!email || !password) {
      return { error: "Email and password are required" };
    }

    const users = getUsers();
    const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      return { error: "Account not found with this email" };
    }

    const hashed = await hash(password);
    if (found.password !== hashed) {
      return { error: "Incorrect password" };
    }

    const logged = { ...found, lastLogin: Date.now() };
    persistUser(logged);
    return { error: null };
  };

  /* ───────── SIGNUP ───────── */
  const signup = async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 400));

    if (!email.includes("@")) {
      return { error: "Invalid email address" };
    }

    if (isTempEmail(email)) {
      return { error: "Temporary emails are not allowed" };
    }

    if (password.length < 8) {
      return { error: "Password must be at least 8 characters" };
    }

    const users = getUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: "An account with this email already exists" };
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      password: await hash(password),
      displayName: email.split("@")[0],
      lastLogin: Date.now(),
    };

    users.push(newUser);
    saveUsers(users);
    persistUser(newUser);

    return { error: null };
  };

  /* ───────── DEMO MODE ───────── */
  const demoLogin = async () => {
    const demoUser: User = {
      id: "demo-user",
      email: "demo@pascoai.com",
      displayName: "Security Lead (Demo)",
      lastLogin: Date.now(),
    };

    persistUser(demoUser);
  };

  /* ───────── UPDATE NAME ───────── */
  const updateDisplayName = (name: string) => {
    if (!user || user.id === "demo-user") return;

    const trimmed = name.trim();
    const users = getUsers().map((u) =>
      u.id === user.id ? { ...u, displayName: trimmed } : u
    );

    saveUsers(users);
    persistUser({ ...user, displayName: trimmed });
  };

  /* ───────── UPDATE PASSWORD ───────── */
  const updatePassword = async (oldPassword: string, newPassword: string) => {
    if (!user || user.id === "demo-user") {
      return { error: "Password changes disabled in demo mode" };
    }

    if (!oldPassword || !newPassword) {
      return { error: "All password fields are required" };
    }

    if (newPassword.length < 8) {
      return { error: "New password must be at least 8 characters" };
    }

    const users = getUsers();
    const found = users.find((u) => u.id === user.id);
    if (!found) {
      return { error: "User account not found" };
    }

    const hashedOld = await hash(oldPassword);
    if (found.password !== hashedOld) {
      return { error: "Incorrect current password" };
    }

    const hashedNew = await hash(newPassword);
    const updatedUsers = users.map((u) =>
      u.id === user.id ? { ...u, password: hashedNew } : u
    );

    saveUsers(updatedUsers);
    persistUser({ ...user, password: hashedNew });
    return { error: null };
  };

  /* ───────── DELETE ACCOUNT ───────── */
  const deleteAccount = async () => {
    if (!user || user.id === "demo-user") {
      return { error: "Cannot delete demo account" };
    }

    const users = getUsers().filter((u) => u.id !== user.id);
    saveUsers(users);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    return { error: null };
  };

  /* ───────── LOGOUT ───────── */
  const logout = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  /* ───────── RESET ───────── */
  const resetPassword = async (email: string) => {
    await new Promise((r) => setTimeout(r, 400));
    if (!email.includes("@")) {
      return { error: "Enter a valid email" };
    }
    return { error: null };
  };

  const isDemo = user?.id === "demo-user";

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        logout,
        resetPassword,
        updatePassword,
        deleteAccount,
        demoLogin,
        updateDisplayName,
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
