import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface InteractiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glowColor?: "cyan" | "emerald" | "purple" | "amber" | "none";
  enableTilt?: boolean;
}

const glowColors = {
  cyan: "hsl(var(--primary) / 0.16)",
  emerald: "hsl(var(--success) / 0.15)",
  purple: "hsl(var(--secondary) / 0.16)",
  amber: "hsl(var(--warning) / 0.15)",
} as const;

export function InteractiveCard({ children, className, glowColor = "cyan", enableTilt = true, ...props }: InteractiveCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointer = useRef({ x: 50, y: 50, rotateX: 0, rotateY: 0 });
  const prefersReducedMotion = useReducedMotion();

  const paint = () => {
    frame.current = null;
    const element = ref.current;
    if (!element) return;
    element.style.setProperty("--spotlight-x", `${pointer.current.x}%`);
    element.style.setProperty("--spotlight-y", `${pointer.current.y}%`);
    element.style.setProperty("--card-rx", `${pointer.current.rotateX}deg`);
    element.style.setProperty("--card-ry", `${pointer.current.rotateY}deg`);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || event.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    pointer.current = { x, y, rotateX: enableTilt ? (50 - y) * 0.025 : 0, rotateY: enableTilt ? (x - 50) * 0.025 : 0 };
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  };

  const reset = () => {
    pointer.current = { x: 50, y: 50, rotateX: 0, rotateY: 0 };
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      style={{ "--spotlight-color": glowColor === "none" ? "transparent" : glowColors[glowColor] } as React.CSSProperties}
      className={cn("interactive-card relative overflow-hidden rounded-xl border border-border/70 bg-card/70 backdrop-blur-md", className)}
      {...props}
    >
      <div className="interactive-card__spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="interactive-card__edge pointer-events-none absolute inset-x-6 top-0 h-px" aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
