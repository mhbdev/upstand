"use client";

import { Badge } from "@upstand/ui/components/badge";
import { cn } from "@upstand/ui/lib/utils";
import { BoxIcon, DatabaseIcon, FileTextIcon, ServerIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ToolOutput } from "@/components/ai-elements/tool";

type ToolResultProps = {
  name: string;
  output: unknown;
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const labelFor = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (first) => first.toUpperCase());

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

function ResultIcon({ name }: { name: string }) {
  if (name.includes("log")) return <FileTextIcon aria-hidden="true" />;
  if (name.includes("server")) return <ServerIcon aria-hidden="true" />;
  if (name.includes("docker") || name.includes("container")) {
    return <BoxIcon aria-hidden="true" />;
  }
  return <DatabaseIcon aria-hidden="true" />;
}

function CollectionResult({
  name,
  records,
}: {
  name: string;
  records: RecordValue[];
}) {
  return (
    <section
      aria-label={`${labelFor(name)} results`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <ResultIcon name={name} />
        <span className="font-medium text-xs">{labelFor(name)}</span>
        <Badge className="ml-auto rounded-full" variant="secondary">
          {records.length}
        </Badge>
      </div>
      {records.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
          No results found.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {records.map((record, index) => {
            const title = String(
              record.name ??
                record.serviceName ??
                record.hostname ??
                record.Names ??
                record.id ??
                record.ID ??
                `Result ${index + 1}`,
            );
            const subtitle =
              record.status ??
              record.State ??
              record.currentState ??
              record.image ??
              record.Image ??
              record.ipAddress;
            return (
              <article
                className="min-w-0 rounded-md border bg-muted/20 px-3 py-2"
                key={`${title}-${index}`}
              >
                <p className="truncate font-medium text-sm" translate="no">
                  {title}
                </p>
                {subtitle !== undefined ? (
                  <p className="mt-1 truncate text-muted-foreground text-xs">
                    {displayValue(subtitle)}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetailsResult({ output }: { output: RecordValue }) {
  const entries = Object.entries(output).filter(
    ([, value]) => value !== undefined && typeof value !== "object",
  );
  return (
    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div className="min-w-0" key={key}>
          <dt className="truncate text-muted-foreground text-xs">
            {labelFor(key)}
          </dt>
          <dd
            className={cn(
              "mt-1 break-words font-medium text-sm",
              key.toLowerCase().includes("id") && "font-mono text-xs",
            )}
          >
            {displayValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LogsResult({ output }: { output: string }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
      {output || "No log output returned."}
    </pre>
  );
}

export function UpGalToolOutput({ name, output }: ToolResultProps): ReactNode {
  if (typeof output === "string" && name.includes("log")) {
    return <LogsResult output={output} />;
  }

  const records = Array.isArray(output)
    ? output.filter(isRecord)
    : isRecord(output) && Array.isArray(output.items)
      ? output.items.filter(isRecord)
      : null;
  if (records) return <CollectionResult name={name} records={records} />;
  if (isRecord(output)) return <DetailsResult output={output} />;
  return <ToolOutput output={output} errorText={undefined} />;
}
