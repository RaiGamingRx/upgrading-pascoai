import React from "react";
import { GlassPanel } from "@/components/motion/GlassPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Cpu,
  Target,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface AIBriefingSectionProps {
  score: number;
  totalScans: number;
  criticalIssues: number;
  topRiskDomain: string | null;
  topRecommendation: string | null;
  cleanChecksCount: number;
  className?: string;
}

export function AIBriefingSection({
  score,
  totalScans,
  criticalIssues,
  topRiskDomain,
  topRecommendation,
  cleanChecksCount,
  className,
}: AIBriefingSectionProps) {
  const navigate = useNavigate();

  // Deterministic summary synthesis based strictly on real state
  const hasAudits = totalScans > 0;
  const isOptimal = score >= 85 && criticalIssues === 0;

  let briefingSummary = "";
  let postureStatus = "EVALUATION PENDING";

  if (!hasAudits) {
    postureStatus = "INITIALIZING DEFENSE BASELINE";
    briefingSummary =
      "No perimeter or host audits have been recorded in this workspace yet. Execute a reconnaissance scan or Web Security header audit to establish verified telemetry.";
  } else if (isOptimal) {
    postureStatus = "STRONG DEFENSIVE PERIMETER";
    briefingSummary = `Aggregated defense rating is strong at ${score}/100 with ${cleanChecksCount} verified hardening checks active. Attack surface is minimal across analyzed endpoints.`;
  } else if (criticalIssues > 0) {
    postureStatus = "ACTIONABLE EXPOSURE IDENTIFIED";
    briefingSummary = `${criticalIssues} high-priority risk finding${criticalIssues > 1 ? "s" : ""} detected requiring remediation in ${topRiskDomain || "inspected services"}. Immediate hardening recommended.`;
  } else {
    postureStatus = "MODERATE DEFENSE POSTURE";
    briefingSummary = `Security posture is rated at ${score}/100. Routine defensive measures are active, though additional header hardening and DMARC enforcement will improve resilience.`;
  }

  const defaultRecommendation =
    topRecommendation ||
    (hasAudits
      ? "Enforce strict CSP directives and verify SPF/DMARC anti-spoofing policies on primary mail domains."
      : "Launch a domain reconnaissance scan to identify open ports, DNS configurations, and SSL certificate validity.");

  return (
    <GlassPanel
      variant="cyber"
      className={cn(
        "p-4 sm:p-6 relative overflow-hidden border-primary/30 shadow-[0_4px_24px_rgba(6,182,212,0.08)]",
        className
      )}
    >
      {/* Background ambient gradient */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl opacity-40" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary shadow-neon-cyan-sm shrink-0">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-foreground font-sans">
                AI Executive Threat Briefing
              </h3>
              <Badge
                variant="outline"
                className="font-mono text-[10px] text-cyan-400 border-cyan-500/40 bg-cyan-500/10 px-2 py-0.2"
              >
                AUTOMATED SYNTHESIS
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-sans mt-0.5">
              Continuous intelligence summary synthesized from verified telemetry
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/research")}
          className="text-xs font-mono border-primary/40 hover:border-primary/80 text-primary bg-primary/5 hover:bg-primary/15 shadow-sm active:scale-95 transition-all self-start md:self-auto shrink-0"
        >
          <Cpu className="w-3.5 h-3.5 mr-1.5" />
          <span>Launch AI Threat Lab</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Briefing Narrative */}
        <div className="md:col-span-7 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="font-bold text-primary uppercase tracking-wider">{postureStatus}</span>
          </div>
          <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans">
            {briefingSummary}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/50 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {cleanChecksCount} Passed Checks
            </span>
            {topRiskDomain && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/50 flex items-center gap-1">
                <Target className="w-3 h-3 text-amber-400" />
                Target: {topRiskDomain}
              </span>
            )}
          </div>
        </div>

        {/* Priority Action Recommendation Box */}
        <div className="md:col-span-5 p-3.5 rounded-xl bg-card/60 border border-primary/20 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              Recommended Priority Action
            </span>
            <p className="text-xs text-foreground/80 leading-snug font-sans">
              {defaultRecommendation}
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">SOC Remediation Guideline</span>
            <button
              type="button"
              onClick={() => navigate(hasAudits ? "/web-security" : "/scanner")}
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
            >
              Remediate <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
