import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, Lightbulb, Info, CheckCircle, AlertTriangle } from "lucide-react";

export type InfoBannerType = "info" | "tip" | "success" | "warning" | "error";

interface InfoBannerProps {
  type?: InfoBannerType;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const typeConfig = {
  info: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    icon: Info,
  },
  tip: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: Lightbulb,
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/30",
    text: "text-success",
    icon: CheckCircle,
  },
  warning: {
    bg: "bg-warning/10",
    border: "border-warning/30",
    text: "text-warning",
    icon: AlertTriangle,
  },
  error: {
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
    icon: AlertCircle,
  },
};

export function InfoBanner({
  type = "info",
  title,
  children,
  action,
  className,
  dismissible = false,
  onDismiss,
}: InfoBannerProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  if (isDismissed) return null;

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 sm:px-5 sm:py-4",
        config.bg,
        config.border,
        className
      )}
    >
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.text)} />
      
      <div className="flex-1 min-w-0">
        {title && <p className={cn("font-semibold text-sm mb-1", config.text)}>{title}</p>}
        <div className={cn("text-sm", config.text)}>
          {children}
        </div>
      </div>

      <div className="flex items-start gap-2 flex-shrink-0">
        {action && <div>{action}</div>}
        {dismissible && (
          <button
            onClick={() => {
              setIsDismissed(true);
              onDismiss?.();
            }}
            className={cn("mt-0.5 rounded hover:opacity-70 transition-opacity", config.text)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
