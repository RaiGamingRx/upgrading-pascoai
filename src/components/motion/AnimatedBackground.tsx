import { cn } from "@/lib/utils";

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
  const opacityClass =
    intensity === "subtle"
      ? "opacity-25"
      : intensity === "low"
      ? "opacity-10"
      : "opacity-50";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-[-1] overflow-hidden select-none",
        className
      )}
    >
      {/* Top ambient glow - cyan */}
      <div className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-primary/12 via-primary/4 to-transparent rounded-full blur-[120px] opacity-70" />

      {/* Bottom right subtle purple glow */}
      <div className="absolute -bottom-[25%] -right-[15%] w-[700px] h-[600px] bg-secondary/10 rounded-full blur-[140px] opacity-50" />

      {/* Bottom left subtle emerald glow */}
      <div className="absolute -bottom-[20%] -left-[15%] w-[600px] h-[550px] bg-accent/7 rounded-full blur-[120px] opacity-45" />

      {/* Center subtle gradient overlay */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[700px] bg-gradient-to-b from-primary/5 via-transparent to-secondary/5 rounded-full blur-[100px] opacity-40" />

      {/* Technical cybersecurity grid - enhanced */}
      {showGrid && (
        <div
          className={cn(
            "absolute inset-0",
            "bg-[linear-gradient(hsl(var(--border) / 0.2) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.2) 1px, transparent 1px)]",
            "bg-[size:24px_24px]",
            opacityClass,
            "[mask-image:radial-gradient(ellipse_70%_55%_at_50%_35%,#000_50%,transparent 100%)]"
          )}
        />
      )}
    </div>
  );
}
