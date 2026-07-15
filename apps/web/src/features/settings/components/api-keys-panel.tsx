"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { API_KEY_PERMISSION_ACTIONS, type ApiKeyPreset } from "@upstand/domain";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Checkbox } from "@upstand/ui/components/checkbox";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Copy, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const PRESETS: Array<{
  value: ApiKeyPreset;
  label: string;
  description: string;
}> = [
  {
    value: "read-only",
    label: "Read-only",
    description: "Inspect organization resources and status.",
  },
  {
    value: "deployment",
    label: "Deployment",
    description: "Read and operate deployment workflows.",
  },
  {
    value: "operations",
    label: "Operations",
    description: "Manage deployments, backups, and Swarm operations.",
  },
  {
    value: "mcp-read-only",
    label: "MCP read-only",
    description: "Use read-only MCP tools.",
  },
  {
    value: "full-access",
    label: "Full access",
    description: "All supported API and MCP capabilities.",
  },
];

export function ApiKeysPanel() {
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const organizationId = activeOrganization?.id || "";
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ApiKeyPreset>("read-only");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [advanced, setAdvanced] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  const keys = useQuery({
    ...trpc.apiKey.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const create = useMutation({
    ...trpc.apiKey.create.mutationOptions(),
    onSuccess: (result) => {
      setSecret(result.secret);
      setName("");
      void keys.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    ...trpc.apiKey.revoke.mutationOptions(),
    onSuccess: () => {
      toast.success("API key revoked");
      void keys.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const permissionSelection = useMemo(
    () => ({
      upstand: selectedPermissions,
      mcp: preset === "mcp-read-only" ? ["read"] : [],
    }),
    [preset, selectedPermissions],
  );

  function togglePermission(permission: string, checked: boolean) {
    setSelectedPermissions((current) =>
      checked
        ? [...new Set([...current, permission])]
        : current.filter((item) => item !== permission),
    );
  }

  function createKey() {
    if (!organizationId || !name.trim()) return;
    create.mutate({
      organizationId,
      name: name.trim(),
      preset: advanced ? undefined : preset,
      permissions: advanced ? permissionSelection : undefined,
      expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      rateLimitEnabled: true,
      rateLimitTimeWindowMs: 3_600_000,
      rateLimitMax: 1_000,
    });
  }

  if (!organizationId) {
    return (
      <p className="text-muted-foreground text-sm">
        Select a workspace to manage API keys.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-border/40 bg-card/25 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">
            Create an API key
          </CardTitle>
          <CardDescription className="text-xs">
            Secrets are shown once, hashed by Better Auth, and rate limited
            through Redis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 border-border/10 border-t pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="key-name"
                className="font-medium text-foreground/80 text-xs"
              >
                Name
              </Label>
              <Input
                id="key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="CI deployment key"
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="key-expiration"
                className="font-medium text-foreground/80 text-xs"
              >
                Expiration (days)
              </Label>
              <Input
                id="key-expiration"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="key-preset"
              className="font-medium text-foreground/80 text-xs"
            >
              Permission preset
            </Label>
            <Select
              value={preset}
              disabled={advanced}
              onValueChange={(value) => {
                if (value) setPreset(value as ApiKeyPreset);
              }}
            >
              <SelectTrigger
                id="key-preset"
                className="h-9 w-full text-xs"
                aria-label="Permission preset"
              >
                <SelectValue placeholder="Select a permission preset" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-xs"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {PRESETS.find((item) => item.value === preset)?.description}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-foreground/80 text-xs">
            <Checkbox
              checked={advanced}
              onCheckedChange={(checked) => setAdvanced(checked === true)}
            />
            Use advanced permissions
          </label>
          {advanced ? (
            <div className="grid grid-cols-1 gap-2 rounded-md border border-border/40 bg-background/30 p-3 sm:grid-cols-2">
              {API_KEY_PERMISSION_ACTIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex cursor-pointer items-center gap-2 font-medium text-foreground/80 text-xs"
                >
                  <Checkbox
                    checked={selectedPermissions.includes(permission)}
                    onCheckedChange={(checked) =>
                      togglePermission(permission, checked === true)
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={createKey}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? "Creating…" : "Create API key"}
            </Button>
          </div>
          {secret ? (
            <div className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Copy this secret now. It cannot be recovered.
              </p>
              <code className="break-all rounded border bg-background/50 p-2 font-mono text-[11px]">
                {secret}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(secret);
                  toast.success("Secret copied");
                }}
                className="w-fit"
              >
                <Copy className="mr-2 size-3.5" />
                Copy secret
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-border/40 bg-card/25 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">
            Organization keys
          </CardTitle>
          <CardDescription className="text-xs">
            Revoked and expired keys cannot be used, even if cached clients
            retry.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 border-border/10 border-t pt-5">
          {keys.data?.apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border/40 bg-background/30 p-3 text-xs"
            >
              <div className="mr-auto">
                <p className="font-semibold text-foreground/90">
                  {key.name || "Unnamed key"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {key.start || key.prefix || "key"} · expires{" "}
                  {key.expiresAt
                    ? new Date(key.expiresAt).toLocaleDateString()
                    : "never"}
                </p>
              </div>
              <Badge
                variant={key.enabled ? "secondary" : "destructive"}
                className="px-2 py-0.5 text-[10px]"
              >
                {key.enabled ? "Active" : "Disabled"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => revoke.mutate({ organizationId, keyId: key.id })}
                disabled={revoke.isPending}
                className="h-8 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Revoke
              </Button>
            </div>
          ))}
          {!keys.data?.apiKeys.length ? (
            <p className="py-2 text-center text-muted-foreground text-xs">
              No API keys yet.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-4 text-emerald-600" />
        Organization keys never create browser sessions.
      </div>
    </div>
  );
}
