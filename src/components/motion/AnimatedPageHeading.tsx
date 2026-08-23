import React from "react";
import { cn } from "@/lib/utils";
import { PulseIndicator } from "@/components/motion/PulseIndicator";
import { Badge } from "@/components/ui/badge";

interface AnimatedPageHeadingProps {
  title: string;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "cyan" | "emerald" | "amber" | "purple" | "rose";
  statusText?: string;
  statusColor?: "cyan" | "emerald" | "amber" | "purple" | "rose";
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}

export function AnimatedPageHeading({
  title,
  subtitle,
  badgeText,
  badgeVariant = "cyan",
  statusText,
  statusColor = "cyan",
  icon: Icon,
  actions,
  className,
}: AnimatedPageHeadingProps) {
  const badgeStyles = {
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.15)]",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
  };

  return (
    <div className={cn("relative mb-6 sm:mb-8 overflow-visible", className)}>
      {/* Ambient backdrop glow */}
      <div
        className="pointer-events-none absolute -top-10 -left-10 w-72 h-32 bg-primary/10 rounded-full blur-3xl opacity-60 animate-aurora"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          {/* Top badges & Status row */}
          <div className="flex flex-wrap items-center gap-2.5">
            {badgeText && (
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[11px] px-2.5 py-0.5 tracking-wider uppercase border",
                  badgeStyles[badgeVariant]
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5 mr-1.5 inline-block -translate-y-0.5" />}
                {badgeText}
              </Badge>
            )}

            {statusText && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card/60 border border-border/60 backdrop-blur-sm">
                <PulseIndicator color={statusColor} size="sm" pulse />
                <span className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  {statusText}
                </span>
              </div>
            )}
          </div>

          {/* Animated Gradient Title */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="bg-gradient-to-r from-cyan-400 via-cyan-200 via-50% to-indigo-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-shift">
              {title}
            </span>
          </h1>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed font-sans">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action buttons slot */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
            {actions}
          </div>
        )}
      </div>

      {/* Subtle bottom separator accent line */}
      <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-border/80 to-transparent" />
    </div>
  );
}
