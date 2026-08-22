import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Shield,
  Search,
  Beaker,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Shield, label: "Scanner", path: "/scanner" },
  { icon: Search, label: "Research", path: "/research" },
  { icon: Beaker, label: "Labs", path: "/simulations" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border/80 px-2 py-1.5 flex items-center justify-around shadow-lg pb-safe"
    >
      {mobileNavItems.map((item) => {
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[56px] min-h-[46px] py-1 px-2 rounded-xl transition-all duration-200 text-[11px] font-medium relative active:scale-95 touch-manipulation select-none",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground active:text-primary"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary shadow-neon-cyan-sm" />
                )}
                <div className="relative">
                  <item.icon
                    className={cn(
                      "w-5 h-5 transition-transform duration-200 mb-0.5",
                      isActive && "scale-110 text-primary"
                    )}
                  />
                  {isActive && (
                    <span className="absolute inset-0 bg-primary/20 blur-sm rounded-full -z-10" />
                  )}
                </div>
                <span className={cn("leading-tight", isActive && "font-semibold text-primary")}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
