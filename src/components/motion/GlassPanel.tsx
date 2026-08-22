import React from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "cyber" | "glow" | "subtle" | "danger";
  className?: string;
}

export function GlassPanel({
  children,
  variant = "default",
  className,
  ...props
}: GlassPanelProps) {
  const variantStyles = {
    default: "bg-card/70 border-white/10 backdrop-blur-md",
    cyber: "bg-card/80 border-primary/30 backdrop-blur-lg shadow-neon-subtle",
    glow: "bg-card/90 border-cyan-500/40 backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.12)]",
    subtle: "bg-white/[0.03] border-white/5 backdrop-blur-sm",
    danger: "bg-destructive/10 border-destructive/30 backdrop-blur-md",
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border p-5 transition-all duration-300",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
