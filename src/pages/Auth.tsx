"use client";

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Shield,
  Lock,
  Zap,
  CheckCircle2,
  Cpu,
  ArrowRight,
  Terminal,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";
import { MagneticButton } from "@/components/motion/MagneticButton";

const features = [
  { icon: Shield, title: "Next-Gen Vulnerability Scanner", desc: "Automated network and security header audits" },
  { icon: Lock, title: "Client-Side Cryptographic Lab", desc: "Hardware-accelerated AES-256-GCM and hashing" },
  { icon: Cpu, title: "AI Cyber Intelligence", desc: "Gemini-powered threat research and mitigation" },
];

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/dashboard";

  const { login, signup, resetPassword, demoLogin } = useAuth();

  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await login(email, password);
        if (res.error) {
          toast({ variant: "destructive", title: "Authentication Failed", description: res.error });
        } else {
          toast({ title: "Authenticated", description: "Welcome to PascoAI Defense Console", duration: 1500 });
          navigate(from, { replace: true });
        }
      }

      if (mode === "signup") {
        const res = await signup(email, password, displayName);
        if (res.error) {
          toast({ variant: "destructive", title: "Registration Failed", description: res.error });
        } else {
          toast({ title: "Account Created", description: "Welcome aboard!", duration: 1500 });
          navigate(from, { replace: true });
        }
      }

      if (mode === "reset") {
        const res = await resetPassword(email);
        if (res.error) {
          toast({ variant: "destructive", title: "Reset Failed", description: res.error });
        } else {
          toast({ title: "Password Reset Triggered", description: "Check your console/email for details.", duration: 2000 });
          setMode("login");
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = async () => {
    setLoading(true);
    await demoLogin();
    toast({
      title: "Demo Mode Enabled",
      description: "Full access granted for testing.",
      duration: 1500,
    });
    navigate("/dashboard");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none">
      <AnimatedBackground showGrid={true} intensity="normal" />

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10">
        {/* LEFT COLUMN: Commercial Showcase (Visible on Large/Laptop screens) */}
        <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-6 pr-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-cyan-400 to-secondary flex items-center justify-center shadow-neon-cyan-sm">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-2xl tracking-tight text-gradient-cyber">PascoAI</span>
              <span className="block text-[11px] font-mono text-muted-foreground tracking-widest uppercase">
                Autonomous Defense Platform
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Enterprise Cyber Threat <br />
              <span className="text-gradient-cyber">Intelligence & Analysis</span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Equip your security team with real-time reconnaissance, cryptographic tools, and AI-assisted vulnerability discovery.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-3 pt-2">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                  <feat.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground font-mono">{feat.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Trust telemetry footer */}
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Zero Telemetry Leaks
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-primary" /> Hardware WebCrypto
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Auth Container */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <Card className="border-border/80 bg-card/75 backdrop-blur-xl shadow-glass relative overflow-hidden">
            {/* Top ambient accent border */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary animate-gradient-shift bg-[length:200%_100%]" />

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Mobile Header */}
              <div className="flex lg:hidden flex-col items-center text-center space-y-2 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon-cyan-sm">
                  <Shield className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-bold text-xl text-gradient-cyber">PascoAI</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Cybersecurity Analysis Console</p>
                </div>
              </div>

              {/* Title & Mode subtitle */}
              <div className="space-y-1 text-center lg:text-left">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {mode === "login"
                    ? "Welcome Back"
                    : mode === "signup"
                    ? "Create Account"
                    : "Reset Credentials"}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Sign in to access your security telemetry & labs"
                    : mode === "signup"
                    ? "Register an analyst account on PascoAI"
                    : "Enter your registered email for password recovery"}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground">Analyst Name</Label>
                    <Input
                      type="text"
                      placeholder="e.g. Alex Rivera"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">Email Address</Label>
                  <Input
                    type="email"
                    placeholder="analyst@pascoai.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-mono text-muted-foreground">Password</Label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => setMode("reset")}
                          className="text-xs text-primary/90 hover:text-primary hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full text-xs sm:text-sm font-semibold tracking-wide"
                  disabled={loading}
                >
                  {loading ? (
                    "Processing..."
                  ) : mode === "login" ? (
                    <span className="flex items-center gap-2">
                      Sign In <ArrowRight className="w-4 h-4" />
                    </span>
                  ) : mode === "signup" ? (
                    "Create Account"
                  ) : (
                    "Send Recovery Instructions"
                  )}
                </Button>
              </form>

              {/* Demo Mode Quick Access Button */}
              {mode === "login" && (
                <div className="pt-1 space-y-2">
                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-border/60 w-full" />
                    <span className="bg-card px-2 text-[10px] uppercase font-mono text-muted-foreground/60 absolute">
                      or quick test
                    </span>
                  </div>

                  <MagneticButton className="w-full" strength={4}>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={handleDemoMode}
                      className="w-full border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary text-xs sm:text-sm font-semibold"
                    >
                      <Zap className="w-4 h-4 mr-2 text-primary" />
                      Try Demo (Instant Access)
                    </Button>
                  </MagneticButton>
                </div>
              )}

              {/* Footer Toggle Links */}
              <div className="text-center pt-2 text-xs text-muted-foreground">
                {mode === "login" && (
                  <p>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="text-primary font-semibold hover:underline ml-1"
                    >
                      Create one
                    </button>
                  </p>
                )}

                {mode === "signup" && (
                  <p>
                    Already have credentials?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="text-primary font-semibold hover:underline ml-1"
                    >
                      Sign in
                    </button>
                  </p>
                )}

                {mode === "reset" && (
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-primary font-semibold hover:underline"
                  >
                    ← Back to Sign In
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
