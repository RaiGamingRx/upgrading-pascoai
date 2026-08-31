import React from "react";
import { cn } from "@/lib/utils";
import { InteractiveCard } from "@/components/motion/InteractiveCard";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  glowColor?: "cyan" | "purple" | "emerald" | "amber" | "green";
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  icon,
  trend,
  trendValue,
  glowColor = "cyan",
  className,
}: MetricCardProps) {
  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  const mappedGlow = glowColor === "green" ? "emerald" : glowColor;

  return (
    <InteractiveCard
      glowColor={mappedGlow}
      className={cn(
        "p-4 sm:p-5 flex flex-col justify-between h-full",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div className={cn(
            "p-1.5 sm:p-2 rounded-lg",
            glowColor === "cyan" && "bg-primary/10 text-primary",
            glowColor === "purple" && "bg-secondary/15 text-secondary",
            glowColor === "green" && "bg-emerald-500/10 text-emerald-400",
            glowColor === "amber" && "bg-amber-500/10 text-amber-400",
          )}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mt-3 sm:mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold font-mono">
            {value}
          </span>
          {unit && (
            <span className="text-xs sm:text-sm text-muted-foreground font-mono">
              {unit}
            </span>
          )}
        </div>

        {/* Trend indicator */}
        {trendValue && (
          <p className={cn("text-[11px] mt-1.5 font-mono", trendColor)}>
            {trend === "up" && "↑ "}
            {trend === "down" && "↓ "}
            {trendValue}
          </p>
        )}
      </div>
    </InteractiveCard>
  );
}
