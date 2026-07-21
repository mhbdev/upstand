"use client";

import type { ResourceAdvancedConfig } from "@upstand/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { type AdvancedCardProps, splitLines } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Healthcheck & Deployment Card
// ──────────────────────────────────────────────────────────────────────────────

type UpdateConfig = ResourceAdvancedConfig["updateConfig"];
type RollbackConfig = ResourceAdvancedConfig["rollbackConfig"];
type Healthcheck = NonNullable<ResourceAdvancedConfig["healthcheck"]>;

// ──────────────────────────────────────────────────────────────────────────────
// Update / Rollback shared sub-form
// ──────────────────────────────────────────────────────────────────────────────

type StrategyFormProps = {
  title: string;
  description: string;
  parallelism: number | undefined;
  delaySeconds: number | undefined;
  monitorSeconds: number | undefined;
  failureAction: string | undefined;
  failureOptions: Array<{ value: string; label: string }>;
  order: string | undefined;
  onParallelism: (v: number | undefined) => void;
  onDelay: (v: number | undefined) => void;
  onMonitor: (v: number | undefined) => void;
  onFailureAction: (v: string) => void;
  onOrder: (v: string) => void;
};

function StrategyForm({
  parallelism,
  delaySeconds,
  monitorSeconds,
  failureAction,
  failureOptions,
  order,
  onParallelism,
  onDelay,
  onMonitor,
  onFailureAction,
  onOrder,
}: StrategyFormProps) {
  const numericField = (
    placeholder: string,
    value: number | undefined,
    onChange: (v: number | undefined) => void,
  ) => (
    <Input
      type="number"
      min={0}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value ? Number(e.target.value) : undefined)
      }
    />
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {numericField("Parallelism", parallelism, onParallelism)}
      {numericField("Delay (s)", delaySeconds, onDelay)}
      {numericField("Monitor (s)", monitorSeconds, onMonitor)}

      <Select
        value={failureAction ?? "pause"}
        onValueChange={(v) => v && onFailureAction(v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Failure action" />
        </SelectTrigger>
        <SelectContent>
          {failureOptions.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={order ?? "stop-first"}
        onValueChange={(v) => v && onOrder(v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Order" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stop-first">Stop first</SelectItem>
          <SelectItem value="start-first">Start first</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

const UPDATE_FAILURE_OPTIONS = [
  { value: "pause", label: "Pause" },
  { value: "continue", label: "Continue" },
  { value: "rollback", label: "Rollback" },
];

const ROLLBACK_FAILURE_OPTIONS = [
  { value: "pause", label: "Pause" },
  { value: "continue", label: "Continue" },
];

const HEALTHCHECK_TIMING_FIELDS: Array<{
  key: keyof Healthcheck;
  label: string;
  min: number;
}> = [
  { key: "intervalSeconds", label: "Interval (s)", min: 1 },
  { key: "timeoutSeconds", label: "Timeout (s)", min: 1 },
  { key: "retries", label: "Retries", min: 1 },
  { key: "startPeriodSeconds", label: "Start period (s)", min: 0 },
];

/**
 * Manages container healthcheck configuration and rolling update/rollback
 * strategies — two closely related deployment lifecycle concerns.
 */
export function HealthcheckDeploymentCard({
  config,
  onChange,
}: AdvancedCardProps) {
  // ── Healthcheck helpers ──
  const updateHealthcheck = (partial: Partial<Healthcheck>) => {
    if (!config.healthcheck) return;
    onChange("healthcheck", { ...config.healthcheck, ...partial });
  };

  const onHealthcheckCommandChange = (raw: string) => {
    const command = splitLines(raw);
    if (command.length === 0) {
      onChange("healthcheck", null);
    } else {
      onChange("healthcheck", {
        command,
        intervalSeconds: config.healthcheck?.intervalSeconds ?? 30,
        timeoutSeconds: config.healthcheck?.timeoutSeconds ?? 5,
        retries: config.healthcheck?.retries ?? 3,
        startPeriodSeconds: config.healthcheck?.startPeriodSeconds ?? 10,
      });
    }
  };

  // ── Update config helpers ──
  const updateUpdateConfig = (partial: Partial<UpdateConfig>) =>
    onChange("updateConfig", { ...config.updateConfig, ...partial });

  const updateRollbackConfig = (partial: Partial<RollbackConfig>) =>
    onChange("rollbackConfig", { ...config.rollbackConfig, ...partial });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health &amp; deployment</CardTitle>
        <CardDescription>
          Container healthcheck probe and the rolling-update and rollback
          strategies Swarm applies during and after deployments.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 border-t pt-5">
        {/* ── Healthcheck ── */}
        <Field>
          <FieldLabel>Healthcheck</FieldLabel>
          <FieldDescription>
            Configure the container health command and its timing. Clear the
            command to disable the healthcheck entirely.
          </FieldDescription>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
            <CodeSurface>
              <CodeEditor
                language="shell"
                height="90px"
                value={config.healthcheck?.command.join("\n") ?? ""}
                onChange={onHealthcheckCommandChange}
                aria-label="Healthcheck command"
              />
            </CodeSurface>

            {HEALTHCHECK_TIMING_FIELDS.map(({ key, label, min }) => (
              <Input
                key={key}
                type="number"
                min={min}
                placeholder={label}
                value={config.healthcheck?.[key] ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : 0;
                  updateHealthcheck({ [key]: value });
                }}
                aria-label={label}
              />
            ))}
          </div>
        </Field>

        {/* ── Rolling update + Rollback ── */}
        <FieldGroup className="grid gap-5 lg:grid-cols-2">
          <Field>
            <FieldLabel>Rolling update</FieldLabel>
            <FieldDescription>
              Control how Swarm replaces tasks during a deployment.
            </FieldDescription>
            <StrategyForm
              title="Rolling update"
              description=""
              parallelism={config.updateConfig.parallelism}
              delaySeconds={config.updateConfig.delaySeconds}
              monitorSeconds={config.updateConfig.monitorSeconds}
              failureAction={config.updateConfig.failureAction}
              failureOptions={UPDATE_FAILURE_OPTIONS}
              order={config.updateConfig.order}
              onParallelism={(v) => updateUpdateConfig({ parallelism: v })}
              onDelay={(v) => updateUpdateConfig({ delaySeconds: v })}
              onMonitor={(v) => updateUpdateConfig({ monitorSeconds: v })}
              onFailureAction={(v) =>
                updateUpdateConfig({
                  failureAction: v as UpdateConfig["failureAction"],
                })
              }
              onOrder={(v) =>
                updateUpdateConfig({ order: v as UpdateConfig["order"] })
              }
            />
          </Field>

          <Field>
            <FieldLabel>Rollback behaviour</FieldLabel>
            <FieldDescription>
              Define the fallback strategy when an update fails.
            </FieldDescription>
            <StrategyForm
              title="Rollback"
              description=""
              parallelism={config.rollbackConfig.parallelism}
              delaySeconds={config.rollbackConfig.delaySeconds}
              monitorSeconds={config.rollbackConfig.monitorSeconds}
              failureAction={config.rollbackConfig.failureAction}
              failureOptions={ROLLBACK_FAILURE_OPTIONS}
              order={config.rollbackConfig.order}
              onParallelism={(v) => updateRollbackConfig({ parallelism: v })}
              onDelay={(v) => updateRollbackConfig({ delaySeconds: v })}
              onMonitor={(v) => updateRollbackConfig({ monitorSeconds: v })}
              onFailureAction={(v) =>
                updateRollbackConfig({
                  failureAction: v as RollbackConfig["failureAction"],
                })
              }
              onOrder={(v) =>
                updateRollbackConfig({ order: v as RollbackConfig["order"] })
              }
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
