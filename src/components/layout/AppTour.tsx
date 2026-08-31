import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useLocation } from "react-router-dom";
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Command,
  Activity,
  ShieldCheck,
  Layers,
  Settings,
} from "lucide-react";

type LayoutMode = "desktop" | "mobile";

interface TourStep {
  key: string;
  selector: string;
  fallbackSelector?: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  preferredPlacement?: "bottom" | "top" | "left" | "right" | "auto";
  spotlightPadding?: number;
  borderRadius?: number;
  waitForEvent?: string;
  waitTimeout?: number;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

interface TooltipCoords {
  top: number;
  left: number;
  placement: "top" | "bottom" | "left" | "right";
  arrowOffset: number;
}

const STORAGE_KEY = "pasco_tour_completed";
const SKIPPED_KEY = "pasco_tour_skipped";
const TOOLTIP_DESKTOP_WIDTH = 340;
const TOOLTIP_MOBILE_WIDTH_OFFSET = 24; // 12px margin on each side
const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 12;

function isUsableElement(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    style.pointerEvents === "none"
  ) {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisible(selector: string): HTMLElement | null {
  try {
    const matches = Array.from(document.querySelectorAll(selector));
    return matches.find(isUsableElement) ?? null;
  } catch {
    return null;
  }
}

function getLayoutMode(): LayoutMode {
  if (typeof window === "undefined") return "desktop";
  if (findVisible("[data-tour='hamburger']")) return "mobile";
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

export function AppTour() {
  const { isDemo } = useAuth();
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [layout, setLayout] = useState<LayoutMode>(getLayoutMode);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<TooltipCoords>({
    top: 100,
    left: 20,
    placement: "bottom",
    arrowOffset: 20,
  });

  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTriggerRef = useRef(false);

  // Logical first-time user tour flow based strictly on existing features
  const steps = useMemo<TourStep[]>(() => {
    if (layout === "mobile") {
      return [
        {
          key: "mobile-nav",
          selector: "[data-tour='hamburger']",
          fallbackSelector: "[data-tour='topbar']",
          title: "Navigation & Tools",
          description: "Tap here to toggle the operations menu and access vulnerability scanning, cryptographic engines, and security labs.",
          icon: Compass,
          preferredPlacement: "bottom",
          spotlightPadding: 6,
          borderRadius: 10,
          waitForEvent: "tour:menu-opened",
          waitTimeout: 5000,
        },
        {
          key: "command-search",
          selector: "[data-tour='command-btn']",
          fallbackSelector: "[data-tour='topbar']",
          title: "Quick Action Command Palette",
          description: "Instantly search all security tools, trigger rapid scans, and execute commands from anywhere.",
          icon: Command,
          preferredPlacement: "bottom",
          spotlightPadding: 6,
          borderRadius: 10,
        },
        {
          key: "guard-status",
          selector: "[data-tour='guard-status']",
          fallbackSelector: "[data-tour='topbar']",
          title: "Active Guard & Telemetry",
          description: "Real-time posture monitoring and live defense state verification for your active session.",
          icon: Activity,
          preferredPlacement: "bottom",
          spotlightPadding: 6,
          borderRadius: 12,
        },
        {
          key: "defense-gauge",
          selector: "[data-tour='defense-gauge']",
          fallbackSelector: "[data-tour='dashboard']",
          title: "Defense Posture Gauge",
          description: "Your aggregated defense rating calculated dynamically from domain scans, TLS certificates, and NIST entropy audits.",
          icon: ShieldCheck,
          preferredPlacement: "bottom",
          spotlightPadding: 8,
          borderRadius: 16,
        },
        {
          key: "security-suites",
          selector: "[data-tour='security-suites']",
          fallbackSelector: "[data-tour='dashboard']",
          title: "Security Suites & Labs",
          description: "Launch specialized defense engines: Domain Reconnaissance, Web Security Audit, AES-256 Crypto Lab, and AI Research.",
          icon: Layers,
          preferredPlacement: "top",
          spotlightPadding: 8,
          borderRadius: 16,
        },
        {
          key: "user-profile",
          selector: "[data-tour='user-profile']",
          fallbackSelector: "[data-tour='topbar']",
          title: "Operator Profile & Settings",
          description: "Configure your defense persona (SOC Analyst, Red/Blue Team), custom data export formats, and security keys.",
          icon: Settings,
          preferredPlacement: "bottom",
          spotlightPadding: 6,
          borderRadius: 999,
        },
      ];
    }

    return [
      {
        key: "sidebar-nav",
        selector: "[data-tour='sidebar']",
        title: "Navigation & Security Hub",
        description: "Access your cyber defense command center: Domain Reconnaissance, TLS Audits, Email Anti-Spoofing, and Security Labs.",
        icon: Compass,
        preferredPlacement: "right",
        spotlightPadding: 4,
        borderRadius: 0,
      },
      {
        key: "command-search",
        selector: "[data-tour='command-search']",
        title: "Command Palette & Quick Search",
        description: "Press ⌘K or click here to rapidly search all cyber security modules, switch tools, and trigger fast actions.",
        icon: Command,
        preferredPlacement: "bottom",
        spotlightPadding: 6,
        borderRadius: 10,
      },
      {
        key: "guard-status",
        selector: "[data-tour='guard-status']",
        title: "Live Guard Telemetry",
        description: "Continuous telemetry monitoring active defenses, demo environment status, and operator authentication state.",
        icon: Activity,
        preferredPlacement: "bottom",
        spotlightPadding: 6,
        borderRadius: 12,
      },
      {
        key: "defense-gauge",
        selector: "[data-tour='defense-gauge']",
        title: "Defense Posture Gauge",
        description: "Aggregated cybersecurity rating calculated dynamically from your real-time network, web, and password audits.",
        icon: ShieldCheck,
        preferredPlacement: "bottom",
        spotlightPadding: 10,
        borderRadius: 16,
      },
      {
        key: "security-suites",
        selector: "[data-tour='security-suites']",
        title: "Interactive Security Suites",
        description: "One-click access to 7 dedicated defense tools including Domain Scanner, Web Audit, AES-256 Crypto Lab, and AI Research.",
        icon: Layers,
        preferredPlacement: "top",
        spotlightPadding: 10,
        borderRadius: 16,
      },
      {
        key: "user-profile",
        selector: "[data-tour='user-profile']",
        title: "Settings & Operator Persona",
        description: "Customize your threat analysis persona (SOC Analyst, Red/Blue Team), manage JSON/TXT export preferences, and update credentials.",
        icon: Settings,
        preferredPlacement: "bottom",
        spotlightPadding: 6,
        borderRadius: 999,
      },
    ];
  }, [layout]);

  const currentStep = steps[stepIndex] || steps[0];

  // Helper to start the tour from beginning
  const startTour = useCallback(() => {
    setLayout(getLayoutMode());
    setStepIndex(0);
    setOpen(true);
  }, []);

  // Helper to finish/close the tour
  const finishTour = useCallback(() => {
    if (eventTimerRef.current) {
      clearTimeout(eventTimerRef.current);
      eventTimerRef.current = null;
    }
    setOpen(false);
    setTargetElement(null);
    setSpotlight(null);
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.setItem(SKIPPED_KEY, "true");
  }, []);

  // Auto-start for first-time visitors or on explicit replay event
  useEffect(() => {
    const handleReplayTour = () => {
      startTour();
    };

    window.addEventListener("start-app-tour", handleReplayTour);
    window.addEventListener("replay-app-tour", handleReplayTour);

    const completed = localStorage.getItem(STORAGE_KEY);
    const skipped = localStorage.getItem(SKIPPED_KEY);

    if (!completed && !skipped && !initialTriggerRef.current) {
      initialTriggerRef.current = true;
      const timer = setTimeout(() => {
        startTour();
      }, 700);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("start-app-tour", handleReplayTour);
        window.removeEventListener("replay-app-tour", handleReplayTour);
      };
    }

    return () => {
      window.removeEventListener("start-app-tour", handleReplayTour);
      window.removeEventListener("replay-app-tour", handleReplayTour);
    };
  }, [isDemo, startTour]);

  // Position calculation algorithm
  const updatePositions = useCallback(() => {
    if (!open) return;

    const currentMode = getLayoutMode();
    if (currentMode !== layout) {
      setLayout(currentMode);
    }

    const step = steps[stepIndex];
    if (!step) return;

    let el = findVisible(step.selector);
    if (!el && step.fallbackSelector) {
      el = findVisible(step.fallbackSelector);
    }

    if (!el) {
      // If target element is not found on this view, check fallback or skip gracefully
      setTargetElement(null);
      setSpotlight(null);
      return;
    }

    setTargetElement(el);

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = step.spotlightPadding ?? 8;
    const radius = step.borderRadius ?? 12;

    // Calculate spotlight cutout bounds with safe viewport clamping
    const rawX = rect.left - pad;
    const rawY = rect.top - pad;
    const rawW = rect.width + pad * 2;
    const rawH = rect.height + pad * 2;

    const spotX = Math.max(0, Math.min(rawX, vw));
    const spotY = Math.max(0, Math.min(rawY, vh));
    const spotW = Math.max(10, Math.min(rawW, vw - spotX));
    const spotH = Math.max(10, Math.min(rawH, vh - spotY));

    setSpotlight({
      x: Math.round(spotX),
      y: Math.round(spotY),
      width: Math.round(spotW),
      height: Math.round(spotH),
      radius,
    });

    // Auto-scroll target into view if partially off-screen (except full fixed sidebars/navs)
    const isOffscreen =
      rect.top < 60 ||
      rect.bottom > vh - 60 ||
      rect.left < 0 ||
      rect.right > vw;

    if (isOffscreen && step.key !== "sidebar-nav" && step.key !== "mobile-nav") {
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    // Calculate Tooltip Coordinates
    const isMobile = currentMode === "mobile";
    const tooltipWidth = isMobile
      ? Math.min(vw - TOOLTIP_MOBILE_WIDTH_OFFSET, 360)
      : TOOLTIP_DESKTOP_WIDTH;
    const estimatedHeight = 180;

    let finalTop = 0;
    let finalLeft = 0;
    let finalPlacement: "top" | "bottom" | "left" | "right" =
      step.preferredPlacement && step.preferredPlacement !== "auto"
        ? step.preferredPlacement
        : "bottom";
    let arrowOffset = 24;

    if (isMobile) {
      // On mobile, position centrally aligned either below or above the target
      finalLeft = Math.max(VIEWPORT_PADDING, (vw - tooltipWidth) / 2);
      const spaceBelow = vh - spotY - spotH;
      const spaceAbove = spotY;

      if (spaceBelow >= estimatedHeight + TOOLTIP_GAP + 20 || spaceBelow >= spaceAbove) {
        finalTop = spotY + spotH + TOOLTIP_GAP;
        finalPlacement = "bottom";
        // Clamp so it doesn't overflow bottom edge
        finalTop = Math.min(finalTop, vh - estimatedHeight - VIEWPORT_PADDING - 40);
      } else {
        finalTop = Math.max(VIEWPORT_PADDING, spotY - estimatedHeight - TOOLTIP_GAP);
        finalPlacement = "top";
      }

      arrowOffset = Math.max(20, Math.min(spotX + spotW / 2 - finalLeft, tooltipWidth - 20));
    } else {
      // Desktop positioning with smart collision fallback
      const targetCenterX = spotX + spotW / 2;
      const targetCenterY = spotY + spotH / 2;

      const spaceBelow = vh - (spotY + spotH);
      const spaceAbove = spotY;
      const spaceRight = vw - (spotX + spotW);
      const spaceLeft = spotX;

      if (step.preferredPlacement === "right" && spaceRight >= tooltipWidth + TOOLTIP_GAP) {
        finalPlacement = "right";
        finalLeft = spotX + spotW + TOOLTIP_GAP;
        finalTop = Math.max(VIEWPORT_PADDING, Math.min(targetCenterY - estimatedHeight / 2, vh - estimatedHeight - VIEWPORT_PADDING));
      } else if (step.preferredPlacement === "left" && spaceLeft >= tooltipWidth + TOOLTIP_GAP) {
        finalPlacement = "left";
        finalLeft = spotX - tooltipWidth - TOOLTIP_GAP;
        finalTop = Math.max(VIEWPORT_PADDING, Math.min(targetCenterY - estimatedHeight / 2, vh - estimatedHeight - VIEWPORT_PADDING));
      } else if (step.preferredPlacement === "top" && spaceAbove >= estimatedHeight + TOOLTIP_GAP) {
        finalPlacement = "top";
        finalTop = spotY - estimatedHeight - TOOLTIP_GAP;
        finalLeft = Math.max(VIEWPORT_PADDING, Math.min(targetCenterX - tooltipWidth / 2, vw - tooltipWidth - VIEWPORT_PADDING));
      } else if (spaceBelow >= estimatedHeight + TOOLTIP_GAP) {
        finalPlacement = "bottom";
        finalTop = spotY + spotH + TOOLTIP_GAP;
        finalLeft = Math.max(VIEWPORT_PADDING, Math.min(targetCenterX - tooltipWidth / 2, vw - tooltipWidth - VIEWPORT_PADDING));
      } else if (spaceAbove >= estimatedHeight + TOOLTIP_GAP) {
        finalPlacement = "top";
        finalTop = spotY - estimatedHeight - TOOLTIP_GAP;
        finalLeft = Math.max(VIEWPORT_PADDING, Math.min(targetCenterX - tooltipWidth / 2, vw - tooltipWidth - VIEWPORT_PADDING));
      } else {
        // Fallback inside safe viewport bounds
        finalPlacement = "bottom";
        finalTop = Math.max(VIEWPORT_PADDING, vh - estimatedHeight - VIEWPORT_PADDING - 20);
        finalLeft = Math.max(VIEWPORT_PADDING, Math.min(targetCenterX - tooltipWidth / 2, vw - tooltipWidth - VIEWPORT_PADDING));
      }

      arrowOffset = Math.max(20, Math.min(targetCenterX - finalLeft, tooltipWidth - 20));
    }

    setTooltipCoords({
      top: Math.round(finalTop),
      left: Math.round(finalLeft),
      placement: finalPlacement,
      arrowOffset: Math.round(arrowOffset),
    });
  }, [layout, open, prefersReducedMotion, stepIndex, steps]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finishTour();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (stepIndex < steps.length - 1) {
          setStepIndex((s) => s + 1);
        } else {
          finishTour();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((s) => Math.max(0, s - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finishTour, open, stepIndex, steps.length]);

  // Synchronize on step change, resize, scroll, or DOM mutations
  useEffect(() => {
    if (!open) return;

    let animFrame: number;
    const scheduleUpdate = () => {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(updatePositions);
    };

    scheduleUpdate();

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", scheduleUpdate, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleUpdate, { passive: true });

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
    });

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      observer.disconnect();
    };
  }, [open, stepIndex, location.pathname, updatePositions]);

  // Handle waiting for interactive event (like opening mobile drawer)
  useEffect(() => {
    if (!open) return;
    const current = steps[stepIndex];
    if (!current?.waitForEvent) return;

    const handleEvent = () => {
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      eventTimerRef.current = setTimeout(() => {
        setStepIndex((s) => Math.min(s + 1, steps.length - 1));
      }, 150);
    };

    window.addEventListener(current.waitForEvent, handleEvent);
    eventTimerRef.current = setTimeout(() => {
      setStepIndex((s) => Math.min(s + 1, steps.length - 1));
    }, current.waitTimeout ?? 5000);

    return () => {
      window.removeEventListener(current.waitForEvent!, handleEvent);
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      eventTimerRef.current = null;
    };
  }, [open, stepIndex, steps]);

  if (!open || !spotlight) return null;

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const StepIcon = currentStep.icon;

  return (
    <>
      {/* ----------------- 1. SPOTLIGHT MASK OVERLAY ----------------- */}
      <svg
        id="tour-spotlight-svg"
        className="fixed inset-0 w-full h-full pointer-events-none z-[1000] select-none"
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* Opaque white area covering the entire screen */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Transparent cutout shape over the highlighted target element */}
            <rect
              x={spotlight.x}
              y={spotlight.y}
              width={spotlight.width}
              height={spotlight.height}
              rx={spotlight.radius}
              ry={spotlight.radius}
              fill="black"
              style={{
                transition: prefersReducedMotion ? "none" : "all 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </mask>
        </defs>

        {/* Semi-transparent dark overlay */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(4, 9, 18, 0.76)"
          mask="url(#tour-spotlight-mask)"
          className="pointer-events-auto cursor-default"
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      </svg>

      {/* ----------------- 2. SPOTLIGHT HIGHLIGHT RING & GLOW ----------------- */}
      <div
        id="tour-spotlight-ring"
        className="fixed pointer-events-none z-[1001] rounded-lg"
        style={{
          top: spotlight.y,
          left: spotlight.x,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: `${spotlight.radius}px`,
          border: "2px solid rgba(34, 211, 238, 0.92)",
          boxShadow: "0 0 24px rgba(34, 211, 238, 0.35), inset 0 0 12px rgba(34, 211, 238, 0.15)",
          transition: prefersReducedMotion ? "none" : "all 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-hidden="true"
      >
        {/* Subtle pulsing indicator corner */}
        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary shadow-neon-cyan-sm" />
        </span>
      </div>

      {/* ----------------- 3. PREMIUM TOUR TOOLTIP / POPOVER ----------------- */}
      <div
        id="tour-tooltip-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`Product Tour: ${currentStep.title}`}
        className="fixed z-[1002] bg-card/95 backdrop-blur-xl border border-primary/40 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        style={{
          top: tooltipCoords.top,
          left: tooltipCoords.left,
          width: layout === "mobile" ? `calc(100vw - ${TOOLTIP_MOBILE_WIDTH_OFFSET}px)` : `${TOOLTIP_DESKTOP_WIDTH}px`,
          maxWidth: "400px",
          boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(34, 211, 238, 0.15)",
          transition: prefersReducedMotion ? "none" : "top 0.25s ease-out, left 0.25s ease-out",
        }}
      >
        {/* Subtle top glowing accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary/80" />

        <div className="p-4 sm:p-5">
          {/* Header with Step indicator, badges, and Close X */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/30 uppercase tracking-wider">
                Step {stepIndex + 1} of {steps.length}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                Interactive Tour
              </span>
            </div>

            <button
              id="tour-btn-close-x"
              type="button"
              onClick={finishTour}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer touch-manipulation"
              title="Close tour (Esc)"
              aria-label="Close tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title & Icon */}
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0 mt-0.5">
              <StepIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm sm:text-base leading-tight tracking-tight">
                {currentStep.title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Progress dots bar */}
          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                    idx === stepIndex
                      ? "w-5 bg-primary shadow-neon-cyan-sm"
                      : idx < stepIndex
                      ? "w-2 bg-primary/40"
                      : "w-2 bg-muted-foreground/30"
                  }`}
                  aria-label={`Jump to step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Keyboard shortcut hint (desktop only) */}
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 hidden sm:inline">
              <kbd className="px-1 py-0.5 rounded bg-muted/60 text-[9px] border border-border/60">Esc</kbd> skip • <kbd className="px-1 py-0.5 rounded bg-muted/60 text-[9px] border border-border/60">→</kbd> next
            </span>
          </div>

          {/* Action buttons footer */}
          <div className="flex items-center justify-between gap-2 mt-3.5">
            <button
              id="tour-btn-skip"
              type="button"
              onClick={finishTour}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline transition-colors px-2 py-1.5 rounded touch-manipulation cursor-pointer"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <Button
                  id="tour-btn-back"
                  variant="outline"
                  size="sm"
                  onClick={() => setStepIndex((s) => Math.max(0, s - 1))}
                  className="h-8 sm:h-9 px-3 text-xs gap-1 border-border/80 hover:border-primary/40 touch-manipulation"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Button>
              )}

              <Button
                id="tour-btn-next"
                size="sm"
                onClick={() => {
                  if (isLastStep) {
                    finishTour();
                  } else {
                    setStepIndex((s) => s + 1);
                  }
                }}
                className="h-8 sm:h-9 px-3.5 text-xs font-semibold gap-1.5 shadow-neon-cyan-sm touch-manipulation bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <span>{isLastStep ? "Finish Tour" : "Next"}</span>
                {isLastStep ? (
                  <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
