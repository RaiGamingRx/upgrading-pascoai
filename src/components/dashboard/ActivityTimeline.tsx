import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Clock,
  Trash2,
  Scan,
  Globe,
  MailCheck,
  Lock,
  Search,
  Key,
  Cpu,
  ArrowRight,
  Shield,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface UnifiedActivityItem {
  id: string;
  type: "scan" | "websec" | "email" | "crypto" | "password" | "research" | "sim";
  title: string;
  target: string;
  timestamp: number;
  timeLabel: string;
  status: "success" | "warning" | "error";
  score?: number | null;
  path: string;
}

interface ActivityTimelineProps {
  activities: UnifiedActivityItem[];
  onClearHistory: () => void;
  className?: string;
}

export function ActivityTimeline({
  activities,
  onClearHistory,
  className,
}: ActivityTimelineProps) {
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredItems = useMemo(() => {
    return activities.filter((item) => {
      const matchesType = filterType === "all" || item.type === filterType;
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.target.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [activities, filterType, searchQuery]);

  const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    scan: Scan,
    websec: Globe,
    email: MailCheck,
    crypto: Lock,
    password: Key,
    research: Search,
    sim: Cpu,
  };

  const typeColorClasses: Record<string, { bg: string; text: string }> = {
    scan: { bg: "bg-primary/10", text: "text-primary" },
    websec: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    email: { bg: "bg-amber-500/10", text: "text-amber-400" },
    crypto: { bg: "bg-secondary/15", text: "text-secondary" },
    password: { bg: "bg-primary/10", text: "text-primary" },
    research: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    sim: { bg: "bg-secondary/15", text: "text-secondary" },
  };

  return (
    <GlassPanel variant="default" className={cn("p-4 sm:p-6", className)}>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/60 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground font-sans">
              Operational Telemetry & Event Timeline
            </h3>
            <p className="text-xs text-muted-foreground font-sans">
              Unified cross-module audit trail and deterministic session history
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearHistory}
            disabled={activities.length === 0}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear Telemetry Log
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      {activities.length > 0 && (
        <div className="mt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-2">
          {/* Module Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { key: "all", label: "All Telemetry" },
              { key: "scan", label: "Recon" },
              { key: "websec", label: "WebSec" },
              { key: "email", label: "Email" },
              { key: "crypto", label: "Crypto" },
              { key: "research", label: "AI Research" },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterType(f.key)}
                className={cn(
                  "text-[11px] font-mono px-2.5 py-1 rounded-lg transition-all shrink-0",
                  filterType === f.key
                    ? "bg-primary/20 text-primary border border-primary/40 font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground bg-card/40 border border-border/40"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="w-full md:w-60">
            <Input
              type="text"
              placeholder="Search target or action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs font-mono bg-card/50 border-border/60"
            />
          </div>
        </div>
      )}

      {/* Activity Timeline List */}
      <div className="mt-4 space-y-2">
        {activities.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No Telemetry History Recorded"
            description="Run a reconnaissance scan, test website TLS headers, or generate cryptographic keys to populate real-time activity."
            actionLabel="Launch Domain Reconnaissance"
            onAction={() => navigate("/scanner")}
          />
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-mono">
            No telemetry records match the current filter or search criteria.
          </div>
        ) : (
          filteredItems.map((item) => {
            const Icon = typeIcons[item.type] || Shield;
            const colors = typeColorClasses[item.type] || { bg: "bg-primary/10", text: "text-primary" };

            return (
              <div
                key={item.id}
                onClick={() => navigate(item.path)}
                className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${colors.bg} ${colors.text} transition-transform group-hover:scale-105`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold group-hover:text-primary transition-colors truncate font-sans">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {item.target}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {typeof item.score === "number" && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[11px]",
                        item.score >= 80
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                          : item.score >= 60
                          ? "border-amber-500/40 text-amber-400 bg-amber-500/5"
                          : "border-rose-500/40 text-rose-400 bg-rose-500/5"
                      )}
                    >
                      {item.score}/100
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                    {item.timeLabel}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassPanel>
  );
}
