import React from "react";
import { cn } from "@/lib/utils";

interface PremiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "interactive" | "subtle" | "danger" | "success";
  glow?: boolean;
  glowColor?: "cyan" | "purple" | "green" | "red" | "none";
  hoverable?: boolean;
}

export function PremiumCard({
  children,
  variant = "default",
  glow = false,
  glowColor = "cyan",
  hoverable = false,
  className,
  ...props
}: PremiumCardProps) {
  const variantStyles = {
    default: "bg-card/70 border-border/70 hover:border-primary/30",
    elevated: "bg-card/85 border-border/50 hover:border-primary/40 shadow-surface-md",
    interactive: "bg-card/80 border-border/60 hover:border-primary/50 cursor-pointer active:scale-[0.98]",
    subtle: "bg-card/40 border-border/30 hover:border-border/50",
    danger: "bg-destructive/8 border-destructive/25 hover:border-destructive/40",
    success: "bg-success/8 border-success/25 hover:border-success/40",
  };

  const glowStyles = {
    cyan: glow ? "hover:shadow-neon-cyan-subtle" : "",
    purple: glow ? "hover:shadow-neon-purple" : "",
    green: glow ? "hover:shadow-neon-green-sm" : "",
    red: glow ? "hover:shadow-neon-red" : "",
    none: "",
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border backdrop-blur-md transition-all duration-300",
        variantStyles[variant],
        glowStyles[glowColor],
        hoverable && "hover:translate-y-[-2px]",
        className
      )}
      {...props}
    >
      {/* Top accent line */}
      {variant === "elevated" && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-t-xl" />
      )}
      {children}
    </div>
  );
}
