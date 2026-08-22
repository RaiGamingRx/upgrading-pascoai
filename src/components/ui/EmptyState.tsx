import React from "react";
import { LucideIcon, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = ShieldAlert,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-border/60 bg-card/25 backdrop-blur-sm",
        className
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center mb-4 text-muted-foreground">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="text-base sm:text-lg font-medium text-foreground">{title}</h4>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          variant="outline"
          size="sm"
          className="mt-5 text-xs sm:text-sm border-primary/30 text-primary hover:bg-primary/10"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
