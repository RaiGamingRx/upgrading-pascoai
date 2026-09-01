import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Shield, Trash2, User, LogOut, AlertTriangle, Key, Compass, RotateCcw, Database, Cloud, UploadCloud, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { migrationApi } from "@/lib/api";

type ExportFormat = "json" | "txt";

export default function Settings() {
  const { user, isDemo, updateDisplayName, updatePassword, deleteAccount, logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.displayName || "");

  /* ---------------- SECURITY / PASSWORD ---------------- */
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  /* ---------------- MIGRATION / CLOUD PERSISTENCE ---------------- */
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);

  /* ---------------- EXPORT SETTINGS ---------------- */
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");

  /* ---------------- DEFAULT PERSONA ---------------- */
  const [persona, setPersona] = useState("Cybersecurity Expert");

  useEffect(() => {
    const savedExport = localStorage.getItem("pasco_export_format");
    const savedPersona = localStorage.getItem("pasco_default_persona");

    if (savedExport === "json" || savedExport === "txt") setExportFormat(savedExport);
    if (savedPersona) setPersona(savedPersona);
  }, []);

  const handleMigrateLegacyData = async () => {
    if (isDemo || !user) {
      toast.error("Cloud persistence is only active for authenticated users.");
      return;
    }

    setIsMigrating(true);
    setMigrationStatus("Collecting browser audit history...");

    try {
      const v1Scans = JSON.parse(localStorage.getItem("pasco_scan_history_v1") || "[]");
      const v2Scans = JSON.parse(localStorage.getItem("pasco_scanner_history_v2") || "[]");
      const webScans = JSON.parse(localStorage.getItem("pasco_websec_history_v1") || "[]");
      const emailScans = JSON.parse(localStorage.getItem("pasco_email_history_v1") || "[]");

      const payload = {
        scannerHistory: [...v1Scans, ...v2Scans],
        websecHistory: webScans,
        emailHistory: emailScans,
      };

      const result = await migrationApi.importLegacy(payload);

      // Clean up legacy localStorage keys
      localStorage.removeItem("pasco_scan_history_v1");
      localStorage.removeItem("pasco_scanner_history_v2");
      localStorage.removeItem("pasco_websec_history_v1");
      localStorage.removeItem("pasco_email_history_v1");

      setMigrationStatus(
        `Imported ${result.metrics.importedAssets} assets, ${result.metrics.importedScans} scans, and ${result.metrics.importedFindings} findings into PostgreSQL.`
      );
      toast.success("Legacy telemetry successfully migrated to Neon PostgreSQL!");
    } catch (err: any) {
      toast.error(err?.message || "Migration failed");
      setMigrationStatus(null);
    } finally {
      setIsMigrating(false);
    }
  };

  /* ---------------- CHANGE PASSWORD ---------------- */
  const handleChangePassword = async () => {
    if (isDemo) {
      toast.error("Password change disabled in demo mode");
      return;
    }

    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error("All password fields are required");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await updatePassword(oldPassword, newPassword);
      if (res.error) {
        toast.error(res.error);
      } else {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success("Password updated successfully!");
      }
    } catch {
      toast.error("Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  /* ---------------- EXPORT SETTINGS ---------------- */
  const saveExportSettings = () => {
    localStorage.setItem("pasco_export_format", exportFormat);
    localStorage.setItem("pasco_default_persona", persona);

    // LIVE SYNC across tools in same tab (PasswordLab/CryptoLab/etc.)
    window.dispatchEvent(new Event("pasco_export_format_changed"));

    toast.success("Export settings saved");
  };

  const exportData = (type: "settings" | "security" | "persona") => {
    const payload =
      type === "settings"
        ? { displayName: user?.displayName }
        : type === "security"
        ? {
            email: user?.email,
            demoMode: isDemo,
            lastLogin: user?.lastLogin,
          }
        : { defaultPersona: persona };

    const content =
      exportFormat === "json"
        ? JSON.stringify(payload, null, 2)
        : Object.entries(payload)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("\n");

    const blob = new Blob([content], {
      type: exportFormat === "json" ? "application/json" : "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pascoai-${type}.${exportFormat}`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported (${exportFormat.toUpperCase()})`);
  };

  /* ---------------- CLEAR ALL HISTORY & LOGS ---------------- */
  const handleClearAllHistory = () => {
    const keys = [
      "pasco_scan_history_v1",
      "pasco_scanner_history_v2",
      "pasco_websec_history_v1",
      "pasco_email_history_v1",
      "pasco_crypto_history_v1",
      "pasco_crypto_attempts_v1",
      "pasco_password_history_v1",
      "pasco_password_breaches",
      "pasco_research_history_v1",
      "pasco_simulations_history_v2",
    ];

    keys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });

    window.dispatchEvent(new Event("storage"));
    toast.success("All transaction logs and tool histories cleared");
  };

  /* ---------------- DELETE ACCOUNT ---------------- */
  const handleDeleteAccount = async () => {
    if (isDemo) {
      toast.error("Account deletion disabled in demo mode");
      return;
    }

    const res = await deleteAccount();
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Account deleted successfully");
      navigate("/auth");
    }
  };

  /* ---------------- UPDATE DISPLAY NAME ---------------- */
  const updateName = () => {
    if (isDemo) {
      toast.error("Display name cannot be changed in demo mode");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }
    updateDisplayName(displayName.trim());
    toast.success("Display name updated");
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gradient-cyber">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account profile, security credentials, and export preferences.
        </p>
      </div>

      {/* Account Profile */}
      <Card variant="cyber">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Account Profile
          </CardTitle>
          <CardDescription>Update your operator handle and identity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isDemo}
                placeholder="Operator name"
              />
            </div>
            <div className="space-y-2">
              <Label>Registered Email</Label>
              <Input value={user?.email || ""} disabled className="font-mono bg-muted/40" />
            </div>
          </div>

          <Button onClick={updateName} disabled={isDemo}>
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Security Credentials */}
      <Card variant="cyber">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Security & Authentication
          </CardTitle>
          <CardDescription>
            {isDemo ? "Password changes are disabled in demo mode" : "Update your account password"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={isDemo || isUpdatingPassword}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password (min 8 chars)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isDemo || isUpdatingPassword}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isDemo || isUpdatingPassword}
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button onClick={handleChangePassword} disabled={isDemo || isUpdatingPassword}>
            <Key className="w-4 h-4 mr-2" />
            {isUpdatingPassword ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Export & Persona Preferences */}
      <Card variant="cyber">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Export & Environment Preferences
          </CardTitle>
          <CardDescription>Configure global data export format across all analysis suites</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Export Format</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON (Structured Machine-Readable)</SelectItem>
                  <SelectItem value="txt">TXT (Human-Readable Formatted Log)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default AI Persona</Label>
              <Select value={persona} onValueChange={(v) => setPersona(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cybersecurity Expert">Cybersecurity Expert (General)</SelectItem>
                  <SelectItem value="Blue Team Specialist">Blue Team Specialist (Defensive)</SelectItem>
                  <SelectItem value="Red Team Analyst">Red Team Analyst (Offensive Insights)</SelectItem>
                  <SelectItem value="SOC Incident Responder">SOC Incident Responder</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={saveExportSettings}>Save Preferences</Button>

          <Separator className="my-2" />

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => exportData("settings")}>
              Export Settings
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData("security")}>
              Export Security Meta
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData("persona")}>
              Export Persona
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cloud Persistence & Migration */}
      <Card variant="cyber">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-cyan-400" />
            Enterprise Cloud Persistence & Database
            {user && !isDemo ? (
              <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 gap-1 ml-auto">
                <Database className="w-3 h-3" /> Neon PostgreSQL Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 gap-1 ml-auto">
                Demo Memory Mode
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {user && !isDemo
              ? `Tenant Organization ID: ${user.organizationId || "Default"} • Workspace: ${user.workspaceId || "Primary"} • Role: ${user.role || "Operator"}`
              : "Demo Mode is isolated from PostgreSQL database writes to preserve system integrity."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/80">
            <div>
              <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                Migrate Local Browser Audits to PostgreSQL
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                Transfer any previous local scan reports, host perimeter checks, and email audits into your secure Neon PostgreSQL multi-tenant database.
              </p>
              {migrationStatus && (
                <p className="text-xs text-cyan-400 mt-2 font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {migrationStatus}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              disabled={isDemo || isMigrating}
              onClick={handleMigrateLegacyData}
              className="gap-2 shrink-0 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400"
            >
              {isMigrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {isMigrating ? "Migrating Data..." : "Import to Cloud DB"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Interactive App Tour */}
      <Card variant="cyber">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            Interactive Product Tour
          </CardTitle>
          <CardDescription>
            Walk through the core cyber defense suites, telemetry indicators, and command shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/80">
            <div>
              <p className="font-semibold text-foreground text-sm">Feature Tour & Onboarding</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Replay the guided spotlight walkthrough across navigation, security gauges, and analysis tools.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigate("/dashboard");
                setTimeout(() => {
                  window.dispatchEvent(new Event("start-app-tour"));
                }, 300);
                toast.success("Starting App Tour...");
              }}
              className="gap-2 shrink-0 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary"
            >
              <RotateCcw className="w-4 h-4" />
              Replay App Tour
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card variant="glass" className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible account actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/80">
            <div>
              <p className="font-semibold text-foreground">Clear All Telemetry & Logs</p>
              <p className="text-xs text-muted-foreground">
                Purge all stored scan results, audit records, password logs, and simulation histories across all tools.
              </p>
            </div>
            <Button variant="outline" onClick={handleClearAllHistory} className="gap-2 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
              Clear All Logs
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <div>
              <p className="font-semibold text-destructive">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently purge your account credentials and local profile data.
              </p>
            </div>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDemo} className="gap-2">
              <Trash2 className="w-4 h-4" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Card variant="glass">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="font-medium">Sign Out</p>
            <p className="text-xs text-muted-foreground">Terminate current active session</p>
          </div>
          <Button variant="destructive" className="gap-2" onClick={logout}>
            <LogOut className="w-4 h-4" />
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
