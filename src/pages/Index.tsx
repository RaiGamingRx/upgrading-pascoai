import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";
import {
  Shield,
  Globe,
  MailCheck,
  Lock,
  Key,
  Search,
  Beaker,
  ArrowRight,
  Zap,
  CheckCircle2,
  Activity,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "AI Security Scanner",
    description:
      "Server-side non-intrusive reconnaissance for domains and IPs with explainable threat risk calculation.",
    glow: "cyan" as const,
    badge: "Core",
  },
  {
    icon: Globe,
    title: "Web Security Suite",
    description:
      "Audit live HTTP response headers, TLS peer certificates, DNS infrastructure, and cookie safety flags.",
    glow: "emerald" as const,
    badge: "Live TLS",
  },
  {
    icon: MailCheck,
    title: "Email & Phishing Intel",
    description:
      "Live DNS MX verification, SPF/DMARC anti-spoofing policy checks, and phishing heuristic analysis.",
    glow: "amber" as const,
    badge: "Anti-Spoof",
  },
  {
    icon: Lock,
    title: "Crypto Lab (AES-256-GCM)",
    description:
      "CSPRNG-authenticated encryption, PBKDF2-SHA256 key derivation, and client-side zero-knowledge file cipher.",
    glow: "purple" as const,
    badge: "WebCrypto",
  },
  {
    icon: Key,
    title: "Password Security Lab",
    description:
      "NIST/Shannon entropy math, crack-time estimations, CSPRNG generator, and HaveIBeenPwned k-anonymity check.",
    glow: "cyan" as const,
    badge: "Zero-Leak",
  },
  {
    icon: Search,
    title: "AI Research Suite",
    description:
      "Gemini-powered Blue Team, Red Team, and SOC incident response analysis with PDF report ingestion.",
    glow: "emerald" as const,
    badge: "AI Powered",
  },
  {
    icon: Beaker,
    title: "Interactive Simulations",
    description:
      "22 controlled educational security attack scenarios with step-by-step telemetry, mitigations, and defensive code.",
    glow: "purple" as const,
    badge: "22 Scenarios",
  },
];

const trustBadges = [
  "100% Genuine Protocol Analysis",
  "SSRF-Hardened Backend APIs",
  "Zero-Knowledge WebCrypto",
  "HaveIBeenPwned K-Anonymity",
];

export default function Index() {
  const { user, isLoading, demoLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleLaunchDemo = async () => {
    await demoLogin();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background select-none">
      <AnimatedBackground showGrid={true} intensity="normal" />

      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between p-4 md:px-8 border-b border-border/60 bg-card/60 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-cyan-400 to-secondary flex items-center justify-center shadow-neon-cyan-sm">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-gradient-cyber leading-tight">
                PascoAI
              </span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hidden sm:inline">
                Cyber Defense Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLaunchDemo}
              className="text-xs font-semibold border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary"
            >
              <Zap className="w-3.5 h-3.5 mr-1" />
              Demo
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/auth")}
              className="text-xs font-semibold shadow-neon-cyan-sm"
            >
              Sign In
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </header>

        {/* Hero */}
        <main className="container mx-auto px-4 py-12 md:py-20 lg:py-24 max-w-6xl">
          <RevealOnScroll direction="up">
            <div className="text-center max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-center">
                <Badge
                  variant="outline"
                  className="py-1.5 px-3.5 border-primary/40 text-primary font-mono text-xs flex items-center gap-2 bg-primary/10 rounded-full"
                >
                  <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
                  PASCOAI DEFENSE OS v2.4
                </Badge>
              </div>

              <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight">
                <span className="text-gradient-cyber">Next-Generation Cyber</span>
                <br />
                <span className="text-foreground">Threat Intelligence & Defense</span>
              </h1>

              <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Real server-side host scanning, live DNS MX/SPF/DMARC auditing, authenticated WebCrypto ciphers, password entropy verification, and 22 interactive cyber simulations.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
                <MagneticButton strength={5} className="w-full sm:w-auto">
                  <Button
                    size="xl"
                    onClick={() => navigate("/auth")}
                    className="w-full sm:w-auto font-semibold shadow-neon-cyan text-sm sm:text-base px-8 h-12"
                  >
                    <Shield className="w-5 h-5 mr-2" />
                    Launch Security Console
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </MagneticButton>

                <Button
                  size="xl"
                  variant="outline"
                  onClick={handleLaunchDemo}
                  className="w-full sm:w-auto border-border/80 bg-card/60 hover:bg-card/90 text-sm sm:text-base h-12 font-medium"
                >
                  <Sparkles className="w-4 h-4 mr-2 text-primary" />
                  Try Live Demo (No Login)
                </Button>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-6">
                {trustBadges.map((badge, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono text-muted-foreground bg-card/40 border border-border/60 px-3 py-1.5 rounded-full backdrop-blur-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </RevealOnScroll>

          {/* Feature Grid */}
          <div className="mt-16 sm:mt-24">
            <RevealOnScroll direction="up" delay={100}>
              <div className="text-center mb-8 sm:mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-mono mb-3">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Defense Architecture</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Integrated Security Engines
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-lg mx-auto">
                  Engineered with strict cryptographic correctness and hardened protocol parsing.
                </p>
              </div>
            </RevealOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {features.map((feature, idx) => (
                <RevealOnScroll key={idx} direction="up" delay={50 * idx}>
                  <InteractiveCard
                    glowColor={feature.glow}
                    onClick={() => navigate("/auth")}
                    className="p-5 sm:p-6 cursor-pointer group hover:border-primary/40 h-full flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 group-hover:shadow-neon-cyan-sm transition-all duration-300">
                          <feature.icon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {feature.badge}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {feature.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center text-xs font-mono text-primary group-hover:translate-x-1 transition-transform">
                      <span>Launch Engine</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </InteractiveCard>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 text-center text-xs text-muted-foreground border-t border-border/60 bg-card/30">
          <p>
            Developed by <span className="text-primary font-medium">Raay</span> • PascoAI Cyber Intelligence
          </p>
        </footer>
      </div>
    </div>
  );
}
