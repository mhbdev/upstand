"use client";

import { Button } from "@upstand/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import { Plus, Trash2 } from "lucide-react";

type KeyValueEditorProps = {
  id: string;
  label: string;
  description: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
};

export function KeyValueEditor({
  id,
  label,
  description,
  value,
  onChange,
}: KeyValueEditorProps) {
  const entries = Object.entries(value);

  const updateEntry = (index: number, key: string, entryValue: string) => {
    const next = entries.filter((_, entryIndex) => entryIndex !== index);
    if (key.trim()) next.splice(index, 0, [key.trim(), entryValue]);
    onChange(Object.fromEntries(next));
  };

  return (
    <Field>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldDescription>{description}</FieldDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...value, "": "" })}
        >
          <Plus data-icon="inline-start" /> Add entry
        </Button>
      </div>
      <FieldGroup className="gap-2">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
            No entries configured.
          </p>
        ) : (
          entries.map(([key, entryValue], index) => (
            <div
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
              key={`${id}-${index}`}
            >
              <Input
                aria-label={`${label} key`}
                placeholder="KEY"
                value={key}
                onChange={(event) =>
                  updateEntry(index, event.target.value, entryValue)
                }
              />
              <Input
                aria-label={`${label} value`}
                placeholder="Value"
                value={entryValue}
                onChange={(event) =>
                  updateEntry(index, key, event.target.value)
                }
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${label} entry`}
                onClick={() => {
                  const next = entries.filter(
                    (_, entryIndex) => entryIndex !== index,
                  );
                  onChange(Object.fromEntries(next));
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </FieldGroup>
    </Field>
  );
}
