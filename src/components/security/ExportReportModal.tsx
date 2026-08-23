import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Shield,
  FileText,
  Printer,
  Download,
  X,
  AlertTriangle,
  CheckCircle2,
  Globe,
  MailCheck,
  Lock,
  Layers,
  Sparkles,
  Info,
  ChevronDown,
  ChevronRight,
  Target,
  Clock,
  Cpu,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateExecutiveReport,
  exportReportAsJson,
  type ExecutiveSecurityReport,
  type SecurityFinding,
  type VerificationClass,
} from "@/lib/reportModel";
import { cn } from "@/lib/utils";

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTarget?: string;
}

export function ExportReportModal({
  isOpen,
  onClose,
  initialTarget,
}: ExportReportModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(
    initialTarget || "__ALL__"
  );
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Generate real report model based on selected target
  const report: ExecutiveSecurityReport = useMemo(() => {
    return generateExecutiveReport({ selectedTarget });
  }, [selectedTarget]);

  // Handle body scroll lock & focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const origOverflow = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = origOverflow;
      document.body.style.touchAction = origTouchAction;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFindingEvidence = (id: string) => {
    setExpandedFindings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportJson = () => {
    exportReportAsJson(report);
  };

  const getVerificationBadge = (vClass: VerificationClass) => {
    switch (vClass) {
      case "VERIFIED_EVIDENCE":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            VERIFIED EVIDENCE
          </span>
        );
      case "DETERMINISTIC_DERIVATION":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            DETERMINISTIC DERIVATION
          </span>
        );
      case "AI_THREAT_ANALYSIS":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI THREAT ANALYSIS
          </span>
        );
      case "TRAINING_SIMULATION":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Terminal className="w-3 h-3" />
            TRAINING SIMULATION
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: SecurityFinding["severity"]) => {
    switch (sev) {
      case "critical":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] font-mono">CRITICAL</Badge>;
      case "high":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[10px] font-mono">HIGH</Badge>;
      case "medium":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px] font-mono">MEDIUM</Badge>;
      case "low":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40 text-[10px] font-mono">LOW</Badge>;
      default:
        return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/40 text-[10px] font-mono">INFO</Badge>;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Report Modal Card */}
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-[#090d16] border border-white/[0.12] shadow-2xl shadow-black overflow-hidden print-report-container">
        
        {/* Modal Top Chrome (Excluded during print) */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-white/[0.08] bg-[#0c121e]/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 flex items-center justify-center border border-cyan-500/40 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="report-modal-title" className="text-base sm:text-lg font-bold font-mono tracking-wide text-foreground">
                  EXECUTIVE DEFENSE BRIEFING
                </h2>
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 font-mono text-[10px] bg-cyan-500/10">
                  OFFICIAL SOC REPORT
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Ref ID: {report.metadata.reportId} // Generated {new Date(report.metadata.generatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Target Filter dropdown if multiple targets exist */}
            {report.availableTargets.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-lg border border-white/[0.08]">
                <Target className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="bg-transparent text-xs text-foreground font-mono focus:outline-none pr-2 py-0.5 cursor-pointer"
                  aria-label="Filter report by target asset"
                >
                  <option value="__ALL__" className="bg-[#090d16] text-foreground">
                    All Assessed Assets ({report.availableTargets.length})
                  </option>
                  {report.availableTargets.map((t) => (
                    <option key={t} value={t} className="bg-[#090d16] text-foreground">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs font-mono border-white/10 hover:border-cyan-500/40 hover:text-cyan-400"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              Print / Save PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              className="text-xs font-mono border-white/10 hover:border-cyan-500/40 hover:text-cyan-400"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              JSON Export
            </Button>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
              aria-label="Close Report Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 print:p-0">
          
          {/* Executive Header Block (Always rendered, optimized for print & screen) */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-[#0e1626] to-[#0a0f1c] border border-cyan-500/25 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-cyan-400">
                    PASCOAI CYBER DEFENSE INTELLIGENCE
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">•</span>
                  <span className="text-xs font-mono text-muted-foreground">SOC EXECUTIVE SUMMARY</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight font-mono">
                  {report.target}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground font-sans">
                  {report.summary.statusHeadline}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-muted-foreground/80">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    {new Date(report.summary.assessmentTimestamp).toLocaleString()}
                  </span>
                  <span>•</span>
                  <span>{report.summary.coverage}</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-semibold">{report.metadata.generatorVersion}</span>
                </div>
              </div>

              {/* Overall Score Dial */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#090d16]/80 border border-white/[0.08] min-w-[170px]">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                  OVERALL POSTURE
                </span>
                <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-foreground flex items-baseline">
                  {report.summary.overallPostureScore !== null ? (
                    <>
                      <span className={cn(
                        report.summary.overallPostureScore >= 80 ? "text-emerald-400" :
                        report.summary.overallPostureScore >= 60 ? "text-amber-400" : "text-red-400"
                      )}>
                        {report.summary.overallPostureScore}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal ml-1">/100</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground font-medium">INSUFFICIENT DATA</span>
                  )}
                </div>
                <span className="text-[10px] font-mono font-bold text-cyan-400/90 mt-1">
                  {report.summary.scoreLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Metric Severity Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-card/40 border border-red-500/25 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">
                CRITICAL
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-red-400">{report.summary.criticalCount}</span>
                <span className="text-[10px] text-muted-foreground font-mono">Immediate</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/40 border border-orange-500/25 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400">
                HIGH RISK
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-orange-400">{report.summary.highCount}</span>
                <span className="text-[10px] text-muted-foreground font-mono">Priority</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/40 border border-amber-500/25 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                MEDIUM
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-amber-400">{report.summary.mediumCount}</span>
                <span className="text-[10px] text-muted-foreground font-mono">Remediate</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card/40 border border-blue-500/25 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400">
                LOW / INFO
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-blue-400">
                  {report.summary.lowCount + report.summary.infoCount}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Advisory</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-card/40 border border-emerald-500/25 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                VERIFIED CLEAN
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {report.summary.cleanChecksCount}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Defenses</span>
              </div>
            </div>
          </div>

          {/* Section: Evaluated Security Domains */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                VERIFIED SECURITY DOMAIN ASSESSMENTS
              </h3>
              <span className="text-[11px] font-mono text-muted-foreground">
                {report.domains.length} Active Modules
              </span>
            </div>

            {report.domains.length === 0 ? (
              <div className="p-8 rounded-xl bg-card/20 border border-dashed border-white/[0.1] text-center space-y-2">
                <Info className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium text-foreground">No Stored Verification Data for Selected Target</p>
                <p className="text-xs text-muted-foreground">
                  Run a live check via Scanner, Web Security, or Email Security to generate evidence.
                </p>
              </div>
            ) : (
              report.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="rounded-xl border border-white/[0.08] bg-[#090e18]/60 overflow-hidden break-inside-avoid"
                >
                  {/* Domain Header */}
                  <div className="p-4 bg-white/[0.02] border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        {domain.id.includes("scanner") && <Shield className="w-4 h-4" />}
                        {domain.id.includes("websec") && <Globe className="w-4 h-4" />}
                        {domain.id.includes("emailsec") && <MailCheck className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold font-mono tracking-wide text-foreground">
                            {domain.name}
                          </h4>
                          {domain.score !== null && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono",
                                domain.score >= 80 ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"
                              )}
                            >
                              Score: {domain.score}/100
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Target: {domain.target} // Audited: {new Date(domain.scannedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-muted-foreground">
                        {domain.findings.length} Findings
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">
                        {domain.cleanChecks.length} Clean Checks
                      </Badge>
                    </div>
                  </div>

                  {/* Clean Checks Pill List */}
                  {domain.cleanChecks.length > 0 && (
                    <div className="p-3.5 bg-emerald-500/[0.02] border-b border-white/[0.04]">
                      <span className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-wider font-semibold block mb-2">
                        Active Verified Controls:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {domain.cleanChecks.map((chk, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {chk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Domain Findings List */}
                  <div className="p-4 space-y-3">
                    {domain.findings.length === 0 ? (
                      <p className="text-xs font-mono text-muted-foreground py-2 text-center">
                        ✓ All evaluated controls in this domain passed with zero high-risk anomalies detected.
                      </p>
                    ) : (
                      domain.findings.map((f) => {
                        const isExpanded = expandedFindings[f.id];

                        return (
                          <div
                            key={f.id}
                            className="p-3.5 rounded-lg border border-white/[0.06] bg-card/40 space-y-2.5 break-inside-avoid"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getSeverityBadge(f.severity)}
                                <span className="text-xs sm:text-sm font-bold text-foreground font-sans">
                                  {f.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {getVerificationBadge(f.verificationClass)}
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground/90 font-sans leading-relaxed">
                              {f.description}
                            </p>

                            {/* Remediation Box */}
                            <div className="p-2.5 rounded-md bg-white/[0.02] border border-white/[0.05] flex items-start gap-2">
                              <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase shrink-0 mt-0.5">
                                [REMEDIATION]
                              </span>
                              <span className="text-xs font-mono text-foreground/80">
                                {f.recommendation}
                              </span>
                            </div>

                            {/* Technical Evidence Disclosure */}
                            {f.evidence && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleFindingEvidence(f.id)}
                                  className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer no-print"
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  {isExpanded ? "Hide Technical Evidence" : "Inspect Raw Evidence Proof"}
                                </button>

                                <div className={cn("mt-2", isExpanded ? "block" : "hidden print:block")}>
                                  <pre className="p-3 rounded-md bg-black/60 border border-white/[0.08] text-[10px] font-mono text-cyan-300/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                    {typeof f.evidence === "string"
                                      ? f.evidence
                                      : JSON.stringify(f.evidence, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Section: AI Threat Intelligence Advisory (Strictly Labeled) */}
          {report.aiAnalysis.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/[0.08] break-inside-avoid">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                    AI THREAT RESEARCH ADVISORIES
                  </h3>
                </div>
                {getVerificationBadge("AI_THREAT_ANALYSIS")}
              </div>

              <p className="text-xs text-muted-foreground font-mono">
                NOTICE: The following sections represent synthesized threat intelligence from Gemini 2.5 Flash. They are analytical advisories and must be independently verified.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.aiAnalysis.map((ai, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold text-emerald-400">PERSONA: {ai.persona}</span>
                      <span className="text-muted-foreground">{ai.date}</span>
                    </div>
                    <div className="text-xs font-semibold text-foreground font-sans">
                      {ai.topic}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                      {ai.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Simulation & Training Exercises */}
          {report.simulations.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/[0.08] break-inside-avoid">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                    TRAINING & SIMULATION LOGS
                  </h3>
                </div>
                {getVerificationBadge("TRAINING_SIMULATION")}
              </div>

              <div className="flex flex-wrap gap-2">
                {report.simulations.map((s, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/20 flex items-center gap-2 text-xs font-mono text-amber-300/90"
                  >
                    <span>⚡ {s.title}</span>
                    <span className="text-[10px] text-muted-foreground">({s.date})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report Footer & Compliance Notice */}
          <div className="pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-[10px] font-mono text-muted-foreground/80">
            <div>
              <p>PASCOAI CYBER DEFENSE OS // EXECUTIVE REPORT GENERATOR</p>
              <p className="mt-0.5">Classification: {report.metadata.classificationNotice}</p>
            </div>
            <div className="text-cyan-400/80 shrink-0">
              ISO/IEC 27001 & NIST CSF ALIGNED EVIDENCE
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
