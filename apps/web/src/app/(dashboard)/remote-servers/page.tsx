"use client";

import {
  CloudServerIcon,
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
  DialogFooter,
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
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

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
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [setupServerId, setSetupServerId] = useState<string | null>(null);
  const [inspectServerId, setInspectServerId] = useState<string | null>(null);

  const { data: servers, refetch } = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  const { data: serverCount } = useQuery({
    ...trpc.server.count.queryOptions({ organizationId }),
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

  const updateMutation = useMutation({
    ...trpc.server.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Server updated successfully!");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update remote server");
    },
  });

  const setupMutation = useMutation({
    ...trpc.server.setup.mutationOptions(),
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast.error("Remote server setup needs attention");
    },
  });

  const resetForm = () => {
    setEditingServerId(null);
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
    const input = {
      organizationId,
      name,
      description: description || null,
      serverType,
      sshKeyId,
      ipAddress,
      port,
      username,
      enableDockerCleanup,
    };
    if (editingServerId) {
      updateMutation.mutate({ ...input, id: editingServerId });
    } else {
      createMutation.mutate(input);
    }
  };

  const handleEdit = (server: {
    id: string;
    name: string;
    description?: string | null;
    serverType: string;
    sshKeyId?: string | null;
    ipAddress: string;
    port: number;
    username: string;
    enableDockerCleanup: boolean;
  }) => {
    setEditingServerId(server.id);
    setName(server.name);
    setDescription(server.description ?? "");
    setServerType(server.serverType);
    setSshKeyId(server.sshKeyId ?? "");
    setIpAddress(server.ipAddress);
    setPort(server.port);
    setUsername(server.username);
    setEnableDockerCleanup(server.enableDockerCleanup);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this remote server?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSetup = (id: string) => {
    setupMutation.reset();
    setSetupServerId(id);
    setupMutation.mutate({ id });
  };

  const setupServer = servers?.find((server) => server.id === setupServerId);
  const validationQuery = useQuery({
    ...trpc.server.validate.queryOptions({
      organizationId,
      serverId: inspectServerId || "",
    }),
    enabled: Boolean(organizationId && inspectServerId),
  });
  const hostTimeQuery = useQuery({
    ...trpc.server.time.queryOptions({
      organizationId,
      serverId: inspectServerId || "",
    }),
    enabled: Boolean(organizationId && inspectServerId),
  });
  const runtimeStatsQuery = useQuery({
    ...trpc.server.runtimeStats.queryOptions({
      organizationId,
      serverId: inspectServerId || "",
    }),
    enabled: Boolean(organizationId && inspectServerId),
  });
  const validationInfo =
    validationQuery.data &&
    typeof validationQuery.data === "object" &&
    !Array.isArray(validationQuery.data)
      ? (validationQuery.data as {
          serverVersion?: string;
          swarmState?: string;
        })
      : undefined;
  const closeSetupDialog = () => {
    if (setupMutation.isPending) return;
    setSetupServerId(null);
    setupMutation.reset();
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
      <DashboardPageHeader
        title={typeof serverCount === "number" ? `Remote Servers (${serverCount})` : "Remote Servers"}
        description="Add isolated deployment servers for applications, databases, and Compose workloads."
        icon={<HugeiconsIcon icon={CloudServerIcon} className="size-6 text-primary" />}
        actions={
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="gap-2 self-start sm:self-auto"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Create Server
          </Button>
        }
      />

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
                    {srv.setupError ? (
                      <p className="mt-2 text-destructive text-xs">
                        {srv.setupError}
                      </p>
                    ) : null}
                    <CardDescription className="text-muted-foreground text-xs">
                      {srv.description || "Deploy server"}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(srv)}
                    className="mr-1 h-8 text-xs"
                  >
                    Edit
                  </Button>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-semibold text-xs"
                      onClick={() => setInspectServerId(srv.id)}
                    >
                      Validate
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
            Provision independent Docker environments through secure SSH. Each
            server owns its Swarm, network, workloads, and routing.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="mt-6 gap-2"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add Server
          </Button>
        </div>
      )}

      {inspectServerId && (
        <Card className="border-border/40 bg-card/30">
          <CardHeader>
            <CardTitle className="text-base">Remote validation</CardTitle>
            <CardDescription>
              Docker info and UTC host time from the selected remote server.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="font-medium">Docker validation</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {validationQuery.isPending
                  ? "Checking Docker…"
                  : validationQuery.isError
                    ? validationQuery.error.message
                    : `${validationInfo?.serverVersion ?? "unknown"} · Swarm ${validationInfo?.swarmState ?? "unknown"}`}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Host time</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {hostTimeQuery.isPending
                  ? "Reading host clock…"
                  : hostTimeQuery.isError
                    ? hostTimeQuery.error.message
                    : hostTimeQuery.data?.iso}
              </p>
            </div>
            <div className="rounded-md border p-3 md:col-span-2">
              <p className="font-medium">Runtime metrics</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {runtimeStatsQuery.isPending
                  ? "Reading Docker runtime…"
                  : runtimeStatsQuery.isError
                    ? runtimeStatsQuery.error.message
                    : runtimeStatsQuery.data
                      ? `${runtimeStatsQuery.data.dockerVersion || "Docker unknown"} · ${runtimeStatsQuery.data.activeContainers} active containers · ${runtimeStatsQuery.data.cpu}% CPU · ${runtimeStatsQuery.data.memoryPercent}% memory`
                      : "No runtime metrics available"}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-fit"
              onClick={() => setInspectServerId(null)}
            >
              Close validation
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingServerId ? "Update Server" : "Create Server"}
            </DialogTitle>
            <DialogDescription>
              {editingServerId
                ? "Update the server role, connection, or cleanup policy. Connection changes require setup again."
                : "Link a remote virtual private server (VPS) by configuring its network and auth credentials."}
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
                  <SelectItem value="build">Build Server</SelectItem>
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
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingServerId
                    ? "Update"
                    : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(setupServer)}
        onOpenChange={(open) => {
          if (!open) closeSetupDialog();
        }}
      >
        <DialogContent
          className="max-w-lg"
          showCloseButton={!setupMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>
              {setupMutation.isSuccess
                ? "Server ready"
                : setupMutation.isError
                  ? "Setup needs attention"
                  : `Setting up ${setupServer?.name ?? "server"}`}
            </DialogTitle>
            <DialogDescription>
              Upstand installs and verifies Docker, initializes this server's
              independent Swarm, creates its network, and starts Caddy routing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              {setupMutation.isPending ? (
                <Spinner className="size-5 shrink-0 text-primary" />
              ) : setupMutation.isSuccess ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 font-bold text-emerald-500 text-xs">
                  ✓
                </span>
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 font-bold text-destructive text-xs">
                  !
                </span>
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {setupServer?.name ?? "Remote server"}
                </p>
                <p className="break-all text-muted-foreground text-xs">
                  {setupServer?.ipAddress}:{setupServer?.port}
                </p>
              </div>
            </div>

            {setupMutation.isPending && (
              <p className="text-muted-foreground text-sm">
                Provisioning Docker, the local Swarm, the Upstand network, and
                the routing service. This can take a few minutes on a new VPS.
              </p>
            )}

            {setupMutation.isSuccess && (
              <p className="text-emerald-600 text-sm dark:text-emerald-400">
                {setupMutation.data.message}
              </p>
            )}

            {setupMutation.isError && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">
                  {setupMutation.error.message}
                </p>
                <p className="text-muted-foreground text-xs">
                  Upstand does not force-leave an existing Swarm. An active
                  existing Swarm can be reused; if initialization failed,
                  resolve the Docker or advertised-address issue on the server,
                  then retry setup.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeSetupDialog}
              disabled={setupMutation.isPending}
            >
              Close
            </Button>
            {setupMutation.isError && setupServerId && (
              <Button
                type="button"
                onClick={() => handleSetup(setupServerId)}
                disabled={setupMutation.isPending}
              >
                Retry setup
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
