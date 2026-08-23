import React, { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileText,
  Activity,
  Globe,
  MailCheck,
  Scan,
  Lock,
  Key,
  CheckCircle2,
  TrendingUp,
  Sparkles,
} from "lucide-react";

export interface DefenseFactor {
  id: string;
  name: string;
  category: string;
  score: number | null;
  status: "verified" | "attention" | "pending";
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  linkPath: string;
}

interface DefensePostureHeroProps {
  score: number;
  totalAudits: number;
  criticalIssues: number;
  factors: DefenseFactor[];
  lastAuditTime?: string | null;
  systemStatus: "operational" | "warning" | "critical";
  onOpenReportModal: () => void;
  className?: string;
}

export function DefensePostureHero({
  score,
  totalAudits,
  criticalIssues,
  factors,
  lastAuditTime,
  systemStatus,
  onOpenReportModal,
  className,
}: DefensePostureHeroProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  const postureInfo = useMemo(() => {
    if (clampedScore >= 90) {
      return {
        grade: "A",
        label: "OPTIMAL POSTURE",
        description: "Hardened perimeter with minimal attack surface exposure.",
        colorClass: "text-emerald-400",
        strokeColor: "#10b981", // emerald-500
        secondaryStroke: "#059669",
        bgGlow: "rgba(16, 185, 129, 0.15)",
        badgeVariant: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
        icon: ShieldCheck,
      };
    }
    if (clampedScore >= 80) {
      return {
        grade: "B",
        label: "FAVORABLE POSTURE",
        description: "Solid security baseline with minor configuration recommendations.",
        colorClass: "text-cyan-400",
        strokeColor: "#06b6d4", // cyan-500
        secondaryStroke: "#0891b2",
        bgGlow: "rgba(6, 182, 212, 0.15)",
        badgeVariant: "border-cyan-500/40 text-cyan-400 bg-cyan-500/10",
        icon: ShieldCheck,
      };
    }
    if (clampedScore >= 70) {
      return {
        grade: "C",
        label: "MODERATE RISK",
        description: "Actionable defense deficits detected across inspected targets.",
        colorClass: "text-yellow-400",
        strokeColor: "#eab308", // yellow-500
        secondaryStroke: "#ca8a04",
        bgGlow: "rgba(234, 179, 8, 0.15)",
        badgeVariant: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
        icon: AlertTriangle,
      };
    }
    if (clampedScore >= 50) {
      return {
        grade: "D",
        label: "ELEVATED EXPOSURE",
        description: "Critical misconfigurations require immediate mitigation.",
        colorClass: "text-amber-500",
        strokeColor: "#f59e0b", // amber-500
        secondaryStroke: "#d97706",
        bgGlow: "rgba(245, 158, 11, 0.15)",
        badgeVariant: "border-amber-500/40 text-amber-500 bg-amber-500/10",
        icon: ShieldAlert,
      };
    }
    return {
      grade: "F",
      label: "CRITICAL DEFICIT",
      description: "Severe exposure vulnerability. Immediate intervention recommended.",
      colorClass: "text-rose-500",
      strokeColor: "#f43f5e", // rose-500
      secondaryStroke: "#e11d48",
      bgGlow: "rgba(244, 63, 94, 0.18)",
      badgeVariant: "border-rose-500/40 text-rose-500 bg-rose-500/10",
      icon: ShieldAlert,
    };
  }, [clampedScore]);

  const prefersReducedMotion = useReducedMotion();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Trigger smooth 0 -> target transition on mount
    const timer = setTimeout(() => setIsMounted(true), 60);
    return () => clearTimeout(timer);
  }, []);

  // Radial dimensions
  const size = 220;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Animate from full circumference (0%) to target offset
  const targetDashoffset = circumference - (clampedScore / 100) * circumference;
  const strokeDashoffset = prefersReducedMotion || isMounted ? targetDashoffset : circumference;

  // Inner calibration ring
  const innerRadius = radius - 16;
  const innerCircumference = 2 * Math.PI * innerRadius;

  return (
    <div
      data-tour="defense-gauge"
      className={cn(
        "relative rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xl p-5 sm:p-7 overflow-hidden transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.36)]",
        className
      )}
    >
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-30 transition-all duration-1000"
        style={{ background: postureInfo.bgGlow }}
      />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full blur-3xl bg-secondary/10 opacity-30" />

      {/* Top Header Row */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-neon-cyan-sm shrink-0">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-sans">
                Defense Posture Assessment
              </h2>
              <Badge
                variant="outline"
                className={cn("font-mono text-[10px] uppercase font-semibold px-2 py-0.5 tracking-wider", postureInfo.badgeVariant)}
              >
                {postureInfo.label}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 font-sans">
              Aggregated real-time health across network perimeter, web endpoints, email DNS & crypto engines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
          <div className="hidden sm:flex flex-col items-end mr-1 text-right">
            <span className="text-[11px] font-mono text-muted-foreground">
              {lastAuditTime ? `Latest Audit: ${lastAuditTime}` : "Real-time Telemetry"}
            </span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              Continuous Engine Sync
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenReportModal}
            className="text-xs font-mono border-primary/40 hover:border-primary/80 text-primary bg-primary/10 hover:bg-primary/20 shadow-[0_0_16px_rgba(34,211,238,0.15)] active:scale-95 transition-all duration-200"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-primary" />
            <span>Executive Briefing</span>
          </Button>
        </div>
      </div>

      {/* Main Body: Radial Centerpiece + Factor Telemetry Breakdown */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center pt-6">
        {/* Left Column: Radial Posture Centerpiece */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Ambient Radial Blur */}
            <div
              className="absolute inset-4 rounded-full blur-2xl opacity-40 transition-all duration-700 pointer-events-none"
              style={{ background: postureInfo.bgGlow }}
            />

            {/* Concentric Decorative Ticks */}
            <div
              className="absolute inset-0 rounded-full border border-white/5 pointer-events-none animate-[spin_60s_linear_infinite]"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.06) 0deg 2deg, transparent 2deg 15deg)",
              }}
            />

            {/* SVG Centerpiece Gauge */}
            <svg width={size} height={size} className="rotate-[-90deg] overflow-visible">
              <defs>
                <linearGradient id="defenseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={postureInfo.strokeColor} />
                  <stop offset="100%" stopColor={postureInfo.secondaryStroke} />
                </linearGradient>
                <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={postureInfo.strokeColor} floodOpacity="0.6" />
                </filter>
              </defs>

              {/* Background Outer Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                fill="transparent"
                className="text-muted/40"
              />

              {/* Inner Calibration Dashed Ring */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={innerRadius}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                fill="transparent"
                className="text-white/10"
              />

              {/* Animated Progress Arc */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="url(#defenseGradient)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                filter="url(#gaugeGlow)"
                style={{
                  transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.6s ease",
                }}
              />
            </svg>

            {/* Score & Grade Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
              <span className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground/80 mb-0.5">
                DEFENSE INDEX
              </span>
              <div className="flex items-baseline justify-center">
                <span className={cn("text-4xl sm:text-5xl font-black tracking-tight font-mono leading-none", postureInfo.colorClass)}>
                  <CountUp end={clampedScore} duration={1400} />
                </span>
                <span className="text-xs sm:text-sm font-mono text-muted-foreground ml-1">/100</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-muted/80 text-foreground border border-border/80">
                  GRADE {postureInfo.grade}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center max-w-[280px]">
            <p className="text-xs text-muted-foreground/90 font-sans leading-relaxed">
              {postureInfo.description}
            </p>
          </div>
        </div>

        {/* Right Column: Factor Assessment Breakdown */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              Verified Sub-System Factor Ratings
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {totalAudits > 0 ? `${totalAudits} Total Audits Processed` : "Awaiting Scans"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {factors.map((factor) => {
              const hasScore = typeof factor.score === "number";
              const scoreVal = hasScore ? Math.round(factor.score!) : null;

              return (
                <Tooltip key={factor.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/80 hover:border-primary/40 transition-all duration-200 cursor-default",
                        factor.status === "attention" && "border-amber-500/30 bg-amber-500/[0.02]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 rounded-lg bg-muted/60 text-primary shrink-0">
                            <factor.icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{factor.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">{factor.category}</p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {hasScore ? (
                            <span
                              className={cn(
                                "text-xs font-mono font-bold px-1.5 py-0.5 rounded",
                                scoreVal! >= 80
                                  ? "text-emerald-400 bg-emerald-500/10"
                                  : scoreVal! >= 60
                                  ? "text-amber-400 bg-amber-500/10"
                                  : "text-rose-400 bg-rose-500/10"
                              )}
                            >
                              {scoreVal}/100
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/40">
                              {factor.status === "pending" ? "Pending Scan" : "Active"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini Bar Indicator */}
                      <div className="mt-2 w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            hasScore
                              ? scoreVal! >= 80
                                ? "bg-emerald-400"
                                : scoreVal! >= 60
                                ? "bg-amber-400"
                                : "bg-rose-500"
                              : "bg-primary/30"
                          )}
                          style={{
                            width: prefersReducedMotion || isMounted
                              ? hasScore
                                ? `${scoreVal}%`
                                : "30%"
                              : "0%",
                          }}
                        />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-popover border-border text-xs max-w-xs p-3">
                    <p className="font-semibold text-foreground">{factor.name}</p>
                    <p className="text-muted-foreground text-[11px] mt-1">{factor.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Critical Issues Notice if any */}
          {criticalIssues > 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-between text-xs text-destructive-foreground">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <span>
                  <strong className="font-mono">{criticalIssues}</strong> high-risk vulnerability
                  {criticalIssues > 1 ? "ies" : "y"} requires remediation across active targets.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
