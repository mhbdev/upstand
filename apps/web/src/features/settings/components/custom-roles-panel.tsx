"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const PERMISSIONS = [
  "project:view",
  "project:create",
  "project:delete",
  "environment:view",
  "environment:create",
  "environment:delete",
  "resource:view",
  "resource:create",
  "resource:update",
  "resource:delete",
  "ssh_key:view",
  "ssh_key:create",
  "ssh_key:delete",
  "git_provider:view",
  "git_provider:create",
  "git_provider:delete",
  "s3_destination:view",
  "s3_destination:create",
  "s3_destination:delete",
  "docker_registry:view",
  "docker_registry:create",
  "docker_registry:delete",
  "server:view",
  "server:create",
  "server:delete",
  "notification:view",
  "notification:create",
  "notification:update",
  "notification:delete",
] as const;

export function CustomRolesPanel() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id || "";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([
    "project:view",
    "resource:view",
  ]);
  const rolesQuery = useQuery({
    ...trpc.customRole.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const create = useMutation({
    ...trpc.customRole.create.mutationOptions(),
    onSuccess: () => {
      setName("");
      setDescription("");
      void rolesQuery.refetch();
      toast.success("Custom role created");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.customRole.remove.mutationOptions(),
    onSuccess: () => {
      void rolesQuery.refetch();
      toast.success("Custom role removed");
    },
    onError: (error) => toast.error(error.message),
  });

  if (!organizationId) {
    return (
      <p className="text-muted-foreground text-sm">
        Select a workspace to manage custom roles.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="border border-border/40 bg-card/25 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Create role</CardTitle>
            <CardDescription className="text-xs">
              Custom roles are organization-scoped and auditable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 border-t border-border/10 pt-5">
            <div className="space-y-1.5">
              <Label htmlFor="role-name" className="text-xs font-medium text-foreground/80">Role Name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Platform operator"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-description" className="text-xs font-medium text-foreground/80">Description</Label>
              <Input
                id="role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Can deploy but cannot manage billing"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/80">Capabilities</Label>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 rounded-md border border-border/40 bg-background/30 p-3 max-h-48 overflow-y-auto">
                {PERMISSIONS.map((permission) => (
                  <label
                    key={permission}
                    className="flex items-center gap-2 text-xs font-medium text-foreground/80 cursor-pointer"
                  >
                    <Checkbox
                      checked={permissions.includes(permission)}
                      onCheckedChange={(checked) =>
                        setPermissions((current) =>
                          checked
                            ? [...new Set([...current, permission])]
                            : current.filter((item) => item !== permission),
                        )
                      }
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                disabled={!organizationId || !name.trim() || create.isPending}
                onClick={() =>
                  create.mutate({
                    organizationId,
                    name: name.trim(),
                    description: description.trim() || undefined,
                    permissions: permissions as (typeof PERMISSIONS)[number][],
                  })
                }
              >
                Create custom role
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/40 bg-card/25 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Organization roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 border-t border-border/10 pt-5">
            {(rolesQuery.data ?? []).map((role) => (
              <div
                key={role.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-foreground/90">{role.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {role.description || "No description"}
                  </div>
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground break-all bg-background/50 border rounded p-1.5">
                    {role.permissions.join(", ")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove.mutate({ organizationId, id: role.id })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!rolesQuery.isPending && rolesQuery.data?.length === 0 && (
              <p className="text-center py-6 text-muted-foreground text-xs">
                No custom roles created yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
