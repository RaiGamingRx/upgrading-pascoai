import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

interface NavGroup {
  title?: string;
  items: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    path: string;
    badge?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: Shield, label: "Vulnerability Scan", path: "/scanner" },
    ],
  },
  {
    title: "AUDIT & DEFENSE",
    items: [
      { icon: Globe, label: "Web Security", path: "/web-security" },
      { icon: MailCheck, label: "Email Security", path: "/email-security" },
    ],
  },
  {
    title: "SECURITY LABS",
    items: [
      { icon: Lock, label: "Crypto Lab", path: "/crypto" },
      { icon: Key, label: "Password Lab", path: "/password-lab" },
      { icon: Search, label: "Research Suite", path: "/research" },
      { icon: Beaker, label: "Simulations", path: "/simulations", badge: "22" },
    ],
  },
  {
    title: "SYSTEM",
    items: [{ icon: Settings, label: "Settings", path: "/settings" }],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
}

export function Sidebar({ isOpen, onToggle, isMobile }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {isMobile && (
        <div
          aria-hidden="true"
          className={cn(
            "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onToggle}
        />
      )}

      <aside
        data-tour="sidebar"
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border transition-all duration-300 ease-out flex flex-col select-none",
          isOpen ? "w-64" : "w-16",
          isMobile && !isOpen && "-translate-x-full"
        )}
      >
        {/* Desktop collapsed control lives in the header, never the footer. */}
        <div className="h-16 shrink-0 flex items-center justify-between px-3.5 border-b border-sidebar-border/80">
          {!isOpen ? (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggle}
              className="w-10 h-10 mx-auto text-muted-foreground hover:text-primary hover:bg-sidebar-accent"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Menu className="w-5 h-5" />
            </Button>
          ) : (
            <div className="flex items-center gap-2.5 animate-fade-in pl-1 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-primary via-primary/80 to-secondary flex items-center justify-center shadow-neon-cyan-sm">
                <Shield className="w-4.5 h-4.5 text-primary-foreground" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-base tracking-tight text-gradient-cyber leading-tight">
                  PascoAI
                </span>
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">
                  Cyber Defense OS
                </span>
              </div>
            </div>
          )}

          {isOpen && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggle}
              className="shrink-0 text-muted-foreground hover:text-primary hover:bg-sidebar-accent"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        <nav className="flex-1 min-h-0 py-3 px-2 space-y-4 overflow-y-auto scrollbar-thin">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {isOpen && group.title && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/60 font-mono uppercase">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={!isOpen ? item.label : undefined}
                    onClick={() => {
                      if (isMobile) onToggle();
                    }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group",
                      isActive
                        ? "bg-primary/15 text-primary font-semibold shadow-neon-cyan-subtle"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-foreground active:scale-[0.98] active:bg-sidebar-accent"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-gradient-to-b from-primary via-primary to-primary/60 shadow-neon-cyan-sm animate-nav-indicator" />
                    )}
                    <item.icon
                      className={cn(
                        "w-5 h-5 shrink-0 transition-all duration-200",
                        isActive
                          ? "text-primary scale-110"
                          : "text-muted-foreground group-hover:text-primary group-hover:scale-105"
                      )}
                    />
                    {isOpen && (
                      <span className="truncate flex-1 transition-colors duration-200">
                        {item.label}
                      </span>
                    )}
                    {isOpen && item.badge && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-primary/20 text-primary border border-primary/30 transition-all duration-200 group-hover:bg-primary/25 group-hover:shadow-neon-cyan-subtle">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border/80 shrink-0">
          <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">System Online</span>
            </span>
            <span className="text-[11px] font-mono text-muted-foreground/60">v2.4</span>
          </div>
        </div>
      </aside>
    </>
  );
}
