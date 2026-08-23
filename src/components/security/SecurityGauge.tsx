import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";

interface SecurityGaugeProps {
  score: number; // 0 - 100
  size?: "sm" | "md" | "lg";
  label?: string;
  showGrade?: boolean;
  className?: string;
}

export function SecurityGauge({
  score,
  size = "md",
  label = "Security Score",
  showGrade = true,
  className,
}: SecurityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const { grade, colorClass, strokeColor, glowColor } = useMemo(() => {
    if (clamped >= 90) {
      return {
        grade: "A",
        colorClass: "text-emerald-400",
        strokeColor: "#00FF9D",
        glowColor: "rgba(0, 255, 157, 0.4)",
      };
    }
    if (clamped >= 80) {
      return {
        grade: "B",
        colorClass: "text-cyan-400",
        strokeColor: "#00F0FF",
        glowColor: "rgba(0, 240, 255, 0.4)",
      };
    }
    if (clamped >= 70) {
      return {
        grade: "C",
        colorClass: "text-yellow-400",
        strokeColor: "#FACC15",
        glowColor: "rgba(250, 204, 21, 0.4)",
      };
    }
    if (clamped >= 50) {
      return {
        grade: "D",
        colorClass: "text-amber-500",
        strokeColor: "#F59E0B",
        glowColor: "rgba(245, 158, 11, 0.4)",
      };
    }
    return {
      grade: "F",
      colorClass: "text-red-500",
      strokeColor: "#EF4444",
      glowColor: "rgba(239, 68, 68, 0.4)",
    };
  }, [clamped]);

  const dim = size === "sm" ? 80 : size === "lg" ? 140 : 104;
  const strokeWidth = size === "sm" ? 6 : size === "lg" ? 10 : 8;
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center justify-center text-center", className)}>
      <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
        {/* Glow backdrop with subtle breathing animation */}
        <div
          className="absolute inset-2 rounded-full blur-xl opacity-25 transition-all duration-700 pointer-events-none"
          style={{ background: glowColor }}
        />

        {/* SVG Circle Gauge */}
        <svg width={dim} height={dim} className="rotate-[-90deg] overflow-visible">
          {/* Background Track */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-white/10"
          />
          {/* Animated Progress Value */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s ease",
            }}
          />
        </svg>

        {/* Center score readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className={cn("font-bold tracking-tight font-mono", colorClass, size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-2xl")}>
            <CountUp end={clamped} duration={1200} />
          </span>
          {showGrade && size !== "sm" && (
            <span className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground mt-0.5">
              Grade {grade}
            </span>
          )}
        </div>
      </div>

      {label && <p className="text-xs text-muted-foreground mt-2 font-medium">{label}</p>}
    </div>
  );
}
