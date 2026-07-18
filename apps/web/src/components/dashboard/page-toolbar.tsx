"use client";

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@upstand/ui/components/button";
import { Input } from "@upstand/ui/components/input";
import { cn } from "@upstand/ui/lib/utils";
import type { ReactNode } from "react";

export function PageToolbar({
  children,
  className,
  search,
  searchLabel = "Search",
  searchPlaceholder = "Search…",
  onSearchChange,
  onClearSearch,
  onClearFilters,
  hasActiveFilters = false,
}: {
  children?: ReactNode;
  className?: string;
  search?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}) {
  const hasSearch = typeof search === "string" && Boolean(onSearchChange);
  const handleSearchChange = onSearchChange;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3",
        className,
      )}
    >
      {hasSearch ? (
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => handleSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pr-9 pl-9"
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={onClearSearch}
              aria-label={`Clear ${searchLabel.toLowerCase()}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
      {children}
      {hasActiveFilters && onClearFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
