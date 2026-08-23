import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { CommandPalette } from "@/components/CommandPalette";
import { CursorGlow } from "@/components/motion/CursorGlow";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { AppTour } from "./AppTour";

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const open = () => setSidebarOpen(true);
    const close = () => setSidebarOpen(false);

    window.addEventListener("tour:open-menu", open);
    window.addEventListener("tour:close-menu", close);

    return () => {
      window.removeEventListener("tour:open-menu", open);
      window.removeEventListener("tour:close-menu", close);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background relative selection:bg-primary/25 selection:text-foreground">
      {/* Ambient background and cursor aura */}
      <AnimatedBackground showGrid={true} intensity="normal" />
      <CursorGlow />

      {/* Desktop/Laptop Sidebar Navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isMobile={isMobile}
      />

      {/* Main Content Area */}
      <div
        className={cn(
          "transition-[margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-10 flex flex-col min-h-screen min-h-[100dvh]",
          sidebarOpen && !isMobile ? "ml-64" : "ml-0 md:ml-16"
        )}
      >
        <TopBar
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          showMenuButton={isMobile || !sidebarOpen}
          user={user}
          onLogout={handleLogout}
        />

        {/* Content with responsive spacing (adds bottom padding on mobile for floating BottomNav) */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:pb-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>

        <footer className="hidden md:block py-4 text-center text-xs text-muted-foreground/80 border-t border-border/40">
          PascoAI Defense Platform • Developed by <span className="text-primary font-medium">Raay</span>
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar (< md screens) */}
      <BottomNav />

      {/* Global Quick Action Command Palette */}
      <CommandPalette />

      {/* Interactive Feature Tour */}
      <AppTour />
    </div>
  );
}
