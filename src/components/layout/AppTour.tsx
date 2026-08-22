import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useLocation } from "react-router-dom";

type FocusMode = "full" | "exact" | "viewport";
type LayoutMode = "desktop" | "mobile";

interface TourStep {
  key: string;
  selector: string;
  title: string;
  text: string;
  focus: FocusMode;
  waitForEvent?: string;
  waitTimeout?: number;
}

interface TooltipPosition {
  top: number;
  left: number;
}

let activeTour = false;

const MOBILE_BREAKPOINT = 768;
const TOOLTIP_DESKTOP_WIDTH = 320;
const TOOLTIP_MOBILE_MAX_WIDTH = 340;
const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 12;
const TOOLTIP_ESTIMATED_HEIGHT = 150;

function isUsableElement(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisible(selector: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll(selector));
  return matches.find(isUsableElement) ?? null;
}

function getLayoutMode(): LayoutMode {
  // Prefer the actual visible mobile control over a hard-coded device/model check.
  if (findVisible("[data-tour='hamburger']")) return "mobile";
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
    ? "mobile"
    : "desktop";
}

export function AppTour() {
  const { isDemo } = useAuth();
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>(() =>
    typeof window === "undefined" ? "desktop" : getLayoutMode()
  );
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: 16, left: 16 });

  const startedRef = useRef(false);
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLayoutRef = useRef(layout);

  const steps = useMemo<TourStep[]>(
    () =>
      layout === "mobile"
        ? [
            {
              key: "hamburger",
              selector: "[data-tour='hamburger']",
              title: "Open Menu",
              text: "Tap here to open the navigation menu.",
              focus: "exact",
              waitForEvent: "tour:menu-opened",
              waitTimeout: 5000,
            },
            {
              key: "sidebar",
              selector: "[data-tour='sidebar']",
              title: "Navigation",
              text: "Use the menu to access all security tools.",
              focus: "full",
            },
            {
              key: "topbar",
              selector: "[data-tour='topbar']",
              title: "Top Bar",
              text: "Profile, demo mode, and quick actions live here.",
              focus: "exact",
            },
            {
              key: "dashboard",
              selector: "[data-tour='dashboard']",
              title: "Dashboard",
              text: "Your security overview and recent activity.",
              focus: "viewport",
            },
          ]
        : [
            {
              key: "sidebar",
              selector: "[data-tour='sidebar']",
              title: "Navigation",
              text: "Use the sidebar to access all security tools.",
              focus: "full",
            },
            {
              key: "topbar",
              selector: "[data-tour='topbar']",
              title: "Quick Access",
              text: "Profile, demo mode, and quick actions live here.",
              focus: "exact",
            },
            {
              key: "dashboard",
              selector: "[data-tour='dashboard']",
              title: "Dashboard",
              text: "Your security overview and recent activity.",
              focus: "viewport",
            },
          ],
    [layout]
  );

  const clearTimers = useCallback(() => {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    if (repositionTimerRef.current) clearTimeout(repositionTimerRef.current);
    eventTimerRef.current = null;
    repositionTimerRef.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setOpen(false);
    setTarget(null);
    activeTour = false;
    localStorage.setItem("pasco_tour_skipped", "true");
  }, [clearTimers]);

  const getViewport = useCallback(() => {
    const vv = window.visualViewport;
    return {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      // Fixed-position elements and getBoundingClientRect() are already expressed
      // in visual-viewport coordinates on modern mobile browsers. Do not add
      // visualViewport.offsetTop/offsetLeft to fixed CSS positions.
    };
  }, []);

  const updateLayout = useCallback(() => {
    const next = getLayoutMode();
    if (next !== lastLayoutRef.current) {
      lastLayoutRef.current = next;
      setLayout(next);
      setStep(0);
    }
  }, []);

  const resolveTarget = useCallback(() => {
    const current = steps[step];
    if (!current) return null;
    return findVisible(current.selector);
  }, [step, steps]);

  const positionTooltip = useCallback(
    (el: HTMLElement) => {
      const viewport = getViewport();
      const mobile = layout === "mobile";
      const width = mobile
        ? Math.min(TOOLTIP_MOBILE_MAX_WIDTH, Math.max(240, viewport.width - VIEWPORT_PADDING * 2))
        : TOOLTIP_DESKTOP_WIDTH;
      const rect = el.getBoundingClientRect();
      const tooltipHeight = mobile
        ? Math.min(190, Math.max(130, viewport.height * 0.35))
        : TOOLTIP_ESTIMATED_HEIGHT;

      const maxLeft = Math.max(VIEWPORT_PADDING, viewport.width - width - VIEWPORT_PADDING);
      const left = Math.min(maxLeft, Math.max(VIEWPORT_PADDING, rect.left));
      const below = rect.bottom + TOOLTIP_GAP;
      const above = rect.top - TOOLTIP_GAP - tooltipHeight;
      const safeTop = VIEWPORT_PADDING;
      const safeBottom = viewport.height - VIEWPORT_PADDING;

      let top: number;
      if (below + tooltipHeight <= safeBottom) {
        top = below;
      } else if (above >= safeTop) {
        top = above;
      } else {
        top = Math.max(safeTop, safeBottom - tooltipHeight);
      }

      setTooltipPos({ top: Math.round(top), left: Math.round(left) });
    },
    [getViewport, layout]
  );

  const recalculate = useCallback(() => {
    if (!open) return;
    updateLayout();
    const el = resolveTarget();
    setTarget(el);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const viewport = getViewport();
    const visible =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= viewport.height &&
      rect.right <= viewport.width;

    // Never scroll a fixed/mobile hamburger just because the browser chrome moved.
    if (!visible && !(layout === "mobile" && steps[step]?.key === "hamburger")) {
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    positionTooltip(el);
  }, [layout, open, positionTooltip, prefersReducedMotion, resolveTarget, steps, step, updateLayout, getViewport]);

  useEffect(() => {
    if (activeTour) return;
    const skipped = localStorage.getItem("pasco_tour_skipped");
    if ((isDemo || !skipped) && !startedRef.current) {
      startedRef.current = true;
      activeTour = true;
      setLayout(getLayoutMode());
      setStep(0);
      setOpen(true);
    }
  }, [isDemo]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStep((current) => Math.max(0, current - 1));
      } else if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setStep((current) => (current >= steps.length - 1 ? current : current + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, open, steps.length]);

  useEffect(() => {
    if (!open) return;
    const current = steps[step];
    if (!current?.waitForEvent) return;

    const onEvent = () => {
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      eventTimerRef.current = setTimeout(() => setStep((value) => Math.min(value + 1, steps.length - 1)), 200);
    };

    window.addEventListener(current.waitForEvent, onEvent);
    eventTimerRef.current = setTimeout(() => {
      setStep((value) => Math.min(value + 1, steps.length - 1));
    }, current.waitTimeout ?? 5000);

    return () => {
      window.removeEventListener(current.waitForEvent!, onEvent);
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      eventTimerRef.current = null;
    };
  }, [open, step, steps]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => recalculate());
    };

    const onResize = () => {
      updateLayout();
      schedule();
    };
    const onScroll = () => schedule();

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });

    schedule();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [open, recalculate, updateLayout]);

  useEffect(() => {
    if (!open) return;
    recalculate();
  }, [open, step, location.pathname, recalculate]);

  useEffect(() => () => {
    clearTimers();
    activeTour = false;
  }, [clearTimers]);

  if (!open || !target) return null;

  const current = steps[step];
  if (!current) return null;

  const viewport = getViewport();
  const rect = target.getBoundingClientRect();
  const isFull = current.focus === "full";
  const topbar = findVisible("[data-tour='topbar']");
  const focusTop = isFull
    ? 0
    : current.focus === "viewport"
      ? (topbar?.getBoundingClientRect().bottom ?? 56) + 12
      : rect.top;
  const focusHeight = isFull
    ? viewport.height
    : current.focus === "viewport"
      ? Math.max(0, viewport.height - focusTop - 12)
      : rect.height;
  const focusLeft = current.focus === "full" || current.focus === "viewport" ? 0 : rect.left;
  const focusWidth = current.focus === "full" || current.focus === "viewport" ? viewport.width : rect.width;
  const tooltipWidth = layout === "mobile"
    ? Math.min(TOOLTIP_MOBILE_MAX_WIDTH, Math.max(240, viewport.width - VIEWPORT_PADDING * 2))
    : TOOLTIP_DESKTOP_WIDTH;

  const overlayStyle = (extra: React.CSSProperties = {}) => ({
    position: "fixed" as const,
    zIndex: 1000,
    background: "rgba(0,0,0,.70)",
    pointerEvents: "auto" as const,
    ...extra,
  });

  return (
    <>
      <div className="fixed inset-0 z-[1000] pointer-events-none" aria-hidden="true">
        <div style={overlayStyle({ left: 0, top: 0, width: "100%", height: Math.max(0, focusTop) })} />
        <div style={overlayStyle({ left: 0, top: focusTop + focusHeight, width: "100%", bottom: 0 })} />
        <div style={overlayStyle({ left: 0, top: focusTop, width: Math.max(0, focusLeft), height: focusHeight })} />
        <div style={overlayStyle({ left: focusLeft + focusWidth, top: focusTop, right: 0, height: focusHeight })} />
      </div>

      <div
        className="fixed z-[1001] pointer-events-none rounded-lg"
        style={{
          top: focusTop - 4,
          left: focusLeft - 4,
          width: focusWidth + 8,
          height: focusHeight + 8,
          outline: "2px solid rgba(34,211,238,.95)",
          boxShadow: "0 0 30px rgba(34,211,238,.30)",
          transition: prefersReducedMotion ? "none" : "all .25s ease-out",
        }}
        aria-hidden="true"
      />

      <div
        className="fixed z-[1002] bg-card border border-border rounded-xl shadow-xl"
        style={{
          top: tooltipPos.top,
          left: Math.max(VIEWPORT_PADDING, Math.min(tooltipPos.left, viewport.width - tooltipWidth - VIEWPORT_PADDING)),
          width: tooltipWidth,
          maxHeight: layout === "mobile" ? "min(35vh, 220px)" : "50vh",
          overflowY: "auto",
          overflowX: "hidden",
          padding: "1rem",
          paddingBottom: layout === "mobile" ? "max(1rem, calc(1rem + env(safe-area-inset-bottom)))" : "1rem",
          transition: prefersReducedMotion ? "none" : "all .25s ease-out",
          boxSizing: "border-box",
        }}
        role="dialog"
        aria-label="Tour step"
        aria-live="polite"
      >
        <div className="text-xs font-mono text-muted-foreground mb-2">
          Step {step + 1} of {steps.length}
        </div>
        <h3 className="font-semibold text-foreground text-sm">{current.title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">{current.text}</p>

        <div className="flex items-center justify-between mt-4 gap-2">
          <button
            type="button"
            onClick={finish}
            className="min-h-11 px-2 text-xs sm:text-sm font-semibold text-red-500 hover:underline cursor-pointer touch-manipulation"
            aria-label="Skip tour"
          >
            Skip
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((value) => value - 1)}
                className="min-h-11 min-w-11 touch-manipulation"
                aria-label="Previous step"
              >
                Back
              </Button>
            )}

            {!current.waitForEvent && (
              <Button
                size="sm"
                onClick={() => step >= steps.length - 1 ? finish() : setStep((value) => value + 1)}
                className="min-h-11 min-w-11 touch-manipulation"
                aria-label={step >= steps.length - 1 ? "Finish tour" : "Next step"}
              >
                {step >= steps.length - 1 ? "Finish" : "Next"}
              </Button>
            )}

            {current.waitForEvent && (
              <span className="min-h-11 flex items-center text-xs text-muted-foreground italic">
                Waiting…
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
