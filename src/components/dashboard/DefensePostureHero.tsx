import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
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
  RotateCcw,
  TrendingUp,
  Zap,
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

// Cubic S-curve easing: smooth acceleration, rapid mid-range sweep, gentle deceleration & lock-in
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function DefensePostureHero({
  score,
  totalAudits,
  criticalIssues,
  factors,
  lastAuditTime,
  systemStatus: _systemStatus,
  onOpenReportModal,
  className,
}: DefensePostureHeroProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const prefersReducedMotion = useReducedMotion();

  // Animated live score driving needle, progress arc & digital readout in lockstep
  const [displayScore, setDisplayScore] = useState<number>(() =>
    prefersReducedMotion ? clampedScore : 0
  );
  const [isSweeping, setIsSweeping] = useState<boolean>(false);

  const displayScoreRef = useRef<number>(prefersReducedMotion ? clampedScore : 0);
  const animFrameRef = useRef<number | null>(null);
  const isInitialMountRef = useRef<boolean>(true);
  const prevTargetScoreRef = useRef<number>(clampedScore);

  // Keep displayScoreRef in sync with displayScore state
  useEffect(() => {
    displayScoreRef.current = displayScore;
  }, [displayScore]);

  // Sweep Animation Function: (fromScore -> targetScore)
  const triggerSweep = useCallback(
    (target: number, startFromZero: boolean = false) => {
      if (prefersReducedMotion) {
        setDisplayScore(target);
        displayScoreRef.current = target;
        setIsSweeping(false);
        return;
      }

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      setIsSweeping(true);
      const startScore = startFromZero ? 0 : displayScoreRef.current;
      const duration = 1600; // 1.6s calibrated physical vehicle/instrument sweep
      let startTime: number | null = null;

      const step = (timestamp: number) => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(progress);

        const current = startScore + (target - startScore) * eased;
        setDisplayScore(current);
        displayScoreRef.current = current;

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          setDisplayScore(target);
          displayScoreRef.current = target;
          setIsSweeping(false);
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [prefersReducedMotion]
  );

  // Trigger sweep on initial mount (0 -> target) and on subsequent target score updates (prev -> target)
  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayScore(clampedScore);
      displayScoreRef.current = clampedScore;
      return;
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevTargetScoreRef.current = clampedScore;

      // Small initial frame delay so DOM is painted at score=0 before smooth sweep initiates
      const timer = setTimeout(() => {
        triggerSweep(clampedScore, true);
      }, 80);

      return () => {
        clearTimeout(timer);
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    }

    // On target score update (e.g. after a new scan is completed)
    if (prevTargetScoreRef.current !== clampedScore) {
      prevTargetScoreRef.current = clampedScore;
      triggerSweep(clampedScore, false);
    }
  }, [clampedScore, prefersReducedMotion, triggerSweep]);

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // Derived current visual score (rounded integer for digital readout)
  const activeScore = Math.round(displayScore);

  // Dynamic Posture tier info calculated from current displayScore for fluid color transition during sweep
  const postureInfo = useMemo(() => {
    if (activeScore >= 90) {
      return {
        grade: "A",
        label: "OPTIMAL POSTURE",
        description: "Hardened perimeter with minimal attack surface exposure.",
        colorClass: "text-emerald-400",
        strokeColor: "#10b981", // emerald-500
        secondaryStroke: "#059669",
        needleColor: "#34d399",
        bgGlow: "rgba(16, 185, 129, 0.18)",
        badgeVariant: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
        icon: ShieldCheck,
      };
    }
    if (activeScore >= 80) {
      return {
        grade: "B",
        label: "FAVORABLE POSTURE",
        description: "Solid security baseline with minor configuration recommendations.",
        colorClass: "text-cyan-400",
        strokeColor: "#06b6d4", // cyan-500
        secondaryStroke: "#0891b2",
        needleColor: "#22d3ee",
        bgGlow: "rgba(6, 182, 212, 0.18)",
        badgeVariant: "border-cyan-500/40 text-cyan-400 bg-cyan-500/10",
        icon: ShieldCheck,
      };
    }
    if (activeScore >= 70) {
      return {
        grade: "C",
        label: "MODERATE RISK",
        description: "Actionable defense deficits detected across inspected targets.",
        colorClass: "text-yellow-400",
        strokeColor: "#eab308", // yellow-500
        secondaryStroke: "#ca8a04",
        needleColor: "#facc15",
        bgGlow: "rgba(234, 179, 8, 0.18)",
        badgeVariant: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
        icon: AlertTriangle,
      };
    }
    if (activeScore >= 50) {
      return {
        grade: "D",
        label: "ELEVATED EXPOSURE",
        description: "Critical misconfigurations require immediate mitigation.",
        colorClass: "text-amber-500",
        strokeColor: "#f59e0b", // amber-500
        secondaryStroke: "#d97706",
        needleColor: "#fbbf24",
        bgGlow: "rgba(245, 158, 11, 0.18)",
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
      needleColor: "#fb7185",
      bgGlow: "rgba(244, 63, 94, 0.22)",
      badgeVariant: "border-rose-500/40 text-rose-500 bg-rose-500/10",
      icon: ShieldAlert,
    };
  }, [activeScore]);

  // Radial geometry constants
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Progress Arc Offset directly tied to live displayScore
  const clampedDisplayScore = Math.max(0, Math.min(100, displayScore));
  const strokeDashoffset =
    circumference - (clampedDisplayScore / 100) * circumference;

  // Inner calibration ring
  const innerRadius = radius - 16;

  // Physical Needle Tip & Pivot trigonometry (starts at top -90deg, sweeps clockwise to 270deg)
  const angleDeg = -90 + (clampedDisplayScore / 100) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  const needleTipX = cx + radius * Math.cos(angleRad);
  const needleTipY = cy + radius * Math.sin(angleRad);
  const needleInnerX = cx + (innerRadius - 10) * Math.cos(angleRad);
  const needleInnerY = cy + (innerRadius - 10) * Math.sin(angleRad);
  const needlePivotX = cx + 22 * Math.cos(angleRad);
  const needlePivotY = cy + 22 * Math.sin(angleRad);

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
        className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-35 transition-all duration-700"
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
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
                Defense Posture Assessment
                {isSweeping && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-normal text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded-full animate-pulse">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    SWEEPING
                  </span>
                )}
              </h2>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px] uppercase font-semibold px-2 py-0.5 tracking-wider transition-colors duration-300",
                  postureInfo.badgeVariant
                )}
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

          {/* Interactive Re-Sweep Trigger Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => triggerSweep(clampedScore, true)}
            disabled={isSweeping}
            title="Re-run 0→Target Gauge Sweep"
            className="text-xs font-mono text-muted-foreground hover:text-primary hover:bg-primary/10 border border-border/50 hover:border-primary/40 px-2.5 h-8"
          >
            <RotateCcw className={cn("w-3.5 h-3.5 mr-1.5", isSweeping && "animate-spin text-primary")} />
            <span className="hidden xs:inline">Re-Sweep</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenReportModal}
            className="text-xs font-mono border-primary/40 hover:border-primary/80 text-primary bg-primary/10 hover:bg-primary/20 shadow-[0_0_16px_rgba(34,211,238,0.15)] active:scale-95 transition-all duration-200 h-8"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-primary" />
            <span>Executive Briefing</span>
          </Button>
        </div>
      </div>

      {/* Main Body: Radial Centerpiece + Factor Telemetry Breakdown */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center pt-6">
        {/* Left Column: Radial Posture Centerpiece with Physical Needle Sweep */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Ambient Radial Glow */}
            <div
              className="absolute inset-4 rounded-full blur-2xl opacity-40 transition-all duration-500 pointer-events-none"
              style={{ background: postureInfo.bgGlow }}
            />

            {/* Concentric Decorative Radial Ticks */}
            <div
              className={cn(
                "absolute inset-0 rounded-full border border-white/5 pointer-events-none",
                !prefersReducedMotion && "animate-[spin_80s_linear_infinite]"
              )}
              style={{
                backgroundImage:
                  "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.07) 0deg 1.5deg, transparent 1.5deg 15deg)",
              }}
            />

            {/* SVG Radial Gauge with Physical Arc & Needle Sweep */}
            <svg width={size} height={size} className="overflow-visible select-none">
              <defs>
                <linearGradient id="defenseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={postureInfo.strokeColor} />
                  <stop offset="100%" stopColor={postureInfo.secondaryStroke} />
                </linearGradient>
                <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={postureInfo.strokeColor} floodOpacity="0.75" />
                </filter>
                <filter id="needlePipGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={postureInfo.needleColor} floodOpacity="0.9" />
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ffffff" floodOpacity="0.8" />
                </filter>
              </defs>

              {/* Background Outer Track */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                fill="transparent"
                className="text-muted/30"
              />

              {/* Inner Calibration Dashed Ring */}
              <circle
                cx={cx}
                cy={cy}
                r={innerRadius}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                fill="transparent"
                className="text-white/10"
              />

              {/* Major Calibration Tick Marks (0%, 25%, 50%, 75%, 100%) */}
              {[0, 25, 50, 75, 100].map((tickPercent) => {
                const tickAngle = (-90 + (tickPercent / 100) * 360) * (Math.PI / 180);
                const x1 = cx + (radius - 9) * Math.cos(tickAngle);
                const y1 = cy + (radius - 9) * Math.sin(tickAngle);
                const x2 = cx + (radius + 9) * Math.cos(tickAngle);
                const y2 = cy + (radius + 9) * Math.sin(tickAngle);
                return (
                  <line
                    key={tickPercent}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Minor Calibration Tick Marks (every 10%) */}
              {[10, 20, 30, 40, 60, 70, 80, 90].map((tickPercent) => {
                const tickAngle = (-90 + (tickPercent / 100) * 360) * (Math.PI / 180);
                const x1 = cx + (radius - 5) * Math.cos(tickAngle);
                const y1 = cy + (radius - 5) * Math.sin(tickAngle);
                const x2 = cx + (radius + 5) * Math.cos(tickAngle);
                const y2 = cy + (radius + 5) * Math.sin(tickAngle);
                return (
                  <line
                    key={tickPercent}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Animated Progress Arc (Rotated -90deg so 0 is at top 12 o'clock) */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                stroke="url(#defenseGradient)"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                filter="url(#gaugeGlow)"
                transform={`rotate(-90 ${cx} ${cy})`}
                className="transition-colors duration-300"
              />

              {/* ⚡ PHYSICAL NEEDLE & SWEEP INDICATOR */}
              {displayScore > 0 && (
                <g className="pointer-events-none">
                  {/* Subtle Radar Needle Arm connecting center hub to arc tip */}
                  <line
                    x1={needlePivotX}
                    y1={needlePivotY}
                    x2={needleInnerX}
                    y2={needleInnerY}
                    stroke={postureInfo.needleColor}
                    strokeWidth="2"
                    strokeOpacity={isSweeping ? "0.85" : "0.5"}
                    strokeDasharray="3 3"
                    className="transition-colors duration-300"
                  />

                  {/* High-Precision Needle Head Pointer Blade */}
                  <line
                    x1={needleInnerX}
                    y1={needleInnerY}
                    x2={needleTipX}
                    y2={needleTipY}
                    stroke={postureInfo.needleColor}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="transition-colors duration-300"
                  />

                  {/* Glowing Leading Edge Orb Pip with Dual Halo */}
                  <circle
                    cx={needleTipX}
                    cy={needleTipY}
                    r={isSweeping ? 7 : 5.5}
                    fill={postureInfo.needleColor}
                    filter="url(#needlePipGlow)"
                    className="transition-all duration-150"
                  />
                  <circle
                    cx={needleTipX}
                    cy={needleTipY}
                    r="2.5"
                    fill="#ffffff"
                  />
                </g>
              )}

              {/* Center Pivot Core Badge Hub */}
              <circle
                cx={cx}
                cy={cy}
                r="38"
                fill="#0a0f1d"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            </svg>

            {/* Central Score & Grade Telemetry Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
              <span className="text-[9px] uppercase font-mono tracking-widest text-muted-foreground/80 mb-0.5">
                DEFENSE INDEX
              </span>
              <div className="flex items-baseline justify-center">
                <span
                  className={cn(
                    "text-4xl sm:text-5xl font-black tracking-tight font-mono leading-none transition-colors duration-300",
                    postureInfo.colorClass
                  )}
                >
                  {activeScore}
                </span>
                <span className="text-xs sm:text-sm font-mono text-muted-foreground ml-1">/100</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-muted/80 text-foreground border border-border/80 shadow-sm">
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
              const targetFactorScore = hasScore ? Math.round(factor.score!) : null;
              // Sub-factor bars sweep up proportionally with displayScore/clampedScore ratio
              const sweepRatio = clampedScore > 0 ? Math.min(1, displayScore / clampedScore) : 1;
              const liveFactorWidth = hasScore
                ? prefersReducedMotion
                  ? `${targetFactorScore}%`
                  : `${Math.round(targetFactorScore! * sweepRatio)}%`
                : "30%";

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
                                "text-xs font-mono font-bold px-1.5 py-0.5 rounded transition-colors duration-300",
                                targetFactorScore! >= 80
                                  ? "text-emerald-400 bg-emerald-500/10"
                                  : targetFactorScore! >= 60
                                  ? "text-amber-400 bg-amber-500/10"
                                  : "text-rose-400 bg-rose-500/10"
                              )}
                            >
                              {targetFactorScore}/100
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/40">
                              {factor.status === "pending" ? "Pending Scan" : "Active"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mini Bar Indicator with Synchronized Sweep */}
                      <div className="mt-2 w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-100",
                            hasScore
                              ? targetFactorScore! >= 80
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                : targetFactorScore! >= 60
                                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                                : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                              : "bg-primary/30"
                          )}
                          style={{
                            width: liveFactorWidth,
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
