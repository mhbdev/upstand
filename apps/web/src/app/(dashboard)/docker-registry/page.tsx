"use client";

import {
  ContainerIcon,
  Database01Icon,
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function DockerRegistryPage() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [imagePrefix, setImagePrefix] = useState("");
  const [registryUrl, setRegistryUrl] = useState("");
  const [serverId, setServerId] = useState("");

  const { data: registries = [], refetch } = useQuery({
    ...trpc.dockerRegistry.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    ...trpc.dockerRegistry.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker Registry added successfully!");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add registry");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.dockerRegistry.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker Registry deleted successfully!");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete registry");
    },
  });

  const updateMutation = useMutation({
    ...trpc.dockerRegistry.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker Registry updated successfully!");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (err: any) =>
      toast.error(err.message || "Failed to update registry"),
  });

  const testConnectionMutation = useMutation({
    ...trpc.dockerRegistry.testConnection.mutationOptions(),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Test connection failed");
    },
  });

  const resetForm = () => {
    setName("");
    setUsername("");
    setPassword("");
    setImagePrefix("");
    setRegistryUrl("");
    setServerId("");
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate({
      organizationId,
      username,
      password,
      registryUrl,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      organizationId,
      name,
      username: username || null,
      imagePrefix: imagePrefix || null,
      registryUrl: registryUrl || null,
      serverId: serverId || null,
    };
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        ...payload,
        ...(password ? { password } : {}),
      });
    } else {
      createMutation.mutate({ ...payload, password: password || null });
    }
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (reg: any) => {
    setEditingId(reg.id);
    setName(reg.name);
    setUsername(reg.username || "");
    setPassword("");
    setImagePrefix(reg.imagePrefix || "");
    setRegistryUrl(reg.registryUrl || "");
    setServerId(reg.serverId || "");
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this Docker Registry?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Docker Registry"
        description="Configure external Docker registries to publish and pull images during deployments."
        icon={
          <HugeiconsIcon icon={ContainerIcon} className="size-6 text-primary" />
        }
        actions={
          <Button onClick={openCreate} className="gap-2 font-medium">
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add External Registry
          </Button>
        }
      />

      {registries && registries.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {registries.map((reg: any) => (
            <Card
              key={reg.id}
              className="relative overflow-hidden border-border/40 bg-card/30"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="font-semibold text-base">
                    {reg.name}
                  </CardTitle>
                  <CardDescription className="font-mono text-muted-foreground text-xs">
                    {reg.registryUrl || "Docker Hub"}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(reg)}
                    className="size-8"
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(reg.id)}
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-2 text-muted-foreground text-xs">
                <div className="flex flex-col gap-1">
                  <div>
                    <span className="font-medium text-foreground">
                      Username:{" "}
                    </span>
                    {reg.username || "Anonymous"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      Image Prefix:{" "}
                    </span>
                    {reg.imagePrefix || "None"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed bg-card/10 p-12 text-center">
          <HugeiconsIcon
            icon={Database01Icon}
            className="mx-auto size-12 text-muted-foreground/50"
          />
          <h2 className="mt-4 font-semibold text-foreground text-lg">
            No External Registries
          </h2>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">
            Add custom Docker registries (such as GHCR, Amazon ECR, self-hosted
            registries, etc.) to configure deployment pipelines.
          </p>
          <Button onClick={openCreate} className="mt-6 gap-2">
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add Registry
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit External Registry" : "Add External Registry"}
            </DialogTitle>
            <DialogDescription>
              Provide connection details to link and authenticate with your
              custom Docker registry.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Registry Name</Label>
              <Input
                id="name"
                required
                placeholder="My Registry"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="e.g. janesmith"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password / Token</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="imagePrefix">Image Prefix</Label>
              <Input
                id="imagePrefix"
                placeholder="e.g. my-company"
                value={imagePrefix}
                onChange={(e) => setImagePrefix(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="registryUrl">Registry URL</Label>
              <Input
                id="registryUrl"
                placeholder="e.g. https://ghcr.io"
                value={registryUrl}
                onChange={(e) => setRegistryUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serverId">Server (Optional)</Label>
              <Input
                id="serverId"
                placeholder="Server ID"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testConnectionMutation.isPending}
              >
                {testConnectionMutation.isPending
                  ? "Testing..."
                  : "Test Registry"}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingId
                    ? "Save"
                    : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
