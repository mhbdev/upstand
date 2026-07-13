"use client";

import { useMutation } from "@tanstack/react-query";
import {
  parseResourceAdvancedConfig,
  type ResourceAdvancedConfig,
  ResourceAdvancedConfigSchema,
} from "@upstand/domain";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Field,
  FieldContent,
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
import { Switch } from "@upstand/ui/components/switch";
import { cn } from "@upstand/ui/lib/utils";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyValueEditor } from "@/components/resource/key-value-editor";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { trpc } from "@/utils/trpc";

type Props = {
  resourceId: string;
  resourceType: string;
  advancedConfig?: string | null;
};

const splitLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function ResourceAdvancedSettings({
  resourceId,
  resourceType,
  advancedConfig,
}: Props) {
  const initial = useMemo(
    () => parseResourceAdvancedConfig(advancedConfig),
    [advancedConfig],
  );
  const [config, setConfig] = useState<ResourceAdvancedConfig>(initial);
  const [rawJson, setRawJson] = useState(() =>
    JSON.stringify(initial, null, 2),
  );
  const update = useMutation(trpc.resource.update.mutationOptions());

  useEffect(() => {
    setConfig(initial);
    setRawJson(JSON.stringify(initial, null, 2));
  }, [initial]);

  const updateConfig = <K extends keyof ResourceAdvancedConfig>(
    key: K,
    value: ResourceAdvancedConfig[K],
  ) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const saveConfig = (next: ResourceAdvancedConfig = config) => {
    const parsed = ResourceAdvancedConfigSchema.safeParse(next);
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? "Invalid advanced configuration",
      );
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    setConfig(parsed.data);
    setRawJson(JSON.stringify(parsed.data, null, 2));
    update.mutate(
      { id: resourceId, advancedConfig: serialized },
      {
        onSuccess: () => toast.success("Advanced settings saved"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const saveRawJson = () => {
    try {
      const parsed = ResourceAdvancedConfigSchema.safeParse(
        JSON.parse(rawJson),
      );
      if (!parsed.success) {
        toast.error(
          parsed.error.issues[0]?.message ?? "Invalid JSON configuration",
        );
        return;
      }
      saveConfig(parsed.data);
    } catch {
      toast.error("Advanced configuration must be valid JSON");
    }
  };

  const addPort = () =>
    updateConfig("ports", [
      ...config.ports,
      { publishedPort: 8080, targetPort: 8080, protocol: "tcp" },
    ]);
  const addVolume = () =>
    updateConfig("volumes", [
      ...config.volumes,
      { source: `${resourceId}-data`, target: "/data", readOnly: false },
    ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Advanced service settings</CardTitle>
          <CardDescription>
            Dokploy-style Swarm overrides for this {resourceType}. These values
            are applied on the next deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 border-t pt-5">
          <FieldGroup className="grid gap-5 lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="resource-command">
                Entrypoint command
              </FieldLabel>
              <FieldDescription>
                One argument per line. Leave empty to use the image default.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  id="resource-command"
                  language="shell"
                  height="110px"
                  value={config.command.join("\n")}
                  onChange={(value) =>
                    updateConfig("command", splitLines(value))
                  }
                  aria-label="Entrypoint command arguments"
                />
              </CodeSurface>
            </Field>
            <Field>
              <FieldLabel htmlFor="resource-args">Command arguments</FieldLabel>
              <FieldDescription>
                Arguments are passed after the command.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  id="resource-args"
                  language="shell"
                  height="110px"
                  value={config.args.join("\n")}
                  onChange={(value) => updateConfig("args", splitLines(value))}
                  aria-label="Command arguments"
                />
              </CodeSurface>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-5 lg:grid-cols-2">
            <KeyValueEditor
              id="advanced-environment"
              label="Environment overrides"
              description="Values override the environment generated for the resource."
              value={config.environment}
              onChange={(environment) =>
                updateConfig("environment", environment)
              }
            />
            <KeyValueEditor
              id="advanced-labels"
              label="Service labels"
              description="Labels are applied to the deployed Swarm service."
              value={config.labels}
              onChange={(labels) => updateConfig("labels", labels)}
            />
          </FieldGroup>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium text-sm">Published ports</h3>
                <p className="text-muted-foreground text-xs">
                  Expose service ports through the Swarm ingress mesh.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addPort}
              >
                <Plus data-icon="inline-start" /> Add port
              </Button>
            </div>
            {config.ports.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                No extra published ports.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {config.ports.map((port, index) => (
                  <div
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"
                    key={`${port.publishedPort}-${index}`}
                  >
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={port.publishedPort}
                      aria-label="Published port"
                      onChange={(event) =>
                        updateConfig(
                          "ports",
                          config.ports.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  publishedPort: Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={port.targetPort}
                      aria-label="Target port"
                      onChange={(event) =>
                        updateConfig(
                          "ports",
                          config.ports.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  targetPort: Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <Select
                      value={port.protocol}
                      onValueChange={(protocol) => {
                        if (protocol) {
                          updateConfig(
                            "ports",
                            config.ports.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, protocol }
                                : item,
                            ),
                          );
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Port protocol">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tcp">TCP</SelectItem>
                        <SelectItem value="udp">UDP</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove port"
                      onClick={() =>
                        updateConfig(
                          "ports",
                          config.ports.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium text-sm">Persistent volumes</h3>
                <p className="text-muted-foreground text-xs">
                  Mount named Docker volumes or host-managed volume sources.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addVolume}
              >
                <Plus data-icon="inline-start" /> Add volume
              </Button>
            </div>
            {config.volumes.map((volume, index) => (
              <div
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
                key={`${volume.source}-${index}`}
              >
                <Input
                  value={volume.source}
                  aria-label="Volume source"
                  placeholder="volume-name"
                  onChange={(event) =>
                    updateConfig(
                      "volumes",
                      config.volumes.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, source: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Input
                  value={volume.target}
                  aria-label="Volume target"
                  placeholder="/var/lib/app"
                  onChange={(event) =>
                    updateConfig(
                      "volumes",
                      config.volumes.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, target: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <label className="flex items-center gap-2 px-2 text-muted-foreground text-xs">
                  <Switch
                    checked={volume.readOnly}
                    onCheckedChange={(readOnly) =>
                      updateConfig(
                        "volumes",
                        config.volumes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, readOnly } : item,
                        ),
                      )
                    }
                  />{" "}
                  Read-only
                </label>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove volume"
                  onClick={() =>
                    updateConfig(
                      "volumes",
                      config.volumes.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <FieldGroup className="grid gap-5 lg:grid-cols-2">
            <Field>
              <FieldLabel>Resource limits</FieldLabel>
              <FieldDescription>
                CPU is measured in cores; memory is measured in MB.
              </FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min={0.01}
                  step={0.25}
                  placeholder="CPU limit"
                  value={config.resources.cpuLimit ?? ""}
                  onChange={(event) =>
                    updateConfig("resources", {
                      ...config.resources,
                      cpuLimit: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={1}
                  step={256}
                  placeholder="Memory limit (MB)"
                  value={config.resources.memoryLimitMb ?? ""}
                  onChange={(event) =>
                    updateConfig("resources", {
                      ...config.resources,
                      memoryLimitMb: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0.01}
                  step={0.25}
                  placeholder="CPU reservation"
                  value={config.resources.cpuReservation ?? ""}
                  onChange={(event) =>
                    updateConfig("resources", {
                      ...config.resources,
                      cpuReservation: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={1}
                  step={256}
                  placeholder="Memory reservation (MB)"
                  value={config.resources.memoryReservationMb ?? ""}
                  onChange={(event) =>
                    updateConfig("resources", {
                      ...config.resources,
                      memoryReservationMb: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </Field>
            <Field>
              <FieldLabel>Restart policy</FieldLabel>
              <FieldDescription>
                Control how Swarm recovers failed tasks.
              </FieldDescription>
              <Select
                value={config.restartPolicy.condition}
                onValueChange={(condition) => {
                  if (condition) {
                    updateConfig("restartPolicy", {
                      ...config.restartPolicy,
                      condition,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Always</SelectItem>
                  <SelectItem value="on-failure">On failure</SelectItem>
                  <SelectItem value="none">Never</SelectItem>
                </SelectContent>
              </Select>
              <FieldGroup className="grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  placeholder="Max attempts"
                  value={config.restartPolicy.maxAttempts ?? ""}
                  onChange={(event) =>
                    updateConfig("restartPolicy", {
                      ...config.restartPolicy,
                      maxAttempts: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Delay (s)"
                  value={config.restartPolicy.delaySeconds ?? ""}
                  onChange={(event) =>
                    updateConfig("restartPolicy", {
                      ...config.restartPolicy,
                      delaySeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Window (s)"
                  value={config.restartPolicy.windowSeconds ?? ""}
                  onChange={(event) =>
                    updateConfig("restartPolicy", {
                      ...config.restartPolicy,
                      windowSeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </FieldGroup>
            </Field>
            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="placement-constraints">
                Placement constraints
              </FieldLabel>
              <FieldDescription>
                One Docker Swarm constraint per line, for example
                node.labels.region == eu.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  id="placement-constraints"
                  language="shell"
                  height="90px"
                  value={config.placementConstraints.join("\n")}
                  onChange={(value) =>
                    updateConfig("placementConstraints", splitLines(value))
                  }
                  aria-label="Placement constraints"
                />
              </CodeSurface>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-5 lg:grid-cols-2">
            <Field>
              <FieldLabel>Service runtime</FieldLabel>
              <FieldDescription>
                Container identity and replica controls.
              </FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  placeholder="Replicas"
                  value={config.replicas ?? ""}
                  onChange={(event) =>
                    updateConfig(
                      "replicas",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Stop grace (s)"
                  value={config.stopGracePeriodSeconds ?? ""}
                  onChange={(event) =>
                    updateConfig(
                      "stopGracePeriodSeconds",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
                <Input
                  placeholder="Working directory"
                  value={config.workingDir ?? ""}
                  onChange={(event) =>
                    updateConfig("workingDir", event.target.value || undefined)
                  }
                />
                <Input
                  placeholder="User (UID or name)"
                  value={config.user ?? ""}
                  onChange={(event) =>
                    updateConfig("user", event.target.value || undefined)
                  }
                />
                <Input
                  placeholder="Hostname"
                  value={config.hostname ?? ""}
                  onChange={(event) =>
                    updateConfig("hostname", event.target.value || undefined)
                  }
                />
              </div>
            </Field>
            <Field>
              <FieldLabel>Networking</FieldLabel>
              <FieldDescription>
                One value per line for DNS and extra host entries.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  language="shell"
                  height="120px"
                  value={[
                    ...config.dns,
                    ...config.dnsSearch,
                    ...config.extraHosts,
                  ].join("\n")}
                  onChange={(value) => {
                    const lines = splitLines(value);
                    updateConfig("dns", lines.slice(0, config.dns.length));
                    updateConfig("dnsSearch", []);
                    updateConfig("extraHosts", lines.slice(config.dns.length));
                  }}
                  aria-label="DNS and extra host entries"
                />
              </CodeSurface>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel>Health check</FieldLabel>
            <FieldDescription>
              Configure the container health command and timing.
            </FieldDescription>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
              <CodeSurface>
                <CodeEditor
                  language="shell"
                  height="90px"
                  value={config.healthcheck?.command.join("\n") ?? ""}
                  onChange={(value) =>
                    updateConfig(
                      "healthcheck",
                      value.trim()
                        ? {
                            command: splitLines(value),
                            intervalSeconds:
                              config.healthcheck?.intervalSeconds ?? 30,
                            timeoutSeconds:
                              config.healthcheck?.timeoutSeconds ?? 5,
                            retries: config.healthcheck?.retries ?? 3,
                            startPeriodSeconds:
                              config.healthcheck?.startPeriodSeconds ?? 10,
                          }
                        : null,
                    )
                  }
                  aria-label="Health check command"
                />
              </CodeSurface>
              {(
                [
                  "intervalSeconds",
                  "timeoutSeconds",
                  "retries",
                  "startPeriodSeconds",
                ] as const
              ).map((key) => (
                <Input
                  key={key}
                  type="number"
                  min={key === "startPeriodSeconds" ? 0 : 1}
                  placeholder={key.replace("Seconds", " (s)")}
                  value={config.healthcheck?.[key] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value
                      ? Number(event.target.value)
                      : 0;
                    updateConfig(
                      "healthcheck",
                      config.healthcheck
                        ? { ...config.healthcheck, [key]: value }
                        : {
                            command: ["CMD-SHELL", "true"],
                            intervalSeconds: 30,
                            timeoutSeconds: 5,
                            retries: 3,
                            startPeriodSeconds: 10,
                            [key]: value,
                          },
                    );
                  }}
                />
              ))}
            </div>
          </Field>

          <FieldGroup className="grid gap-5 lg:grid-cols-2">
            <Field>
              <FieldLabel>Rolling update</FieldLabel>
              <FieldDescription>
                Control how Swarm replaces tasks during deployment.
              </FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Parallelism"
                  value={config.updateConfig.parallelism ?? ""}
                  onChange={(event) =>
                    updateConfig("updateConfig", {
                      ...config.updateConfig,
                      parallelism: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Delay (s)"
                  value={config.updateConfig.delaySeconds ?? ""}
                  onChange={(event) =>
                    updateConfig("updateConfig", {
                      ...config.updateConfig,
                      delaySeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Select
                  value={config.updateConfig.failureAction ?? "pause"}
                  onValueChange={(failureAction) =>
                    failureAction &&
                    updateConfig("updateConfig", {
                      ...config.updateConfig,
                      failureAction: failureAction as
                        | "continue"
                        | "pause"
                        | "rollback",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Failure action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pause">Pause</SelectItem>
                    <SelectItem value="continue">Continue</SelectItem>
                    <SelectItem value="rollback">Rollback</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={config.updateConfig.order ?? "stop-first"}
                  onValueChange={(order) =>
                    order &&
                    updateConfig("updateConfig", {
                      ...config.updateConfig,
                      order: order as "stop-first" | "start-first",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Update order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop-first">Stop first</SelectItem>
                    <SelectItem value="start-first">Start first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field>
              <FieldLabel>Rollback behavior</FieldLabel>
              <FieldDescription>
                Define the fallback strategy when an update fails.
              </FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Parallelism"
                  value={config.rollbackConfig.parallelism ?? ""}
                  onChange={(event) =>
                    updateConfig("rollbackConfig", {
                      ...config.rollbackConfig,
                      parallelism: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Delay (s)"
                  value={config.rollbackConfig.delaySeconds ?? ""}
                  onChange={(event) =>
                    updateConfig("rollbackConfig", {
                      ...config.rollbackConfig,
                      delaySeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <Select
                  value={config.rollbackConfig.failureAction ?? "pause"}
                  onValueChange={(failureAction) =>
                    failureAction &&
                    updateConfig("rollbackConfig", {
                      ...config.rollbackConfig,
                      failureAction: failureAction as "continue" | "pause",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Failure action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pause">Pause</SelectItem>
                    <SelectItem value="continue">Continue</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={config.rollbackConfig.order ?? "stop-first"}
                  onValueChange={(order) =>
                    order &&
                    updateConfig("rollbackConfig", {
                      ...config.rollbackConfig,
                      order: order as "stop-first" | "start-first",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rollback order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop-first">Stop first</SelectItem>
                    <SelectItem value="start-first">Start first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-5 lg:grid-cols-3">
            <KeyValueEditor
              id="advanced-sysctls"
              label="Sysctls"
              description="Kernel parameters passed to the container."
              value={config.sysctls}
              onChange={(sysctls) => updateConfig("sysctls", sysctls)}
            />
            <Field>
              <FieldLabel>Added capabilities</FieldLabel>
              <FieldDescription>
                One Linux capability per line.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  language="shell"
                  height="100px"
                  value={config.capAdd.join("\n")}
                  onChange={(value) =>
                    updateConfig("capAdd", splitLines(value))
                  }
                  aria-label="Added capabilities"
                />
              </CodeSurface>
            </Field>
            <Field>
              <FieldLabel>Dropped capabilities</FieldLabel>
              <FieldDescription>
                One Linux capability per line.
              </FieldDescription>
              <CodeSurface>
                <CodeEditor
                  language="shell"
                  height="100px"
                  value={config.capDrop.join("\n")}
                  onChange={(value) =>
                    updateConfig("capDrop", splitLines(value))
                  }
                  aria-label="Dropped capabilities"
                />
              </CodeSurface>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {(
              [
                [
                  "init",
                  "Init process",
                  "Run an init process inside the container.",
                ],
                [
                  "readOnlyRootFilesystem",
                  "Read-only root filesystem",
                  "Prevent writes outside mounted volumes.",
                ],
                [
                  "tty",
                  "Allocate TTY",
                  "Allocate a pseudo-terminal for interactive workloads.",
                ],
                [
                  "privileged",
                  "Privileged mode",
                  "Pass extended capabilities to the container.",
                ],
              ] as const
            ).map(([key, label, description]) => (
              <Field orientation="horizontal" key={key}>
                <FieldContent>
                  <FieldLabel htmlFor={`advanced-${key}`}>{label}</FieldLabel>
                  <FieldDescription>{description}</FieldDescription>
                </FieldContent>
                <Switch
                  id={`advanced-${key}`}
                  checked={config[key]}
                  onCheckedChange={(value) => updateConfig(key, value)}
                />
              </Field>
            ))}
          </FieldGroup>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Badge variant="outline">Applies on next deploy</Badge>
            <Button
              type="button"
              onClick={() => saveConfig()}
              disabled={update.isPending}
            >
              <Save data-icon="inline-start" />{" "}
              {update.isPending ? "Saving…" : "Save advanced settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced configuration JSON</CardTitle>
          <CardDescription>
            Power users can edit the complete typed configuration directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-5">
          <CodeSurface>
            <CodeEditor
              language="json"
              height="420px"
              value={rawJson}
              onChange={setRawJson}
              aria-label="Advanced resource configuration JSON"
            />
          </CodeSurface>
          <div className={cn("mt-3 flex justify-end")}>
            <Button
              type="button"
              variant="outline"
              onClick={saveRawJson}
              disabled={update.isPending}
            >
              Validate &amp; save JSON
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
