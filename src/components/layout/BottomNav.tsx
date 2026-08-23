import React, { useMemo, useState, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Shield,
  Search,
  Beaker,
  MoreHorizontal,
  Globe,
  MailCheck,
  Lock,
  Key,
  Settings,
  X,
  Compass,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  badge?: string;
}

interface DrawerNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  path: string;
  badge?: string;
}

interface DrawerNavGroup {
  title: string;
  items: DrawerNavItem[];
}

const quickNavItems: QuickNavItem[] = [
  { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
  { icon: Shield, label: "Scanner", path: "/scanner" },
  { icon: Search, label: "Research", path: "/research" },
  { icon: Beaker, label: "Labs", path: "/simulations", badge: "22" },
];

const drawerGroups: DrawerNavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      {
        icon: LayoutDashboard,
        label: "Dashboard",
        subtitle: "Mission Control",
        path: "/dashboard",
      },
      {
        icon: Shield,
        label: "Vulnerability Scan",
        subtitle: "Active Surface Defense",
        path: "/scanner",
      },
    ],
  },
  {
    title: "AUDIT & DEFENSE",
    items: [
      {
        icon: Globe,
        label: "Web Security",
        subtitle: "HTTP & TLS Posture",
        path: "/web-security",
      },
      {
        icon: MailCheck,
        label: "Email Security",
        subtitle: "SPF, DKIM, DMARC",
        path: "/email-security",
      },
    ],
  },
  {
    title: "SECURITY LABS",
    items: [
      {
        icon: Lock,
        label: "Crypto Lab",
        subtitle: "Cipher & Hash Tools",
        path: "/crypto",
      },
      {
        icon: Key,
        label: "Password Lab",
        subtitle: "Entropy & Strength",
        path: "/password-lab",
      },
      {
        icon: Search,
        label: "Research Suite",
        subtitle: "Threat Intelligence",
        path: "/research",
      },
      {
        icon: Beaker,
        label: "Simulations",
        subtitle: "Interactive Attack Labs",
        path: "/simulations",
        badge: "22",
      },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      {
        icon: Settings,
        label: "Settings",
        subtitle: "Preferences & API Keys",
        path: "/settings",
      },
    ],
  },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  // Close drawer on path navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Synchronize with AppTour menu events
  useEffect(() => {
    const handleTourOpen = () => {
      setDrawerOpen(true);
      setTimeout(() => {
        window.dispatchEvent(new Event("tour:menu-opened"));
      }, 120);
    };
    const handleTourClose = () => {
      setDrawerOpen(false);
    };

    window.addEventListener("tour:open-menu", handleTourOpen);
    window.addEventListener("tour:close-menu", handleTourClose);
    return () => {
      window.removeEventListener("tour:open-menu", handleTourOpen);
      window.removeEventListener("tour:close-menu", handleTourClose);
    };
  }, []);

  // Modal Hardening: Body Scroll Lock and Focus Management
  useEffect(() => {
    if (drawerOpen) {
      // Save previously focused element
      lastFocusedElementRef.current = document.activeElement as HTMLElement | null;

      // Lock document body scroll on touch and desktop
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";

      // Move focus into the modal
      const focusTimer = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        } else if (drawerRef.current) {
          drawerRef.current.focus();
        }
      }, 50);

      return () => {
        clearTimeout(focusTimer);
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;

        // Restore focus to trigger or previous element
        if (
          lastFocusedElementRef.current &&
          typeof lastFocusedElementRef.current.focus === "function"
        ) {
          lastFocusedElementRef.current.focus();
        }
      };
    }
  }, [drawerOpen]);

  // Handle Escape dismissal and Tab key focus trapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!drawerOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerOpen(false);
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  // Find active index among the 5 bottom dock slots (0: Home, 1: Scanner, 2: Research, 3: Labs, 4: More)
  const activeQuickIndex = useMemo(() => {
    if (drawerOpen) return 4; // More slot is active when drawer is opened

    const idx = quickNavItems.findIndex(
      (item) =>
        location.pathname === item.path ||
        (item.path !== "/dashboard" && location.pathname.startsWith(item.path))
    );

    // If on a secondary route like /web-security or /crypto, highlight the MORE capsule
    if (idx === -1) {
      return 4; // Highlight 'More'
    }
    return idx;
  }, [location.pathname, drawerOpen]);

  const toggleDrawer = () => {
    setDrawerOpen((prev) => !prev);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <>
      {/* ── Full Mobile Command Drawer Modal / Sheet (Level 2 Hierarchy) ── */}
      {drawerOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={closeDrawer}
          className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      )}

      <div
        ref={drawerRef}
        id="mobile-command-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-command-drawer-title"
        aria-describedby="mobile-command-drawer-desc"
        aria-hidden={!drawerOpen}
        tabIndex={-1}
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] flex flex-col select-none outline-none",
          "bg-[#090d16]/98 backdrop-blur-2xl border-t border-white/[0.12] rounded-t-3xl shadow-2xl shadow-black",
          "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          drawerOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
        )}
      >
        <p id="mobile-command-drawer-desc" className="sr-only">
          Full PascoAI module navigation for operations, security audits, cryptographic labs, and platform settings.
        </p>

        {/* Drawer Grab Bar & Header */}
        <div className="shrink-0 pt-3 pb-2 px-5 border-b border-white/[0.06] flex flex-col items-center">
          <div className="w-10 h-1 rounded-full bg-white/20 mb-3" />
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#121927] to-[#0d1320] flex items-center justify-center border border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex flex-col">
                <h2
                  id="mobile-command-drawer-title"
                  className="font-bold text-sm font-mono tracking-wider text-foreground uppercase"
                >
                  PASCOAI COMMAND
                </h2>
                <span className="text-[9px] text-muted-foreground/80 font-mono tracking-widest uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                  DEFENSE OS // ALL MODULES
                </span>
              </div>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={closeDrawer}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
              aria-label="Close command drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Groups & Items */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 pb-[calc(env(safe-area-inset-bottom,16px)+20px)]">
          {drawerGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1.5">
              <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                <span className="text-[10px] font-mono font-semibold tracking-widest text-muted-foreground/60 uppercase">
                  {group.title}
                </span>
                <span className="w-12 h-[1px] bg-gradient-to-r from-white/[0.08] to-transparent" />
              </div>

              <div className="grid grid-cols-1 gap-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        navigate(item.path);
                        closeDrawer();
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left touch-manipulation cursor-pointer",
                        "mobile-touch-press border transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
                        isActive
                          ? "bg-gradient-to-r from-cyan-500/[0.14] via-cyan-500/[0.05] to-transparent border-cyan-500/30 text-foreground"
                          : "bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04] text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all",
                            isActive
                              ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                              : "bg-white/[0.04] border-white/[0.06] text-muted-foreground"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={cn(
                              "text-[13px] font-medium tracking-tight truncate",
                              isActive ? "text-foreground font-semibold" : "text-foreground/90"
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 font-mono truncate">
                            {item.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 transition-transform",
                            isActive ? "text-cyan-400 translate-x-0.5" : "text-muted-foreground/40"
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Tour Launcher inside Mobile Drawer */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                window.dispatchEvent(new Event("start-app-tour"));
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 mobile-touch-press cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
            >
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4" />
                <span className="text-xs font-semibold tracking-wide">Interactive Tour</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Guide
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Level 1: Mobile Quick Command Dock ── */}
      <div
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pointer-events-none",
          "pb-[max(env(safe-area-inset-bottom,0px),10px)]"
        )}
      >
        <nav
          aria-label="PascoAI Mobile Command Dock"
          className={cn(
            "pointer-events-auto relative w-full max-w-[420px] h-[58px] rounded-2xl",
            "mobile-dock-surface flex items-center justify-around px-1.5 select-none overflow-hidden"
          )}
        >
          {/* Subtle Cyber Top Highlight Hairline */}
          <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none" />

          {/* Dynamic Active Capsule Indicator (Calculated smoothly across 5 slots) */}
          <div
            aria-hidden="true"
            className="mobile-capsule-indicator absolute top-1.5 bottom-1.5 rounded-xl bg-gradient-to-b from-cyan-500/[0.16] via-cyan-500/[0.08] to-transparent border border-cyan-500/35 shadow-[0_0_12px_rgba(34,211,238,0.15)] pointer-events-none"
            style={{
              width: "calc((100% - 12px) / 5)",
              transform: `translateX(calc(${activeQuickIndex} * 100%))`,
              left: "6px",
            }}
          >
            {/* Top Micro Glowing Notch */}
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
          </div>

          {/* Primary Quick Navigation Slots (Home, Scanner, Research, Labs) */}
          {quickNavItems.map((item, index) => {
            const isActive = activeQuickIndex === index;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-1 rounded-xl touch-manipulation cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
                  "mobile-touch-press min-h-[44px] transition-colors duration-150",
                  isActive
                    ? "text-cyan-400 font-semibold"
                    : "text-muted-foreground/80 hover:text-foreground active:text-cyan-400"
                )}
              >
                <div className="relative flex items-center justify-center">
                  <item.icon
                    className={cn(
                      "w-[18px] h-[18px] transition-all duration-200",
                      isActive
                        ? "text-cyan-400 scale-105 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                        : "text-muted-foreground/80"
                    )}
                  />
                  {item.badge && (
                    <span
                      className={cn(
                        "absolute -top-1 -right-2.5 px-1 py-0.2 min-w-[14px] text-center text-[8.5px] font-mono font-bold rounded-full transition-all",
                        isActive
                          ? "bg-cyan-400 text-[#090d16] font-extrabold shadow-[0_0_6px_rgba(34,211,238,0.7)]"
                          : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "mt-0.5 text-[9.5px] font-mono tracking-tight leading-none transition-colors",
                    isActive ? "text-foreground font-semibold" : "text-muted-foreground/70"
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}

          {/* 5th Slot: MORE / Command Drawer Trigger */}
          <button
            ref={triggerBtnRef}
            type="button"
            onClick={toggleDrawer}
            aria-expanded={drawerOpen}
            aria-controls="mobile-command-drawer"
            aria-haspopup="dialog"
            data-tour="bottom-nav-more"
            className={cn(
              "relative z-10 flex flex-col items-center justify-center flex-1 h-full py-1 rounded-xl touch-manipulation cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400",
              "mobile-touch-press min-h-[44px] transition-colors duration-150",
              drawerOpen || activeQuickIndex === 4
                ? "text-cyan-400 font-semibold"
                : "text-muted-foreground/80 hover:text-foreground active:text-cyan-400"
            )}
          >
            <div className="relative flex items-center justify-center">
              <MoreHorizontal
                className={cn(
                  "w-[18px] h-[18px] transition-all duration-200",
                  drawerOpen || activeQuickIndex === 4
                    ? "text-cyan-400 scale-105 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                    : "text-muted-foreground/80"
                )}
              />
            </div>
            <span
              className={cn(
                "mt-0.5 text-[9.5px] font-mono tracking-tight leading-none transition-colors",
                drawerOpen || activeQuickIndex === 4
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground/70"
              )}
            >
              More
            </span>
          </button>
        </nav>
      </div>
    </>
  );
}
