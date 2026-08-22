import { Loader2, ShieldCheck, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  title?: string;
  description?: string;
  variant?: "scan" | "ai" | "simple";
  className?: string;
}

export function LoadingState({
  title = "Analyzing telemetry...",
  description = "Performing threat intelligence correlation and verification",
  variant = "scan",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm",
        className
      )}
    >
      <div className="relative mb-5 flex items-center justify-center">
        {/* Pulsing outer aura */}
        <div className="absolute w-16 h-16 rounded-full bg-primary/20 animate-ping opacity-30" />
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-neon-cyan-subtle">
          {variant === "scan" ? (
            <ShieldCheck className="w-6 h-6 text-primary animate-pulse" />
          ) : variant === "ai" ? (
            <Cpu className="w-6 h-6 text-secondary animate-pulse" />
          ) : (
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          )}
        </div>
      </div>
      <h4 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">{title}</h4>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
    </div>
  );
}
