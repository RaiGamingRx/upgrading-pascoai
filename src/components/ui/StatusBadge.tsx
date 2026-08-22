import React from "react";
import { cn } from "@/lib/utils";

export type StatusLevel = "critical" | "high" | "medium" | "low" | "info" | "success";

interface StatusBadgeProps {
  level: StatusLevel;
  children: React.ReactNode;
  animated?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusConfig = {
  critical: {
    bg: "bg-destructive/15",
    text: "text-destructive",
    border: "border-destructive/30",
    dot: "bg-destructive",
    label: "Critical",
  },
  high: {
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-500",
    label: "High",
  },
  medium: {
    bg: "bg-warning/15",
    text: "text-warning",
    border: "border-warning/30",
    dot: "bg-warning",
    label: "Medium",
  },
  low: {
    bg: "bg-accent/15",
    text: "text-accent",
    border: "border-accent/30",
    dot: "bg-accent",
    label: "Low",
  },
  info: {
    bg: "bg-primary/15",
    text: "text-primary",
    border: "border-primary/30",
    dot: "bg-primary",
    label: "Info",
  },
  success: {
    bg: "bg-success/15",
    text: "text-success",
    border: "border-success/30",
    dot: "bg-success",
    label: "Success",
  },
};

export function StatusBadge({
  level,
  children,
  animated = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const config = statusConfig[level];

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  const dotSize = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-medium transition-all duration-200",
        config.bg,
        config.text,
        config.border,
        sizeClasses[size],
        className
      )}
    >
      <div
        className={cn("rounded-full", config.dot, dotSize[size], animated && "animate-status-pulse")}
      />
      {children}
    </div>
  );
}
