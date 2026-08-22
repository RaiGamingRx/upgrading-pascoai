import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Command, LogOut, Settings, Menu, Shield, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface TopBarProps {
  onMenuClick: () => void;
  showMenuButton: boolean;
  user: { email: string } | null;
  onLogout: () => void;
}

export function TopBar({
  onMenuClick,
  showMenuButton,
  user: _user,
  onLogout,
}: TopBarProps) {
  const navigate = useNavigate();
  const { user: authUser, isDemo } = useAuth();

  const avatarLetter = isDemo
    ? "D"
    : authUser?.displayName
    ? authUser.displayName.charAt(0).toUpperCase()
    : authUser?.email?.charAt(0).toUpperCase() || "U";

  useEffect(() => {
    const openFromTour = () => {
      onMenuClick();
      setTimeout(() => {
        window.dispatchEvent(new Event("tour:menu-opened"));
      }, 120);
    };

    window.addEventListener("tour:open-menu", openFromTour);
    return () => window.removeEventListener("tour:open-menu", openFromTour);
  }, [onMenuClick]);

  return (
    <header
      data-tour="topbar"
      className="h-16 bg-card/70 backdrop-blur-xl border-b border-border/70 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30 transition-all"
    >
      {/* LEFT: Menu button & Search */}
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <Button
            data-tour="hamburger"
            variant="ghost"
            size="icon"
            onClick={() => {
              onMenuClick();
              window.dispatchEvent(new Event("tour:menu-opened"));
            }}
            className="text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Mobile Brand (visible when sidebar is hidden on mobile) */}
        <div className="flex md:hidden items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon-cyan-sm">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-base text-gradient-cyber">PascoAI</span>
        </div>

        {/* Command palette search trigger (desktop & tablet) */}
        <Button
          variant="outline"
          className="hidden sm:flex items-center gap-2 text-muted-foreground w-48 lg:w-64 border-border/60 bg-card/40 hover:bg-card/80 hover:text-foreground hover:border-primary/40 transition-all text-xs lg:text-sm h-9"
          onClick={() => {
            window.dispatchEvent(new Event("open-command-palette"));
          }}
        >
          <Command className="w-3.5 h-3.5 text-primary" />
          <span className="truncate">Quick actions...</span>
          <kbd className="ml-auto pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      {/* RIGHT: System telemetry badge + Demo Indicator + User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live Protection Status Indicator (laptop/desktop) */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
          <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>Active Guard</span>
        </div>

        {/* Mobile Command Palette Trigger Icon */}
        <Button
          variant="ghost"
          size="iconSm"
          className="sm:hidden text-muted-foreground hover:text-primary"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          aria-label="Search and command palette"
        >
          <Command className="w-4 h-4" />
        </Button>

        {/* Demo Mode Badge */}
        {isDemo && (
          <div className="relative">
            <span className="absolute -inset-0.5 rounded-full bg-primary/40 blur-xs animate-pulse" />
            <span className="relative px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-full bg-primary text-primary-foreground shadow-neon-cyan-sm">
              DEMO
            </span>
          </div>
        )}

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full ring-2 ring-primary/20 hover:ring-primary/40 transition-all p-0"
            >
              <Avatar className="h-full w-full">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-secondary/20 text-primary font-bold text-xs sm:text-sm">
                  {avatarLetter}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-56 bg-card/95 backdrop-blur-xl border-border/80" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none text-foreground">
                  {authUser?.displayName || "Cyber Analyst"}
                </p>
                <p className="text-xs leading-none text-muted-foreground font-mono truncate">
                  {authUser?.email || "analyst@pascoai.com"}
                </p>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="bg-border/60" />

            <DropdownMenuItem
              onClick={() => navigate("/settings")}
              className="cursor-pointer text-xs sm:text-sm"
            >
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Settings & Preferences</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-border/60" />

            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive focus:text-destructive cursor-pointer text-xs sm:text-sm"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
