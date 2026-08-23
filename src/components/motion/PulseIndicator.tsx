import React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface PulseIndicatorProps {
  color?: "cyan" | "emerald" | "amber" | "rose" | "purple" | "blue";
  size?: "sm" | "md" | "lg";
  label?: string;
  pulse?: boolean;
  className?: string;
}

const colorMap = {
  cyan: {
    dot: "bg-cyan-400",
    ring: "bg-cyan-400/40",
    text: "text-cyan-400",
  },
  emerald: {
    dot: "bg-emerald-400",
    ring: "bg-emerald-400/40",
    text: "text-emerald-400",
  },
  amber: {
    dot: "bg-amber-400",
    ring: "bg-amber-400/40",
    text: "text-amber-400",
  },
  rose: {
    dot: "bg-rose-400",
    ring: "bg-rose-400/40",
    text: "text-rose-400",
  },
  purple: {
    dot: "bg-purple-400",
    ring: "bg-purple-400/40",
    text: "text-purple-400",
  },
  blue: {
    dot: "bg-blue-400",
    ring: "bg-blue-400/40",
    text: "text-blue-400",
  },
};

export function PulseIndicator({
  color = "cyan",
  size = "md",
  label,
  pulse = true,
  className,
}: PulseIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();
  const c = colorMap[color] || colorMap.cyan;

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  const ringSizes = {
    sm: "w-4 h-4 -left-1 -top-1",
    md: "w-5 h-5 -left-1.25 -top-1.25",
    lg: "w-6 h-6 -left-1.5 -top-1.5",
  };

  const shouldPulse = pulse && !prefersReducedMotion;

  return (
    <div className={cn("inline-flex items-center gap-2 select-none", className)}>
      <div className="relative flex items-center justify-center">
        {shouldPulse && (
          <span
            className={cn(
              "absolute rounded-full animate-ping-ring pointer-events-none",
              c.ring,
              ringSizes[size]
            )}
          />
        )}
        <span
          className={cn(
            "rounded-full shadow-sm relative z-10 transition-colors",
            c.dot,
            sizeClasses[size]
          )}
        />
      </div>
      {label && (
        <span className={cn("text-xs font-mono tracking-wider", c.text)}>
          {label}
        </span>
      )}
    </div>
  );
}
