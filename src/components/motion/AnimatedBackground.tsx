import { useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface AnimatedBackgroundProps {
  showGrid?: boolean;
  showStars?: boolean;
  intensity?: "subtle" | "normal" | "low";
  className?: string;
}

export function AnimatedBackground({
  showGrid = true,
  showStars = true,
  intensity = "normal",
  className,
}: AnimatedBackgroundProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // Motion physics refs
  const targetXRef = useRef<number>(0);
  const targetYRef = useRef<number>(0);
  const currentXRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      if (containerRef.current) {
        containerRef.current.style.setProperty("--aurora-px", "0");
        containerRef.current.style.setProperty("--aurora-py", "0");
      }
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Fluid spring/lerp loop with crisp 0.088 damping factor
    const updatePhysics = () => {
      const factor = 0.088; // Quick responsiveness with organic trailing inertia
      currentXRef.current += (targetXRef.current - currentXRef.current) * factor;
      currentYRef.current += (targetYRef.current - currentYRef.current) * factor;

      // Update CSS custom properties directly on the DOM container (no React re-renders)
      container.style.setProperty("--aurora-px", currentXRef.current.toFixed(4));
      container.style.setProperty("--aurora-py", currentYRef.current.toFixed(4));

      const delta =
        Math.abs(targetXRef.current - currentXRef.current) +
        Math.abs(targetYRef.current - currentYRef.current);

      // Keep running if actively moving or not yet settled at rest
      if (
        delta > 0.0004 ||
        Math.abs(currentXRef.current) > 0.0008 ||
        Math.abs(currentYRef.current) > 0.0008
      ) {
        animFrameRef.current = requestAnimationFrame(updatePhysics);
      } else {
        // Settled back to rest
        isRunningRef.current = false;
        animFrameRef.current = null;
        container.style.setProperty("--aurora-px", "0");
        container.style.setProperty("--aurora-py", "0");
      }
    };

    const wakeLoop = () => {
      if (!isRunningRef.current) {
        isRunningRef.current = true;
        animFrameRef.current = requestAnimationFrame(updatePhysics);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      // Normalize pointer coordinates to [-1, 1] relative to viewport center
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      const nx = Math.max(-1, Math.min(1, (e.clientX / width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (e.clientY / height - 0.5) * 2));

      targetXRef.current = nx;
      targetYRef.current = ny;
      wakeLoop();

      // Reset auto-settle idle timer: if pointer is idle for 3 seconds, gently settle to neutral
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        targetXRef.current = 0;
        targetYRef.current = 0;
        wakeLoop();
      }, 3000);
    };

    const handlePointerLeave = () => {
      targetXRef.current = 0;
      targetYRef.current = 0;
      wakeLoop();
    };

    // Global pointer listeners (covers mouse, pen, and touch seamlessly)
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [prefersReducedMotion]);

  const gridOpacity =
    intensity === "subtle"
      ? "opacity-20"
      : intensity === "low"
      ? "opacity-12"
      : "opacity-35";

  // Pre-calculated deterministic star coordinates for deep night sky atmosphere
  const stars = useMemo(
    () => [
      { cx: "12%", cy: "18%", r: "1.2", opacity: 0.7, delay: "0s" },
      { cx: "24%", cy: "42%", r: "1.5", opacity: 0.9, delay: "1.8s" },
      { cx: "38%", cy: "12%", r: "1.0", opacity: 0.6, delay: "3.2s" },
      { cx: "52%", cy: "28%", r: "1.6", opacity: 0.85, delay: "0.9s" },
      { cx: "68%", cy: "16%", r: "1.1", opacity: 0.65, delay: "2.4s" },
      { cx: "82%", cy: "36%", r: "1.4", opacity: 0.8, delay: "4.1s" },
      { cx: "91%", cy: "14%", r: "1.2", opacity: 0.75, delay: "1.5s" },
      { cx: "18%", cy: "75%", r: "1.3", opacity: 0.7, delay: "2.8s" },
      { cx: "34%", cy: "88%", r: "1.1", opacity: 0.6, delay: "0.5s" },
      { cx: "62%", cy: "78%", r: "1.5", opacity: 0.85, delay: "3.6s" },
      { cx: "78%", cy: "84%", r: "1.2", opacity: 0.65, delay: "1.2s" },
      { cx: "88%", cy: "68%", r: "1.4", opacity: 0.75, delay: "2.1s" },
    ],
    []
  );

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden select-none",
        className
      )}
    >
      {/* ── Layer 0: Deep Midnight Atmospheric Base ── */}
      <div
        className={cn(
          "absolute inset-0 bg-[#020510]",
          !prefersReducedMotion && "animate-backdrop-shift"
        )}
      />

      {/* ── Layer 1: Primary Cyan & Electric Blue Aurora Curtain (Interactive Parallax: +128px X, +84px Y, +2.5deg tilt) ── */}
      <div
        className="absolute inset-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(calc(var(--aurora-px, 0) * 128px), calc(var(--aurora-py, 0) * 84px), 0) rotate(calc(var(--aurora-px, 0) * 2.5deg))`,
        }}
      >
        <div
          className={cn(
            "absolute -top-[12%] -left-[15%] w-[140vw] max-w-[2000px] h-[52vh] rounded-[100%_80%_90%_70%/60%_80%_60%_70%] blur-[38px] sm:blur-[46px] mix-blend-screen",
            "bg-[linear-gradient(135deg,rgba(0,255,204,0)_0%,rgba(0,255,204,0.36)_25%,rgba(0,170,255,0.42)_55%,rgba(0,170,255,0.12)_80%,transparent_100%)]",
            !prefersReducedMotion ? "animate-aurora-1" : "opacity-60"
          )}
        />
      </div>

      {/* ── Layer 2: Counter-Flowing Violet & Electric Magenta Ribbon (Interactive Parallax: -112px X, -78px Y, -3deg tilt) ── */}
      <div
        className="absolute inset-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(calc(var(--aurora-px, 0) * -112px), calc(var(--aurora-py, 0) * -78px), 0) rotate(calc(var(--aurora-py, 0) * -3deg))`,
        }}
      >
        <div
          className={cn(
            "absolute -bottom-[10%] -right-[15%] w-[135vw] max-w-[1900px] h-[50vh] rounded-[80%_100%_70%_90%/70%_60%_80%_60%] blur-[40px] sm:blur-[48px] mix-blend-screen",
            "bg-[linear-gradient(225deg,rgba(170,68,255,0)_0%,rgba(170,68,255,0.32)_30%,rgba(255,102,170,0.36)_60%,rgba(99,102,241,0.18)_85%,transparent_100%)]",
            !prefersReducedMotion ? "animate-aurora-2" : "opacity-55"
          )}
        />
      </div>

      {/* ── Layer 3: Cyber Emerald & Spring Teal Flowing Stream (Interactive Cross-Parallax: +96px Y, +118px X, scale flux) ── */}
      <div
        className="absolute inset-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(calc(var(--aurora-py, 0) * 96px), calc(var(--aurora-px, 0) * 118px), 0) scale(calc(1 + var(--aurora-px, 0) * 0.04))`,
        }}
      >
        <div
          className={cn(
            "absolute top-[22%] -left-[10%] w-[125vw] max-w-[1700px] h-[40vh] rounded-[90%_70%_100%_80%/60%_90%_60%_80%] blur-[34px] sm:blur-[42px] mix-blend-screen",
            "bg-[linear-gradient(115deg,transparent_0%,rgba(68,255,170,0.28)_35%,rgba(0,255,204,0.26)_65%,transparent_100%)]",
            !prefersReducedMotion ? "animate-aurora-3" : "opacity-50"
          )}
        />
      </div>

      {/* ── Layer 4: Deep Atmosphere Core & Magenta Accent Ribbon (Interactive Parallax: -88px X, +98px Y) ── */}
      <div
        className="absolute inset-0 pointer-events-none will-change-transform"
        style={{
          transform: `translate3d(calc(var(--aurora-px, 0) * -88px), calc(var(--aurora-py, 0) * 98px), 0)`,
        }}
      >
        <div
          className={cn(
            "absolute -top-[5%] right-[-8%] w-[115vw] max-w-[1500px] h-[38vh] rounded-[70%_90%_80%_100%/80%_60%_90%_60%] blur-[42px] sm:blur-[50px] mix-blend-screen",
            "bg-[linear-gradient(160deg,transparent_15%,rgba(255,102,170,0.24)_45%,rgba(170,68,255,0.28)_75%,transparent_100%)]",
            !prefersReducedMotion ? "animate-aurora-4" : "opacity-45"
          )}
        />
      </div>

      {/* ── Layer 5: Subtle Micro Starfield / Atmospheric Dust (Interactive Parallax: +32px X, +24px Y) ── */}
      {showStars && (
        <div
          className="absolute inset-0 pointer-events-none will-change-transform"
          style={{
            transform: `translate3d(calc(var(--aurora-px, 0) * 32px), calc(var(--aurora-py, 0) * 24px), 0)`,
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full opacity-40 pointer-events-none select-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {stars.map((star, idx) => (
              <circle
                key={idx}
                cx={star.cx}
                cy={star.cy}
                r={star.r}
                fill="#ffffff"
                opacity={star.opacity}
                className={!prefersReducedMotion ? "animate-star-twinkle" : ""}
                style={{
                  animationDelay: star.delay,
                }}
              />
            ))}
          </svg>
        </div>
      )}

      {/* ── Layer 6: Technical Cybersecurity Grid (Interactive Parallax: +16px X, +14px Y) ── */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none will-change-transform"
          style={{
            transform: `translate3d(calc(var(--aurora-px, 0) * 16px), calc(var(--aurora-py, 0) * 14px), 0)`,
          }}
        >
          <div
            className={cn(
              "absolute inset-0",
              !prefersReducedMotion && "animate-grid-pulse"
            )}
          >
            <div
              className={cn(
                "absolute inset-0",
                "bg-[linear-gradient(hsl(var(--border)_/_0.2)_1px,_transparent_1px),_linear-gradient(90deg,_hsl(var(--border)_/_0.2)_1px,_transparent_1px)]",
                "bg-[size:32px_32px]",
                gridOpacity,
                "[mask-image:radial-gradient(ellipse_80%_60%_at_50%_45%,#000_30%,transparent_100%)]",
                !prefersReducedMotion && "animate-grid-drift"
              )}
            />
          </div>
        </div>
      )}

      {/* ── Layer 7: Foreground Contrast & Readability Vignette (Fixed Anchor) ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#020510_92%)] opacity-85 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#020510]/30 via-transparent to-[#020510]/70 pointer-events-none" />
    </div>
  );
}
