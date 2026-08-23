import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  AlertTriangle,
  Layers,
  ShieldCheck,
  Activity,
  PieChart as PieIcon,
  BarChart3,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineDataPoint {
  timestamp: number;
  dateLabel: string;
  score: number;
  target: string;
  suite: string;
}

export interface SeverityCount {
  name: string;
  count: number;
  color: string;
  fill: string;
}

export interface CategoryDistribution {
  category: string;
  passed: number;
  issues: number;
  total: number;
}

interface SecurityChartsProps {
  timelineData: TimelineDataPoint[];
  severityData: SeverityCount[];
  categoryData: CategoryDistribution[];
  className?: string;
}

export function SecurityCharts({
  timelineData,
  severityData,
  categoryData,
  className,
}: SecurityChartsProps) {
  const [activeTab, setActiveTab] = useState<"trend" | "severity" | "categories">("trend");

  const totalFindings = severityData.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <GlassPanel variant="default" className={cn("p-4 sm:p-6", className)}>
      {/* Chart Header with Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/60 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground font-sans">
              Cyber Telemetry & Threat Intelligence Visualizer
            </h3>
            <p className="text-xs text-muted-foreground font-sans">
              Deterministic real-time data from inspected network endpoints and security suites
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-card border border-border/70 p-1 rounded-xl gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("trend")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg transition-all",
              activeTab === "trend"
                ? "bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Posture Trend</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("severity")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg transition-all",
              activeTab === "severity"
                ? "bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Severity</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg transition-all",
              activeTab === "categories"
                ? "bg-primary/20 text-primary border border-primary/30 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Domains</span>
          </button>
        </div>
      </div>

      {/* Main Chart Canvas Area */}
      <div className="mt-5 min-h-[260px] sm:min-h-[290px] flex flex-col justify-center">
        {/* TAB 1: Posture Trend */}
        {activeTab === "trend" && (
          <div className="w-full">
            {timelineData.length < 2 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="p-3 rounded-full bg-muted/60 text-muted-foreground mb-3">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Continuous Telemetry Trend Line
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {timelineData.length === 1
                    ? `1 baseline recorded for ${timelineData[0].target} (Score: ${timelineData[0].score}/100). Run additional scans across domain, web, or email targets to plot continuous slope & variance.`
                    : "No audit data recorded yet. Run a domain scan or web audit to establish your security baseline."}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3 text-xs font-mono text-muted-foreground">
                  <span>Chronological Posture Progression (0–100 Scale)</span>
                  <span className="text-primary">{timelineData.length} Verified Data Points</span>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="dateLabel"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as TimelineDataPoint;
                            return (
                              <div className="rounded-lg border border-border bg-card/95 backdrop-blur-md p-2.5 shadow-xl text-xs font-sans">
                                <p className="font-semibold text-primary">{data.target}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{data.suite} • {data.dateLabel}</p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-foreground">Score:</span>
                                  <Badge variant="outline" className="font-mono text-[10px] text-cyan-400 border-cyan-500/40 bg-cyan-500/10">
                                    {data.score}/100
                                  </Badge>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#scoreAreaGradient)"
                        animationDuration={1200}
                        animationEasing="ease-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Severity Distribution */}
        {activeTab === "severity" && (
          <div className="w-full">
            {totalFindings === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Zero Verified Vulnerabilities Detected
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Inspected targets currently show zero critical, high, or medium severity deficits across verified telemetry rules.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-7 h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={severityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "JetBrains Mono" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as SeverityCount;
                            return (
                              <div className="rounded-lg border border-border bg-card/95 backdrop-blur-md p-2.5 shadow-xl text-xs font-sans">
                                <p className="font-semibold text-foreground capitalize">{data.name} Severity</p>
                                <p className="text-[11px] font-mono text-muted-foreground mt-1">
                                  Findings: <strong className="text-foreground">{data.count}</strong>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={1000} animationEasing="ease-out">
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="md:col-span-5 space-y-2">
                  <span className="text-xs font-mono uppercase text-muted-foreground block mb-2">
                    Finding Breakdown ({totalFindings} Total)
                  </span>
                  {severityData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-card/40 border border-border/50 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="font-medium text-foreground capitalize">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Category Coverage */}
        {activeTab === "categories" && (
          <div className="w-full">
            {categoryData.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="p-3 rounded-full bg-muted/60 text-muted-foreground mb-3">
                  <Layers className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Security Domain Telemetry
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Run audits across domain recon, web security, and email modules to visualize coverage across defensive categories.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryData.map((cat) => {
                    const passRate = cat.total > 0 ? Math.round((cat.passed / cat.total) * 100) : 100;
                    return (
                      <div key={cat.category} className="p-3 rounded-xl border border-border/60 bg-card/40 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground font-sans truncate">{cat.category}</span>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                              passRate >= 80 ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                            )}
                          >
                            {passRate}% Pass
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-400 h-full" style={{ width: `${(cat.passed / cat.total) * 100}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${(cat.issues / cat.total) * 100}%` }} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                            <span>{cat.passed} Clean</span>
                            <span>{cat.issues} Deficits</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
