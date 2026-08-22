import React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-4 flex-1">
        {icon && (
          <div className="flex-shrink-0 p-3 rounded-lg bg-primary/10 border border-primary/20 animate-fade-in">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1
            className={cn(
              "text-2xl sm:text-3xl font-bold tracking-tight",
              icon ? "" : "animate-fade-in"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}
