"use client";

import type { ResourceAdvancedConfig } from "@upstand/domain";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Switch } from "@upstand/ui/components/switch";
import { Textarea } from "@upstand/ui/components/textarea";
import { Plus, Trash2 } from "@/components/huge-icons";
import type { AdvancedCardProps } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Ports & Volumes Card
// ──────────────────────────────────────────────────────────────────────────────

type Port = ResourceAdvancedConfig["ports"][number];
type Volume = ResourceAdvancedConfig["volumes"][number];

const DEFAULT_PORT: Port = {
  publishedPort: 8080,
  targetPort: 8080,
  protocol: "tcp",
};

function buildDefaultVolume(resourceId: string): Volume {
  return { source: `${resourceId}-data`, target: "/data", readOnly: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Port row
// ──────────────────────────────────────────────────────────────────────────────

type PortRowProps = {
  port: Port;
  index: number;
  allPorts: Port[];
  onChange: (ports: Port[]) => void;
};

function PortRow({ port, index, allPorts, onChange }: PortRowProps) {
  const update = (partial: Partial<Port>) => {
    onChange(
      allPorts.map((item, i) => (i === index ? { ...item, ...partial } : item)),
    );
  };

  return (
    <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">Published port</Label>
        <Input
          type="number"
          min={1}
          max={65535}
          value={port.publishedPort}
          aria-label="Published port"
          onChange={(e) => update({ publishedPort: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">Target port</Label>
        <Input
          type="number"
          min={1}
          max={65535}
          value={port.targetPort}
          aria-label="Target port"
          onChange={(e) => update({ targetPort: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">Protocol</Label>
        <Select
          value={port.protocol}
          onValueChange={(protocol) => {
            if (protocol === "tcp" || protocol === "udp") {
              update({ protocol });
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
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Remove port"
        className="mb-0.5 self-end"
        onClick={() => onChange(allPorts.filter((_, i) => i !== index))}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Volume row
// ──────────────────────────────────────────────────────────────────────────────

type VolumeRowProps = {
  volume: Volume;
  index: number;
  allVolumes: Volume[];
  onChange: (volumes: Volume[]) => void;
};

function VolumeRow({ volume, index, allVolumes, onChange }: VolumeRowProps) {
  const update = (partial: Partial<Volume>) => {
    onChange(
      allVolumes.map((item, i) =>
        i === index ? { ...item, ...partial } : item,
      ),
    );
  };

  return (
    <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">Source</Label>
        <Input
          value={volume.source}
          aria-label="Volume source"
          placeholder="volume-name"
          onChange={(e) => update({ source: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground text-xs">
          Target (mount path)
        </Label>
        <Input
          value={volume.target}
          aria-label="Volume target"
          placeholder="/var/lib/app"
          onChange={(e) => update({ target: e.target.value })}
        />
      </div>
      <Label className="mb-1.5 flex items-center gap-2 self-end whitespace-nowrap text-muted-foreground text-xs">
        <Switch
          checked={volume.readOnly}
          onCheckedChange={(readOnly) => update({ readOnly })}
        />
        Read-only
      </Label>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Remove volume"
        className="mb-0.5 self-end"
        onClick={() => onChange(allVolumes.filter((_, i) => i !== index))}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Empty-state placeholder
// ──────────────────────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
      {label}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Section header (title + add button)
// ──────────────────────────────────────────────────────────────────────────────

type SectionHeaderProps = {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
};

function SectionHeader({
  title,
  description,
  addLabel,
  onAdd,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onAdd}>
        <Plus data-icon="inline-start" /> {addLabel}
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// PortsVolumesCard — main export
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Manages the list of published ports and persistent volume mounts with
 * structured, per-row editing forms (no freeform text parsing required).
 */
export function PortsVolumesCard({
  config,
  resourceType,
  onChange,
}: AdvancedCardProps) {
  const addPort = () => onChange("ports", [...config.ports, DEFAULT_PORT]);
  const addVolume = () =>
    onChange("volumes", [...config.volumes, buildDefaultVolume(resourceType)]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ports &amp; storage</CardTitle>
        <CardDescription>
          Publish service ports through the Swarm ingress mesh and mount
          persistent Docker volumes or host paths into the container.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-8 border-t pt-5">
        {/* ── Published ports ── */}
        <Field>
          <SectionHeader
            title="Published ports"
            description="Expose service ports through the Swarm ingress mesh."
            addLabel="Add port"
            onAdd={addPort}
          />

          {config.ports.length === 0 ? (
            <EmptyState label="No published ports. Add one to expose the service externally." />
          ) : (
            <div className="flex flex-col gap-3">
              {config.ports.map((port, index) => (
                <PortRow
                  key={`port-${index}`}
                  port={port}
                  index={index}
                  allPorts={config.ports}
                  onChange={(ports) => onChange("ports", ports)}
                />
              ))}
            </div>
          )}
        </Field>

        {/* ── Persistent volumes ── */}
        <Field>
          <SectionHeader
            title="Persistent volumes"
            description="Mount named Docker volumes or host-managed volume sources."
            addLabel="Add volume"
            onAdd={addVolume}
          />

          {config.volumes.length === 0 ? (
            <EmptyState label="No volumes configured. Add one to persist data across deployments." />
          ) : (
            <div className="flex flex-col gap-3">
              {config.volumes.map((volume, index) => (
                <VolumeRow
                  key={`volume-${index}`}
                  volume={volume}
                  index={index}
                  allVolumes={config.volumes}
                  onChange={(volumes) => onChange("volumes", volumes)}
                />
              ))}
            </div>
          )}
        </Field>

        {/* ── DNS & extra hosts ── */}
        <FieldGroup className="grid gap-5 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="advanced-dns">DNS servers</FieldLabel>
            <FieldDescription>
              One DNS server IP per line. Overrides the default container DNS
              resolver.
            </FieldDescription>
            <Textarea
              id="advanced-dns"
              rows={Math.max(2, config.dns.length + 1)}
              className="w-full resize-none font-mono text-sm outline-none"
              placeholder={"8.8.8.8\n1.1.1.1"}
              value={config.dns.join("\n")}
              onChange={(e) =>
                onChange(
                  "dns",
                  e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                )
              }
              aria-label="DNS servers"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="advanced-extra-hosts">Extra hosts</FieldLabel>
            <FieldDescription>
              One <span className="font-mono text-xs">host:IP</span> entry per
              line. Appended to the container&apos;s{" "}
              <span className="font-mono text-xs">/etc/hosts</span>.
            </FieldDescription>
            <Textarea
              id="advanced-extra-hosts"
              rows={Math.max(2, config.extraHosts.length + 1)}
              className="w-full resize-none font-mono text-sm outline-none"
              placeholder={"myhost:192.168.1.1"}
              value={config.extraHosts.join("\n")}
              onChange={(e) =>
                onChange(
                  "extraHosts",
                  e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                )
              }
              aria-label="Extra hosts"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
