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
import { Copy, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";

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

export default function ApiKeysPage() {
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

  return (
    <DashboardPage className="max-w-5xl gap-6">
      <DashboardPageHeader
        title="API keys"
        icon={<KeyRound className="size-6 text-primary" />}
        description="Create organization keys for REST, tRPC, CI, and MCP integrations."
      />

      <Card>
        <CardHeader>
          <CardTitle>Create an API key</CardTitle>
          <CardDescription>
            Secrets are shown once, hashed by Better Auth, and rate limited
            through Redis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="CI deployment key"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-expiration">Expiration (days)</Label>
              <Input
                id="key-expiration"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-preset">Permission preset</Label>
            <Select
              value={preset}
              disabled={advanced}
              onValueChange={(value) => {
                if (value) setPreset(value as ApiKeyPreset);
              }}
            >
              <SelectTrigger
                id="key-preset"
                className="w-full"
                aria-label="Permission preset"
              >
                <SelectValue placeholder="Select a permission preset" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {PRESETS.find((item) => item.value === preset)?.description}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={advanced}
              onCheckedChange={(checked) => setAdvanced(checked === true)}
            />
            Use advanced permissions
          </label>
          {advanced ? (
            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
              {API_KEY_PERMISSION_ACTIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex items-center gap-2 text-sm"
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
          <Button
            onClick={createKey}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create API key"}
          </Button>
          {secret ? (
            <div className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium">
                Copy this secret now. It cannot be recovered.
              </p>
              <code className="break-all">{secret}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(secret);
                  toast.success("Secret copied");
                }}
              >
                <Copy data-icon="inline-start" />
                Copy secret
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization keys</CardTitle>
          <CardDescription>
            Revoked and expired keys cannot be used, even if cached clients
            retry.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {keys.data?.apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-md border p-3"
            >
              <div className="mr-auto">
                <p className="font-medium">{key.name || "Unnamed key"}</p>
                <p className="text-muted-foreground text-xs">
                  {key.start || key.prefix || "key"} · expires{" "}
                  {key.expiresAt
                    ? new Date(key.expiresAt).toLocaleDateString()
                    : "never"}
                </p>
              </div>
              <Badge variant={key.enabled ? "secondary" : "destructive"}>
                {key.enabled ? "Active" : "Disabled"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => revoke.mutate({ organizationId, keyId: key.id })}
                disabled={revoke.isPending}
              >
                <Trash2 data-icon="inline-start" />
                Revoke
              </Button>
            </div>
          ))}
          {!keys.data?.apiKeys.length ? (
            <p className="py-4 text-muted-foreground text-sm">
              No API keys yet.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <ShieldCheck className="size-4" />
        Organization keys never create browser sessions.
      </div>
    </DashboardPage>
  );
}
