import React from "react";
import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { CountUp } from "@/components/motion/CountUp";
import {
  Scan,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Search,
  CheckCircle2,
  Terminal,
  Cpu,
} from "lucide-react";

interface MetricsGridProps {
  totalScans: number;
  criticalAndHighCount: number;
  cleanChecksCount: number;
  cryptoCount: number;
  researchCount: number;
}

export function MetricsGrid({
  totalScans,
  criticalAndHighCount,
  cleanChecksCount,
  cryptoCount,
  researchCount,
}: MetricsGridProps) {
  const statItems = [
    {
      id: "stat-scans",
      label: "Total Audits Run",
      value: totalScans,
      description: "Host recon, TLS & DNS checks",
      icon: Scan,
      color: "text-primary",
      bgColor: "bg-primary/10",
      glowColor: "cyan" as const,
      badge: "Perimeter",
    },
    {
      id: "stat-threats",
      label: "Threat Findings",
      value: criticalAndHighCount,
      description: "Critical & high-priority risks",
      icon: AlertTriangle,
      color: criticalAndHighCount > 0 ? "text-amber-400" : "text-emerald-400",
      bgColor: criticalAndHighCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      glowColor: criticalAndHighCount > 0 ? ("amber" as const) : ("emerald" as const),
      badge: criticalAndHighCount > 0 ? "Action Req" : "Zero Highs",
    },
    {
      id: "stat-defenses",
      label: "Clean Defenses",
      value: cleanChecksCount,
      description: "Passed hardening rules",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      glowColor: "emerald" as const,
      badge: "Verified",
    },
    {
      id: "stat-crypto",
      label: "Crypto Operations",
      value: cryptoCount,
      description: "AES-256 authenticated tokens",
      icon: Lock,
      color: "text-secondary",
      bgColor: "bg-secondary/15",
      glowColor: "purple" as const,
      badge: "WebCrypto",
    },
    {
      id: "stat-ai",
      label: "AI Threat Reports",
      value: researchCount,
      description: "Gemini intelligence syntheses",
      icon: Search,
      color: "text-primary",
      bgColor: "bg-primary/10",
      glowColor: "cyan" as const,
      badge: "Threat Intel",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {statItems.map((stat, idx) => (
        <RevealOnScroll
          key={stat.id}
          direction="up"
          delay={idx * 40}
          className={idx === 4 ? "col-span-2 sm:col-span-1" : ""}
        >
          <InteractiveCard
            glowColor={stat.glowColor}
            className="p-4 sm:p-5 flex flex-col justify-between h-full group border-border/70 hover:border-border transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                {stat.label}
              </span>
              <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bgColor} ${stat.color} transition-transform group-hover:scale-110`}>
                <stat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${stat.color}`}>
                  <CountUp end={stat.value} duration={1200} />
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 font-sans">
                {stat.description}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                {stat.badge}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
            </div>
          </InteractiveCard>
        </RevealOnScroll>
      ))}
    </div>
  );
}
