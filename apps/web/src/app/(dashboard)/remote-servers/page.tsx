"use client";

import {
  Delete02Icon,
  PlusSignIcon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default function RemoteServersPage() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverType, setServerType] = useState("deploy");
  const [sshKeyId, setSshKeyId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("root");
  const [enableDockerCleanup, setEnableDockerCleanup] = useState(false);

  const { data: servers, refetch } = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  const { data: sshKeys } = useQuery({
    ...trpc.sshKey.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    ...trpc.server.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Remote server added successfully!");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add remote server");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.server.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Server deleted successfully!");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete server");
    },
  });

  const setupMutation = useMutation({
    ...trpc.server.setup.mutationOptions(),
    onSuccess: (res) => {
      toast.success(res.message);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start setup");
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setServerType("deploy");
    setSshKeyId("");
    setIpAddress("");
    setPort(22);
    setUsername("root");
    setEnableDockerCleanup(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ipAddress || !sshKeyId) {
      toast.error("Name, IP Address, and SSH Key are required");
      return;
    }
    createMutation.mutate({
      organizationId,
      name,
      description: description || null,
      serverType,
      sshKeyId,
      ipAddress,
      port,
      username,
      enableDockerCleanup,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this remote server?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSetup = (id: string) => {
    setupMutation.mutate({ id });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "ready":
        return "default";
      case "setting_up":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <DashboardPage>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Remote Servers</h1>
          <p className="text-muted-foreground text-sm">
            Add and set up remote servers to deploy containerized services and
            database clusters.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-2 self-start sm:self-auto"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          Create Server
        </Button>
      </div>

      {servers && servers.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((srv) => {
            const matchedKey = sshKeys?.find((k) => k.id === srv.sshKeyId);
            return (
              <Card
                key={srv.id}
                className="relative overflow-hidden border-border/40 bg-card/30"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-semibold text-base">
                        {srv.name}
                      </CardTitle>
                      <Badge
                        variant={getStatusBadgeVariant(srv.status)}
                        className="h-4 px-1.5 font-medium text-[10px] capitalize"
                      >
                        {srv.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <CardDescription className="text-muted-foreground text-xs">
                      {srv.description || "Deploy server"}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(srv.id)}
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 pt-2 text-muted-foreground text-xs">
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <span className="font-medium text-foreground">
                        IP Address:{" "}
                      </span>
                      <span className="font-mono">
                        {srv.ipAddress}:{srv.port}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Type:{" "}
                      </span>
                      <span className="capitalize">
                        {srv.serverType} Server
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        SSH Key:{" "}
                      </span>
                      {matchedKey?.name || "None"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        User:{" "}
                      </span>
                      {srv.username}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="w-full font-semibold text-xs"
                      variant={srv.status === "ready" ? "outline" : "default"}
                      onClick={() => handleSetup(srv.id)}
                      disabled={srv.status === "setting_up"}
                    >
                      {srv.status === "setting_up"
                        ? "Setting up..."
                        : "Setup Server"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed bg-card/10 p-12 text-center">
          <HugeiconsIcon
            icon={ServerStack01Icon}
            className="mx-auto size-12 text-muted-foreground/50"
          />
          <h2 className="mt-4 font-semibold text-foreground text-lg">
            No Remote Servers
          </h2>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">
            Configure your remote nodes via secure SSH tunnels to scale
            deployments across multiple Swarm hosts.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="mt-6 gap-2">
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add Server
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Server</DialogTitle>
            <DialogDescription>
              Link a remote virtual private server (VPS) by configuring its
              network and auth credentials.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                required
                placeholder="Khan Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g. Production deploy instance"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serverType">Server Type</Label>
              <Select
                value={serverType}
                onValueChange={(value) => value && setServerType(value)}
              >
                <SelectTrigger id="serverType" className="w-full">
                  <SelectValue placeholder="Select server type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deploy">Deploy Server</SelectItem>
                  <SelectItem value="database">DB Server</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sshKeyId">Select an SSH Key</Label>
              <Select
                value={sshKeyId}
                onValueChange={(value) => setSshKeyId(value ?? "")}
              >
                <SelectTrigger id="sshKeyId" className="w-full">
                  <SelectValue placeholder="Choose an SSH key" />
                </SelectTrigger>
                <SelectContent>
                  {sshKeys?.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.name} ({key.algorithm})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ipAddress">IP Address</Label>
              <Input
                id="ipAddress"
                required
                placeholder="82.25.116.121"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  required
                  placeholder="22"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  required
                  placeholder="root"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                id="enableDockerCleanup"
                type="checkbox"
                checked={enableDockerCleanup}
                onChange={(e) => setEnableDockerCleanup(e.target.checked)}
                className="size-4 animate-none cursor-pointer rounded border-border/40 text-indigo-600 transition-none focus:ring-indigo-500"
              />
              <Label
                htmlFor="enableDockerCleanup"
                className="cursor-pointer select-none text-xs"
              >
                Enable automatic daily Docker cleanup
              </Label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
