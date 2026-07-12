"use client";

import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@upstand/ui/components/button";
import { Input } from "@upstand/ui/components/input";
import { cn } from "@upstand/ui/lib/utils";

export type KeyValuePair = { key: string; value: string };

export type KeyValueIssue = {
  index: number;
  message: string;
};

const DEFAULT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateKeyValuePairs(
  pairs: KeyValuePair[],
  options: { keyPattern?: RegExp; keyLabel?: string } = {},
): KeyValueIssue[] {
  const issues: KeyValueIssue[] = [];
  const seen = new Map<string, number>();
  const pattern = options.keyPattern ?? DEFAULT_KEY_PATTERN;
  const label = options.keyLabel ?? "Key";

  pairs.forEach((pair, index) => {
    const key = pair.key.trim();
    if (!key) {
      issues.push({ index, message: `${label} is required` });
      return;
    }
    if (!pattern.test(key)) {
      issues.push({
        index,
        message: `${label} must use letters, numbers, and underscores`,
      });
    }
    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({
        index,
        message: `${label} duplicates row ${previous + 1}`,
      });
    } else {
      seen.set(key, index);
    }
  });

  return issues;
}

type Props = {
  value: KeyValuePair[];
  onChange: (value: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  keyLabel?: string;
  keyPattern?: RegExp;
  className?: string;
};

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "Value",
  addLabel = "Add variable",
  keyLabel = "Key",
  keyPattern,
  className,
}: Props) {
  const issues = validateKeyValuePairs(value, { keyPattern, keyLabel });
  const issueFor = (index: number) =>
    issues.find((issue) => issue.index === index);

  const update = (index: number, patch: Partial<KeyValuePair>) => {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, { key: "", value: "" }])}
        >
          <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
          No variables configured.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {value.map((item, index) => {
            const issue = issueFor(index);
            return (
              <div
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
                key={`${index}-${item.key}`}
              >
                <div className="flex flex-col gap-1">
                  <Input
                    value={item.key}
                    placeholder={keyPlaceholder}
                    aria-label={`${keyLabel} ${index + 1}`}
                    aria-invalid={Boolean(issue)}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      update(index, { key: event.target.value })
                    }
                    className="font-mono text-xs uppercase"
                  />
                  {issue && (
                    <p className="text-[10px] text-destructive">
                      {issue.message}
                    </p>
                  )}
                </div>
                <Input
                  value={item.value}
                  placeholder={valuePlaceholder}
                  aria-label={`Value ${index + 1}`}
                  autoComplete="off"
                  onChange={(event) =>
                    update(index, { value: event.target.value })
                  }
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.key || `row ${index + 1}`}`}
                  onClick={() =>
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="text-destructive hover:bg-destructive/10"
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
