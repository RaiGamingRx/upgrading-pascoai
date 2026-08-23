import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface AnimatedBackgroundProps {
  showGrid?: boolean;
  intensity?: "subtle" | "normal" | "low";
  className?: string;
}

export function AnimatedBackground({
  showGrid = true,
  intensity = "normal",
  className,
}: AnimatedBackgroundProps) {
  const prefersReducedMotion = useReducedMotion();

  const opacityClass =
    intensity === "subtle"
      ? "opacity-25"
      : intensity === "low"
      ? "opacity-15"
      : "opacity-45";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden select-none",
        className
      )}
    >
      {/* Slow atmospheric backdrop color shift */}
      <div
        className={cn(
          "absolute inset-0 bg-[#060911]",
          !prefersReducedMotion && "animate-backdrop-shift"
        )}
      />

      {/* Orb A: Cyan Aurora Light Field (Top-Center / Upper Quadrant Drift) */}
      <div
        className={cn(
          "absolute -top-[20%] left-1/4 w-[900px] h-[650px] rounded-full blur-[110px] bg-gradient-to-br from-primary/22 via-cyan-500/12 to-transparent",
          !prefersReducedMotion ? "animate-ambient-cyan" : "opacity-60"
        )}
      />

      {/* Orb B: Deep Violet / Indigo Light Field (Bottom-Right Counter-Drift) */}
      <div
        className={cn(
          "absolute -bottom-[20%] -right-[10%] w-[850px] h-[700px] rounded-full blur-[125px] bg-gradient-to-tl from-secondary/20 via-indigo-600/12 to-transparent",
          !prefersReducedMotion ? "animate-ambient-violet" : "opacity-50"
        )}
      />

      {/* Orb C: Cyber Emerald / Teal Light Field (Bottom-Left to Mid-Left Drift) */}
      <div
        className={cn(
          "absolute -bottom-[15%] -left-[10%] w-[750px] h-[600px] rounded-full blur-[115px] bg-gradient-to-tr from-emerald-500/15 via-teal-500/8 to-transparent",
          !prefersReducedMotion ? "animate-ambient-emerald" : "opacity-45"
        )}
      />

      {/* Orb D: Central Atmosphere Breathing Core */}
      <div
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[700px] rounded-full blur-[130px] bg-gradient-to-b from-primary/10 via-indigo-950/8 to-transparent",
          !prefersReducedMotion ? "animate-ambient-core" : "opacity-40"
        )}
      />

      {/* Technical Cybersecurity Grid with smooth continuous drift & subtle opacity breath */}
      {showGrid && (
        <div
          className={cn(
            "absolute inset-0",
            !prefersReducedMotion && "animate-grid-pulse"
          )}
        >
          <div
            className={cn(
              "absolute inset-0",
              "bg-[linear-gradient(hsl(var(--border)_/_0.22)_1px,_transparent_1px),_linear-gradient(90deg,_hsl(var(--border)_/_0.22)_1px,_transparent_1px)]",
              "bg-[size:28px_28px]",
              opacityClass,
              "[mask-image:radial-gradient(ellipse_80%_65%_at_50%_40%,#000_40%,transparent_100%)]",
              !prefersReducedMotion && "animate-grid-drift"
            )}
          />
        </div>
      )}
    </div>
  );
}
