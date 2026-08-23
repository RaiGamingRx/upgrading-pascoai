import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Shield,
  Globe,
  MailCheck,
  Lock,
  Key,
  Search,
  Beaker,
  Settings,
  ChevronLeft,
  Menu,
  Compass,
  Sparkles,
} from "lucide-react";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  path: string;
  badge?: string;
  shortcut?: string;
  iconClass?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      {
        icon: LayoutDashboard,
        label: "Dashboard",
        subtitle: "Mission Control",
        path: "/dashboard",
        shortcut: "1",
      },
      {
        icon: Shield,
        label: "Vulnerability Scan",
        subtitle: "Active Surface Defense",
        path: "/scanner",
        shortcut: "2",
        iconClass: "group-hover/item:drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]",
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
        shortcut: "3",
      },
      {
        icon: MailCheck,
        label: "Email Security",
        subtitle: "SPF, DKIM, DMARC",
        path: "/email-security",
        shortcut: "4",
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
        shortcut: "5",
      },
      {
        icon: Key,
        label: "Password Lab",
        subtitle: "Entropy & Strength",
        path: "/password-lab",
        shortcut: "6",
      },
      {
        icon: Search,
        label: "Research Suite",
        subtitle: "Threat Intelligence",
        path: "/research",
        shortcut: "7",
        iconClass: "group-hover/item:drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]",
      },
      {
        icon: Beaker,
        label: "Simulations",
        subtitle: "Interactive Attack Labs",
        path: "/simulations",
        badge: "22",
        shortcut: "8",
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
        shortcut: "9",
        iconClass: "group-hover/item:rotate-[10deg] transition-transform duration-300",
      },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

export function Sidebar({ isOpen, onToggle, isMobile }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  // Mouse radial subtle lighting coordinates (desktop fine pointer only)
  const [mousePos, setMousePos] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Track cursor position for subtle ambient spotlight
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!sidebarRef.current) return;
    const rect = sidebarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y, active: true });

    sidebarRef.current.style.setProperty("--mouse-x", `${x}px`);
    sidebarRef.current.style.setProperty("--mouse-y", `${y}px`);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos((prev) => ({ ...prev, active: false }));
  }, []);

  // Flattened items for shortcut indexing and index calculations
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), []);

  // Alt + number keyboard navigation (Alt+1 to Alt+9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.altKey && e.key >= "1" && e.key <= "9") {
        const num = parseInt(e.key, 10);
        const target = allItems[num - 1];
        if (target) {
          e.preventDefault();
          navigate(target.path);
          if (isMobile && isOpen) onToggle();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allItems, isMobile, isOpen, navigate, onToggle]);

  return (
    <TooltipProvider delayDuration={120}>
      {/* Mobile backdrop drawer blur overlay with smooth physical fade */}
      {isMobile && (
        <div
          aria-hidden="true"
          className={cn(
            "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onToggle}
        />
      )}

      <aside
        ref={sidebarRef}
        id="app-main-sidebar"
        data-tour="sidebar"
        aria-label="Main Navigation"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed top-0 left-0 z-50 h-full flex flex-col select-none overflow-hidden group/sidebar",
          "bg-[#090d16]/95 backdrop-blur-2xl border-r border-white/[0.08]",
          "sidebar-smooth-transition shadow-2xl shadow-black/80",
          isOpen ? "w-64" : "w-16",
          isMobile && !isOpen && "-translate-x-full"
        )}
      >
        {/* Soft Ambient Spotlight (Desktop only, ~2% cyan restraint) */}
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 ease-out hidden md:block"
          style={{
            opacity: mousePos.active ? 0.75 : 0,
            background: `radial-gradient(280px circle at ${mousePos.x}px ${mousePos.y}px, rgba(34, 211, 238, 0.05), rgba(59, 130, 246, 0.02) 45%, transparent 80%)`,
          }}
        />

        {/* Subtle Right-Edge Tactical Accent Line */}
        <div className="pointer-events-none absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-cyan-500/25 to-transparent opacity-40 group-hover/sidebar:opacity-80 transition-opacity duration-500" />

        {/* Brand Header */}
        <div className="relative z-10 h-16 shrink-0 flex items-center justify-between px-3 border-b border-white/[0.06] bg-black/20 backdrop-blur-md overflow-hidden">
          {!isOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={onToggle}
                  aria-expanded={false}
                  className="w-10 h-10 mx-auto text-muted-foreground/80 hover:text-cyan-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] sidebar-item-transition active:scale-95 cursor-pointer touch-manipulation"
                  aria-label="Expand sidebar"
                >
                  <Menu className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={14}
                className="command-tooltip-animate bg-[#0b101b]/95 backdrop-blur-md text-foreground border-white/10 text-xs font-sans shadow-2xl shadow-black/80 p-2.5 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              >
                <div className="font-semibold text-foreground tracking-wide">Expand Sidebar</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Toggle: ⌘B / Ctrl+B</div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 pl-1 min-w-0">
              {/* Brand Icon with subtle halo and breathing glow */}
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#121927] to-[#0d1320] flex items-center justify-center border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.15)] sidebar-brand-breath">
                  <Shield className="w-4 h-4 text-cyan-400" />
                </div>
              </div>

              {/* Brand Typography & Operational Status with smooth sequenced reveal */}
              <div
                className={cn(
                  "flex flex-col min-w-0 sidebar-nav-entry",
                  isOpen
                    ? "opacity-100 translate-x-0 transition-all duration-200 delay-[60ms]"
                    : "opacity-0 -translate-x-2 transition-all duration-100"
                )}
              >
                <span className="font-bold text-sm tracking-wider text-foreground font-mono uppercase leading-tight">
                  PASCOAI
                </span>
                <span className="text-[9px] text-muted-foreground/80 font-mono tracking-widest uppercase truncate flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                  DEFENSE OS // ONLINE
                </span>
              </div>
            </div>
          )}

          {isOpen && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggle}
              aria-expanded={true}
              className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border border-transparent sidebar-item-transition active:scale-95 cursor-pointer touch-manipulation"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4 transition-transform duration-200 hover:-translate-x-0.5" />
            </Button>
          )}
        </div>

        {/* Navigation Group Items */}
        <nav
          aria-label="Sidebar Menu"
          className="relative z-10 flex-1 min-h-0 py-3 px-2 space-y-4 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20"
        >
          {navGroups.map((group, gIdx) => {
            // Calculate base stagger delay offset for group
            const groupBaseDelay = 80 + gIdx * 30;

            return (
              <div key={gIdx} className="space-y-1">
                {/* Section Header & Subtle Tactical Divider */}
                {isOpen ? (
                  <div
                    className={cn(
                      "flex items-center justify-between px-3 pt-2 pb-1 sidebar-nav-entry",
                      isOpen
                        ? "opacity-100 translate-x-0 transition-all duration-200"
                        : "opacity-0 -translate-x-2 transition-all duration-100"
                    )}
                    style={{ transitionDelay: isOpen ? `${groupBaseDelay}ms` : "0ms" }}
                  >
                    <p className="text-[9.5px] font-semibold tracking-widest text-muted-foreground/50 font-mono uppercase whitespace-nowrap overflow-hidden text-ellipsis">
                      {group.title}
                    </p>
                    <span className="w-6 h-[1px] bg-gradient-to-r from-white/[0.08] to-transparent" />
                  </div>
                ) : (
                  gIdx > 0 && <div className="my-2 mx-3 h-[1px] bg-white/[0.06]" />
                )}

                {group.items.map((item, iIdx) => {
                  const isActive = location.pathname === item.path;
                  const itemIndex = allItems.findIndex((x) => x.path === item.path);
                  const itemDelay = 100 + itemIndex * 15;

                  const navLinkContent = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        if (isMobile) onToggle();
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-lg text-sm relative group/item focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50 cursor-pointer touch-manipulation",
                        "sidebar-item-transition sidebar-item-glow",
                        isOpen
                          ? "px-3 py-2 w-full"
                          : "justify-center px-0 w-10 h-10 mx-auto",
                        isActive
                          ? "bg-gradient-to-r from-cyan-500/[0.12] via-cyan-500/[0.04] to-transparent text-foreground font-medium border border-cyan-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] active:scale-[0.98] border border-transparent"
                      )}
                    >
                      {/* 2px Vertical Energy Rail on Active State with smooth continuous presence */}
                      {isActive && isOpen && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-nav-indicator" />
                      )}

                      {/* Active Route Collapsed Pill Accent */}
                      {isActive && !isOpen && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      )}

                      {/* Nav Icon with Controlled Glow & Meaningful Micro-interaction */}
                      <div className="relative shrink-0 flex items-center justify-center">
                        <item.icon
                          className={cn(
                            "w-4.5 h-4.5 sidebar-item-transition",
                            isActive
                              ? "text-cyan-400 scale-105 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]"
                              : "text-muted-foreground/80 group-hover/item:text-foreground group-hover/item:translate-x-0.5 group-hover/item:scale-[1.03]",
                            item.iconClass
                          )}
                        />
                      </div>

                      {/* Navigation Label with Staggered Sequence Reveal */}
                      {isOpen && (
                        <span
                          className={cn(
                            "truncate flex-1 text-[13px] tracking-tight sidebar-nav-entry transition-colors duration-150",
                            isOpen
                              ? "opacity-100 translate-x-0 transition-all duration-200"
                              : "opacity-0 -translate-x-2 transition-all duration-100"
                          )}
                          style={{ transitionDelay: isOpen ? `${itemDelay}ms` : "0ms" }}
                        >
                          {item.label}
                        </span>
                      )}

                      {/* Numeric Simulation Counter Badge */}
                      {isOpen && item.badge && (
                        <span
                          className={cn(
                            "px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 sidebar-item-transition group-hover/item:bg-cyan-500/25",
                            isOpen ? "opacity-100 transition-opacity duration-200" : "opacity-0"
                          )}
                          style={{ transitionDelay: isOpen ? `${itemDelay + 20}ms` : "0ms" }}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Subtle Hotkey Cue on Hover */}
                      {isOpen && !item.badge && item.shortcut && (
                        <span className="text-[9.5px] font-mono text-muted-foreground/40 group-hover/item:text-cyan-400/80 opacity-0 group-hover/item:opacity-100 sidebar-item-transition">
                          ⌥{item.shortcut}
                        </span>
                      )}
                    </NavLink>
                  );

                  if (!isOpen && mounted) {
                    return (
                      <Tooltip key={item.path}>
                        <TooltipTrigger asChild>
                          {navLinkContent}
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          sideOffset={14}
                          className="command-tooltip-animate bg-[#0b101b]/95 backdrop-blur-md text-foreground border-white/10 shadow-2xl shadow-black/80 p-2.5 min-w-[150px] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-xs text-foreground tracking-wide">
                              {item.label.toUpperCase()}
                            </span>
                            {item.shortcut && (
                              <span className="text-[9.5px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.2 rounded">
                                ALT+{item.shortcut}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 flex items-center justify-between">
                            <span>{item.subtitle || group.title}</span>
                            {item.badge && (
                              <span className="text-cyan-400 font-bold ml-2">
                                [{item.badge}]
                              </span>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return navLinkContent;
                })}
              </div>
            );
          })}
        </nav>

        {/* Dedicated Utilities Footer Panel */}
        <div className="relative z-10 p-3 border-t border-white/[0.06] shrink-0 space-y-2 bg-black/20 backdrop-blur-md overflow-hidden">
          {/* App Tour Interactive Launcher */}
          {!isOpen && mounted ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (isMobile) onToggle();
                    window.dispatchEvent(new Event("start-app-tour"));
                  }}
                  className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/25 hover:border-cyan-500/50 sidebar-item-transition cursor-pointer touch-manipulation active:scale-95 shadow-xs group"
                  aria-label="Start Product Tour"
                >
                  <Compass className="w-4 h-4 text-cyan-400 shrink-0 group-hover:rotate-45 transition-transform duration-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={14}
                className="command-tooltip-animate bg-[#0b101b]/95 backdrop-blur-md text-foreground border-white/10 text-xs shadow-2xl p-2.5 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              >
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-cyan-400" /> Interactive App Tour
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Quick walkthrough guide</div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isMobile) onToggle();
                window.dispatchEvent(new Event("start-app-tour"));
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 sidebar-item-transition cursor-pointer touch-manipulation active:scale-[0.98] group"
              aria-label="Start Product Tour"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Compass className="w-4 h-4 text-cyan-400 shrink-0 group-hover:rotate-45 transition-transform duration-300" />
                <span className="truncate font-medium tracking-wide">App Tour</span>
              </div>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 uppercase shrink-0 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Guide
              </span>
            </button>
          )}

          {/* Guard Telemetry Status */}
          {isOpen ? (
            <div
              className={cn(
                "flex items-center justify-between px-2 pt-1 text-xs text-muted-foreground sidebar-nav-entry",
                isOpen
                  ? "opacity-100 translate-x-0 transition-all duration-200 delay-[220ms]"
                  : "opacity-0 -translate-x-2 transition-all duration-100"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 sidebar-guard-pulse">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                </span>
                <span className="font-mono text-[11px] font-medium text-foreground tracking-tight">
                  GUARD ONLINE
                </span>
              </span>
              <span className="text-[9.5px] font-mono text-muted-foreground/70 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                v2.4 LTS
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="relative flex h-2.5 w-2.5 cursor-help py-1 sidebar-guard-pulse">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={14}
                  className="command-tooltip-animate bg-[#0b101b]/95 backdrop-blur-md text-foreground border-white/10 text-xs font-mono p-2 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                >
                  <div className="text-emerald-400 font-semibold">● GUARD ONLINE</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">Telemetry Daemon v2.4 LTS</div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
