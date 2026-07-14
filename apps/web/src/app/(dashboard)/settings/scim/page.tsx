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
import { Input } from "@upstand/ui/components/input";
import { Copy, KeyRound, RotateCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function ScimSettingsPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id || "";
  const [providerId, setProviderId] = useState("identity-provider");
  const [newToken, setNewToken] = useState<string | null>(null);
  const providersQuery = useQuery({
    ...trpc.scim.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const create = useMutation({
    ...trpc.scim.create.mutationOptions(),
    onSuccess: (result) => {
      setNewToken(result.token);
      setProviderId("");
      void providersQuery.refetch();
      toast.success("SCIM provider created; copy the token now");
    },
    onError: (error) => toast.error(error.message),
  });
  const rotate = useMutation({
    ...trpc.scim.rotate.mutationOptions(),
    onSuccess: (result) => {
      setNewToken(result.token);
      void providersQuery.refetch();
      toast.success("SCIM token rotated; the previous token is invalid");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.scim.remove.mutationOptions(),
    onSuccess: () => {
      void providersQuery.refetch();
      toast.success("SCIM provider revoked");
    },
    onError: (error) => toast.error(error.message),
  });

  const copyToken = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    toast.success("SCIM token copied");
  };

  return (
    <DashboardPage className="flex-1">
      <DashboardPageHeader
        title="SCIM Provisioning"
        icon={<KeyRound className="size-6 text-primary" />}
        description="Provision and deactivate organization members from an identity provider using SCIM 2.0."
      />
      <Card>
        <CardHeader>
          <CardTitle>Create provider token</CardTitle>
          <CardDescription>
            Tokens are hashed at rest and shown only once after creation or
            rotation. Use the endpoint shown below with a bearer token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              placeholder="identity-provider"
            />
            <Button
              disabled={
                !organizationId || !providerId.trim() || create.isPending
              }
              onClick={() =>
                create.mutate({ organizationId, providerId: providerId.trim() })
              }
            >
              Create token
            </Button>
          </div>
          {newToken && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="font-medium text-sm">Copy this token now</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={newToken}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void copyToken()}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Endpoint:{" "}
                {typeof window === "undefined" ? "" : window.location.origin}
                /api/scim/v2.0/{organizationId}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active provider tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(providersQuery.data ?? []).map((provider) => (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <div className="font-medium">{provider.providerId}</div>
                <div className="font-mono text-muted-foreground text-xs">
                  {provider.tokenPrefix}… · /api/scim/v2.0/{organizationId}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    rotate.mutate({ organizationId, id: provider.id })
                  }
                >
                  <RotateCw className="mr-1 size-3" /> Rotate
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm("Revoke this SCIM provider token?"))
                      return;
                    remove.mutate({ organizationId, id: provider.id });
                  }}
                >
                  <Trash2 className="mr-1 size-3" /> Revoke
                </Button>
              </div>
            </div>
          ))}
          {!providersQuery.isPending && providersQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No SCIM providers configured.
            </p>
          )}
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
