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
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
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

export default function CustomRolesPage() {
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

  return (
    <DashboardPage className="flex-1">
      <DashboardPageHeader
        title="Custom Roles"
        description="Create reusable organization permission policies and assign them from Members & Permissions."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Create role</CardTitle>
            <CardDescription>
              Custom roles are organization-scoped and auditable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Platform operator"
            />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Can deploy but cannot manage billing"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex items-center gap-2 text-xs"
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
            <Button
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Organization roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(rolesQuery.data ?? []).map((role) => (
              <div
                key={role.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <div className="font-medium">{role.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {role.description || "No description"}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {role.permissions.join(", ")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate({ organizationId, id: role.id })}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!rolesQuery.isPending && rolesQuery.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No custom roles created.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPage>
  );
}
