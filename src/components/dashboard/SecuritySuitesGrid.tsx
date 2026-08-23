import React from "react";
import { useNavigate } from "react-router-dom";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import {
  Scan,
  Globe,
  Lock,
  MailCheck,
  Key,
  Search,
  Cpu,
  Layers,
  ArrowRight,
} from "lucide-react";

export interface SuiteItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  category: string;
  description: string;
  path: string;
  color: string;
  bgColor: string;
  glow: "cyan" | "emerald" | "purple" | "amber";
  badge: string;
}

const SECURITY_SUITES: SuiteItem[] = [
  {
    icon: Scan,
    label: "Domain Reconnaissance",
    category: "Network Scanner",
    description: "Host reconnaissance, open services, TCP port inspection & header discovery.",
    path: "/scanner",
    color: "text-primary",
    bgColor: "bg-primary/10",
    glow: "cyan",
    badge: "Scanner",
  },
  {
    icon: Globe,
    label: "Web Security Suite",
    category: "Perimeter Audit",
    description: "Live TLS certificate expiration, DNS records, CSP & cookie flag audit.",
    path: "/web-security",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    glow: "emerald",
    badge: "TLS / Headers",
  },
  {
    icon: Lock,
    label: "AES-256 Crypto Lab",
    category: "Cryptography",
    description: "Authenticated text & file encryption engine using hardware WebCrypto.",
    path: "/crypto",
    color: "text-secondary",
    bgColor: "bg-secondary/15",
    glow: "purple",
    badge: "AES-GCM",
  },
  {
    icon: MailCheck,
    label: "Email Security Inspector",
    category: "Anti-Spoofing",
    description: "Authoritative DNS MX, SPF, DMARC validation & phishing heuristics.",
    path: "/email-security",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    glow: "amber",
    badge: "SPF / DMARC",
  },
  {
    icon: Key,
    label: "Password Entropy Lab",
    category: "Credential Defense",
    description: "NIST entropy mathematics & HaveIBeenPwned API breach verification.",
    path: "/password-lab",
    color: "text-primary",
    bgColor: "bg-primary/10",
    glow: "cyan",
    badge: "Entropy",
  },
  {
    icon: Search,
    label: "AI Threat Research",
    category: "Gemini Intelligence",
    description: "Persona-driven Blue Team, Red Team & SOC threat intelligence synthesis.",
    path: "/research",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    glow: "emerald",
    badge: "AI Threat",
  },
  {
    icon: Cpu,
    label: "Cyber Threat Simulations",
    category: "Interactive Sandbox",
    description: "Simulated sandbox scenarios for phishing triage, packet capture & DDoS mitigation.",
    path: "/simulations",
    color: "text-secondary",
    bgColor: "bg-secondary/15",
    glow: "purple",
    badge: "Simulation",
  },
];

export function SecuritySuitesGrid() {
  const navigate = useNavigate();

  return (
    <div data-tour="security-suites" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 text-foreground font-sans">
          <Layers className="w-4 h-4 text-primary" />
          Security Suites & Interactive Defense Labs
        </h2>
        <span className="text-xs text-muted-foreground font-mono">
          7 Engines Active
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {SECURITY_SUITES.map((tool, idx) => (
          <RevealOnScroll
            key={tool.label}
            direction="up"
            delay={30 * idx}
            className={idx === 6 ? "sm:col-span-2 lg:col-span-3 xl:col-span-1" : ""}
          >
            <InteractiveCard
              glowColor={tool.glow}
              onClick={() => navigate(tool.path)}
              className="p-4 sm:p-5 cursor-pointer group hover:border-primary/50 h-full flex flex-col justify-between transition-all duration-300"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div
                    className={`p-2.5 rounded-xl bg-card border border-border/80 ${tool.color} group-hover:scale-110 group-hover:shadow-neon-cyan-sm transition-all duration-300`}
                  >
                    <tool.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/50">
                    {tool.badge}
                  </span>
                </div>

                <div className="mt-3">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground block">
                    {tool.category}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors font-sans">
                    {tool.label}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed font-sans">
                    {tool.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-border/40 flex items-center justify-between text-xs font-mono text-primary">
                <span className="group-hover:underline">Launch Engine</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </InteractiveCard>
          </RevealOnScroll>
        ))}
      </div>
    </div>
  );
}
