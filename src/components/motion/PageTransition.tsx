import React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  showAccentLine?: boolean;
}

export function PageTransition({
  children,
  className,
  showAccentLine = true,
}: PageTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "relative w-full min-h-[calc(100vh-4rem)] pb-12",
        !prefersReducedMotion && "animate-reveal-up",
        className
      )}
    >
      {/* Animated subtle top accent line */}
      {showAccentLine && (
        <div
          className="absolute -top-3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none"
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
