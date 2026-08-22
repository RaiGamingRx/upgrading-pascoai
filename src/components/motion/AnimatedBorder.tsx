import React from "react";
import { cn } from "@/lib/utils";

interface AnimatedBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  glowColor?: "cyan" | "emerald" | "purple";
}

export function AnimatedBorder({
  children,
  active = true,
  className,
  glowColor = "cyan",
  ...props
}: AnimatedBorderProps) {
  if (!active) {
    return <div className={className} {...props}>{children}</div>;
  }

  const gradient =
    glowColor === "emerald"
      ? "from-emerald-500/40 via-cyan-500/40 to-emerald-500/40"
      : glowColor === "purple"
      ? "from-purple-500/40 via-cyan-500/40 to-purple-500/40"
      : "from-cyan-500/50 via-purple-500/40 to-cyan-500/50";

  return (
    <div className={cn("relative p-[1px] rounded-xl overflow-hidden group", className)} {...props}>
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-r animate-border-flow bg-[length:200%_100%] opacity-70 group-hover:opacity-100 transition-opacity",
          gradient
        )}
      />
      <div className="relative rounded-[11px] bg-card h-full w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
