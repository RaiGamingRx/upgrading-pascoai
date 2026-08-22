import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
  showDetails?: boolean;
}

interface StrengthCriteria {
  label: string;
  met: boolean;
}

export function PasswordStrengthMeter({ password, showDetails = true }: PasswordStrengthMeterProps) {
  const analysis = useMemo(() => {
    const criteria: StrengthCriteria[] = [
      { label: "At least 8 characters", met: password.length >= 8 },
      { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Contains lowercase letter", met: /[a-z]/.test(password) },
      { label: "Contains number", met: /\d/.test(password) },
      { label: "Contains special character", met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
    ];

    const score = criteria.filter((c) => c.met).length;
    
    let strength: "weak" | "fair" | "good" | "strong" | "excellent";
    let color: string;
    let label: string;

    if (score <= 1) {
      strength = "weak";
      color = "bg-destructive";
      label = "Weak";
    } else if (score === 2) {
      strength = "fair";
      color = "bg-orange-500";
      label = "Fair";
    } else if (score === 3) {
      strength = "good";
      color = "bg-warning";
      label = "Good";
    } else if (score === 4) {
      strength = "strong";
      color = "bg-success";
      label = "Strong";
    } else {
      strength = "excellent";
      color = "bg-primary";
      label = "Excellent";
    }

    // Time to crack estimate
    let timeToCrack = "Instantly";
    if (password.length >= 12 && score >= 4) {
      timeToCrack = "Centuries";
    } else if (password.length >= 10 && score >= 3) {
      timeToCrack = "Years";
    } else if (password.length >= 8 && score >= 2) {
      timeToCrack = "Months";
    } else if (password.length >= 6) {
      timeToCrack = "Days";
    }

    return { criteria, score, strength, color, label, timeToCrack };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Password strength</span>
          <span className={cn(
            "text-xs font-medium",
            analysis.strength === "weak" && "text-destructive",
            analysis.strength === "fair" && "text-orange-500",
            analysis.strength === "good" && "text-warning",
            analysis.strength === "strong" && "text-success",
            analysis.strength === "excellent" && "text-primary"
          )}>
            {analysis.label}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300 rounded-full", analysis.color)}
            style={{ width: `${(analysis.score / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Time to crack */}
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="w-3 h-3 text-warning" />
        <span className="text-muted-foreground">
          Estimated time to crack: <span className="text-foreground font-medium">{analysis.timeToCrack}</span>
        </span>
      </div>

      {/* Criteria list */}
      {showDetails && (
        <div className="grid grid-cols-1 gap-1.5">
          {analysis.criteria.map((criterion) => (
            <div key={criterion.label} className="flex items-center gap-2 text-xs">
              {criterion.met ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <X className="w-3 h-3 text-muted-foreground" />
              )}
              <span className={criterion.met ? "text-foreground" : "text-muted-foreground"}>
                {criterion.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
