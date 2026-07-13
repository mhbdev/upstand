import type { ReactNode } from "react";
import { cn } from "@upstand/ui/lib/utils";

export function DashboardPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function DashboardPageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-border/40 border-b pb-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 font-bold text-2xl text-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
