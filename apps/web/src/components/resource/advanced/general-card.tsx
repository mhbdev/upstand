"use client";

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
import { Switch } from "@upstand/ui/components/switch";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { type AdvancedCardProps, splitLines } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// General & Runtime Card
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Covers the most commonly-reached advanced knobs:
 *   • Entrypoint command & command arguments
 *   • Working directory, user, hostname
 *   • Isolated deployment toggle
 *   • Compose-specific: service target name + volume isolation toggle
 */
export function GeneralCard({
  config,
  resourceType,
  onChange,
}: AdvancedCardProps) {
  const isCompose = resourceType === "compose";

  return (
    <Card>
      <CardHeader>
        <CardTitle>General &amp; runtime</CardTitle>
        <CardDescription>
          Container entrypoint, identity, and Compose-specific overrides. All
          values take effect on the next deployment.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 border-t pt-5">
        {/* ── Isolation toggles ── */}
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="advanced-isolated-deployment">
                Isolated deployment
              </FieldLabel>
              <FieldDescription>
                Attach this resource to a dedicated Swarm overlay network so it
                cannot resolve services from other resources.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="advanced-isolated-deployment"
              checked={config.isolatedDeployment}
              onCheckedChange={(value) => onChange("isolatedDeployment", value)}
            />
          </Field>

          {isCompose && (
            <>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="advanced-isolated-volumes">
                    Isolate Compose volumes
                  </FieldLabel>
                  <FieldDescription>
                    Prefix named volumes for this Compose deployment to avoid
                    collisions between isolated instances.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="advanced-isolated-volumes"
                  checked={config.isolatedDeploymentsVolume}
                  onCheckedChange={(value) =>
                    onChange("isolatedDeploymentsVolume", value)
                  }
                />
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="advanced-randomize">
                    Randomize resource names
                  </FieldLabel>
                  <FieldDescription>
                    Append a random suffix to Compose resource names to prevent
                    naming collisions across isolated deployments.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="advanced-randomize"
                  checked={config.randomize}
                  onCheckedChange={(value) => onChange("randomize", value)}
                />
              </Field>
            </>
          )}
        </FieldGroup>

        {/* ── Compose service target ── */}
        {isCompose && (
          <Field>
            <FieldLabel htmlFor="advanced-compose-service">
              Compose service target
            </FieldLabel>
            <FieldDescription>
              Apply the resource-level command, ports, volumes, and limits to
              this service. Leave empty to apply them to every service in the
              Compose project.
            </FieldDescription>
            <Input
              id="advanced-compose-service"
              value={config.serviceName ?? ""}
              onChange={(e) =>
                onChange("serviceName", e.target.value || undefined)
              }
              placeholder="web"
            />
          </Field>
        )}

        {/* ── Entrypoint & args ── */}
        <FieldGroup className="grid gap-5 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="advanced-command">
              Entrypoint command
            </FieldLabel>
            <FieldDescription>
              One argument per line. Leave empty to use the image default.
            </FieldDescription>
            <CodeSurface>
              <CodeEditor
                id="advanced-command"
                language="shell"
                allowLanguageChange={false}
                height="110px"
                value={config.command.join("\n")}
                onChange={(value) => onChange("command", splitLines(value))}
                aria-label="Entrypoint command arguments"
              />
            </CodeSurface>
          </Field>

          <Field>
            <FieldLabel htmlFor="advanced-args">Command arguments</FieldLabel>
            <FieldDescription>
              Arguments are passed after the entrypoint command.
            </FieldDescription>
            <CodeSurface>
              <CodeEditor
                id="advanced-args"
                language="shell"
                allowLanguageChange={false}
                height="110px"
                value={config.args.join("\n")}
                onChange={(value) => onChange("args", splitLines(value))}
                aria-label="Command arguments"
              />
            </CodeSurface>
          </Field>
        </FieldGroup>

        {/* ── Container identity ── */}
        <FieldGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="advanced-working-dir">
              Working directory
            </FieldLabel>
            <FieldDescription>
              Absolute path used as the container&apos;s working directory.
            </FieldDescription>
            <Input
              id="advanced-working-dir"
              placeholder="/app"
              value={config.workingDir ?? ""}
              onChange={(e) =>
                onChange("workingDir", e.target.value || undefined)
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="advanced-user">User</FieldLabel>
            <FieldDescription>
              UID, username, or{" "}
              <span className="font-mono text-xs">uid:gid</span> pair for the
              container process.
            </FieldDescription>
            <Input
              id="advanced-user"
              placeholder="1000 or appuser"
              value={config.user ?? ""}
              onChange={(e) => onChange("user", e.target.value || undefined)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="advanced-hostname">Hostname</FieldLabel>
            <FieldDescription>
              Custom hostname injected into the container&apos;s network
              namespace.
            </FieldDescription>
            <Input
              id="advanced-hostname"
              placeholder="my-service"
              value={config.hostname ?? ""}
              onChange={(e) =>
                onChange("hostname", e.target.value || undefined)
              }
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
