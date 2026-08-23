import React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface AnimatedRadarProps {
  size?: number;
  className?: string;
  active?: boolean;
  color?: "cyan" | "emerald" | "amber" | "rose";
}

export function AnimatedRadar({
  size = 120,
  className,
  active = true,
  color = "cyan",
}: AnimatedRadarProps) {
  const prefersReducedMotion = useReducedMotion();

  const colorConfig = {
    cyan: {
      ring: "border-cyan-500/25",
      grid: "border-cyan-500/15",
      sweep: "from-cyan-500/30 via-cyan-500/10 to-transparent",
      center: "bg-cyan-400",
      target: "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]",
    },
    emerald: {
      ring: "border-emerald-500/25",
      grid: "border-emerald-500/15",
      sweep: "from-emerald-500/30 via-emerald-500/10 to-transparent",
      center: "bg-emerald-400",
      target: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
    },
    amber: {
      ring: "border-amber-500/25",
      grid: "border-amber-500/15",
      sweep: "from-amber-500/30 via-amber-500/10 to-transparent",
      center: "bg-amber-400",
      target: "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]",
    },
    rose: {
      ring: "border-rose-500/25",
      grid: "border-rose-500/15",
      sweep: "from-rose-500/30 via-rose-500/10 to-transparent",
      center: "bg-rose-400",
      target: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
    },
  }[color];

  return (
    <div
      className={cn(
        "relative rounded-full border bg-black/40 overflow-hidden flex items-center justify-center select-none shadow-inner",
        colorConfig.ring,
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Concentric rings */}
      <div className={cn("absolute rounded-full border w-3/4 h-3/4 pointer-events-none", colorConfig.grid)} />
      <div className={cn("absolute rounded-full border w-1/2 h-1/2 pointer-events-none", colorConfig.grid)} />
      <div className={cn("absolute rounded-full border w-1/4 h-1/4 pointer-events-none", colorConfig.grid)} />

      {/* Crosshairs */}
      <div className={cn("absolute inset-x-0 top-1/2 h-px -translate-y-1/2", colorConfig.grid)} />
      <div className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2", colorConfig.grid)} />

      {/* Radar sweep beam */}
      {active && !prefersReducedMotion && (
        <div
          className={cn(
            "absolute inset-0 origin-center animate-radar-sweep pointer-events-none",
            "rounded-full"
          )}
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, rgba(6, 182, 212, 0.35) 0deg, rgba(6, 182, 212, 0) 60deg, transparent 360deg)`,
          }}
        />
      )}

      {/* Center blip */}
      <div className={cn("relative z-10 w-2 h-2 rounded-full", colorConfig.center)} />

      {/* Simulated detected perimeter targets */}
      <div className={cn("absolute top-[28%] left-[65%] w-1.5 h-1.5 rounded-full animate-ping-ring", colorConfig.target)} />
      <div className={cn("absolute bottom-[35%] left-[22%] w-1.5 h-1.5 rounded-full", colorConfig.target)} />
    </div>
  );
}
