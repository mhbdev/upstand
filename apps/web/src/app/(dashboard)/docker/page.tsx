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
import { Database, RefreshCw, Server, Terminal, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { DockerContainerTerminalDialog } from "@/components/docker-container-terminal-dialog";
import { authClient } from "@/lib/auth-client";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

const kinds = [
  "info",
  "containers",
  "images",
  "volumes",
  "networks",
  "services",
  "logs",
  "stats",
] as const;

export default function DockerInventoryPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id || "";
  const [serverId, setServerId] = useState("local");
  const [kind, setKind] = useState<(typeof kinds)[number]>("containers");
  const [containerId, setContainerId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [since, setSince] = useState("");
  const [tail, setTail] = useState("150");
  const [logSearch, setLogSearch] = useState("");
  const [logLevels, setLogLevels] = useState<string[]>([]);
  const [volumeDestination, setVolumeDestination] = useState("/");
  const [containerDestination, setContainerDestination] = useState("/tmp");
  const [terminalContainer, setTerminalContainer] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const serversQuery = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const inventoryQuery = useQuery({
    ...trpc.server.inventory.queryOptions({
      organizationId,
      serverId,
      kind,
      containerId:
        (kind === "logs" || kind === "stats") && containerId
          ? containerId
          : undefined,
      serviceName: kind === "logs" && serviceName ? serviceName : undefined,
      search: kind === "containers" && search ? search : undefined,
      state:
        kind === "containers" && state
          ? (state as
              | "created"
              | "running"
              | "paused"
              | "restarting"
              | "removing"
              | "exited"
              | "dead")
          : undefined,
      since:
        kind === "logs" && since
          ? Math.floor(new Date(since).getTime() / 1000)
          : undefined,
      searchLogs: kind === "logs" && logSearch ? logSearch : undefined,
      logLevels:
        kind === "logs" && logLevels.length > 0
          ? (logLevels as Array<
              "error" | "warning" | "success" | "info" | "debug"
            >)
          : undefined,
      tail: Math.min(1000, Math.max(1, Number(tail) || 150)),
    }),
    enabled: Boolean(organizationId),
    refetchInterval:
      kind === "stats" ? 5_000 : kind === "info" ? 10_000 : false,
  });
  const controlContainer = useMutation({
    ...trpc.server.controlContainer.mutationOptions(),
    onSuccess: () => {
      toast.success("Container command completed");
      void inventoryQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const controlResource = useMutation({
    ...trpc.server.controlResource.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker resource removed");
      void inventoryQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const uploadVolume = async (volumeName: string, file: File) => {
    if (!organizationId) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const params = new URLSearchParams({
        organizationId,
        destination: volumeDestination || "/",
      });
      if (serverId !== "local") params.set("serverId", serverId);
      const response = await fetch(
        `${getServerUrl()}/api/docker/volumes/${encodeURIComponent(volumeName)}/upload?${params.toString()}`,
        { method: "POST", body: formData, credentials: "include" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Volume upload failed");
      toast.success(`Archive uploaded to ${volumeName}`);
      void inventoryQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Volume upload failed",
      );
    }
  };

  const uploadContainer = async (containerId: string, file: File) => {
    if (!organizationId) return;
    if (!file.name.toLowerCase().endsWith(".tar")) {
      toast.error("Only uncompressed .tar archives are supported");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Container archives must not exceed 50 MB");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const params = new URLSearchParams({
        organizationId,
        destination: containerDestination || "/tmp",
      });
      if (serverId !== "local") params.set("serverId", serverId);
      const response = await fetch(
        `${getServerUrl()}/api/docker/containers/${encodeURIComponent(containerId)}/upload?${params.toString()}`,
        { method: "POST", body: formData, credentials: "include" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Container upload failed");
      toast.success("Archive uploaded to container");
      void inventoryQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Container upload failed",
      );
    }
  };

  const renderData = () => {
    const value = inventoryQuery.data;
    if (typeof value === "string") return value;
    return JSON.stringify(value ?? null, null, 2);
  };

  return (
    <DashboardPage className="flex-1">
      <DashboardPageHeader
        title="Docker Inventory"
        icon={<Database className="size-6 text-primary" />}
        description="Inspect containers, images, volumes, services, daemon info, and filtered logs across local and remote Docker targets."
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() => inventoryQuery.refetch()}
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Docker explorer</CardTitle>
          <CardDescription>
            Every query is restricted to servers in the active organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Docker target</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={serverId}
                onChange={(event) => setServerId(event.target.value)}
              >
                <option value="local">Local Docker</option>
                {(serversQuery.data ?? []).map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} · {server.ipAddress}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Resource</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as (typeof kinds)[number])
                }
              >
                {kinds.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            {kind === "containers" ? (
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, image, label"
              />
            ) : (
              <Input
                value={containerId}
                onChange={(event) => setContainerId(event.target.value)}
                placeholder="Container ID (logs/stats)"
                disabled={kind !== "logs" && kind !== "stats"}
              />
            )}
            {kind === "containers" ? (
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={state}
                onChange={(event) => setState(event.target.value)}
                aria-label="Container state"
              >
                <option value="">All states</option>
                {[
                  "created",
                  "running",
                  "paused",
                  "restarting",
                  "removing",
                  "exited",
                  "dead",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                placeholder="Service name (logs)"
                disabled={kind !== "logs"}
              />
            )}
          </div>
          {kind === "logs" && (
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                type="number"
                min={1}
                max={1000}
                value={tail}
                onChange={(event) => setTail(event.target.value)}
                aria-label="Log line count"
              />
              <span className="text-muted-foreground text-xs">lines</span>
              <Input
                className="w-52"
                type="datetime-local"
                value={since}
                onChange={(event) => setSince(event.target.value)}
                aria-label="Logs since"
              />
              <Input
                className="w-52"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Search log text"
                aria-label="Search log text"
              />
              <select
                multiple
                className="h-20 w-32 rounded-md border bg-background px-2 py-1 text-xs"
                value={logLevels}
                onChange={(event) =>
                  setLogLevels(
                    Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  )
                }
                aria-label="Log levels"
              >
                {(
                  ["error", "warning", "success", "info", "debug"] as const
                ).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Server className="size-4" />
            {inventoryQuery.isPending
              ? "Loading Docker data…"
              : "Live read-only inventory"}
          </div>
          <pre className="max-h-[min(65svh,700px)] overflow-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-5">
            {renderData()}
          </pre>
          {kind === "containers" && Array.isArray(inventoryQuery.data) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs">
                <span className="text-muted-foreground">
                  Container upload destination
                </span>
                <Input
                  className="h-8 w-44 font-mono"
                  value={containerDestination}
                  onChange={(event) =>
                    setContainerDestination(event.target.value)
                  }
                  placeholder="/tmp"
                  aria-label="Container upload destination"
                />
                <span className="text-muted-foreground">
                  Select a container below and upload a safe .tar archive.
                </span>
              </div>
              {inventoryQuery.data.map((container) => (
                <div
                  key={String((container as { id?: string }).id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-mono">
                      {(container as { name?: string }).name ||
                        (container as { id?: string }).id}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                      <span>
                        mounts:{" "}
                        {(
                          (container as { mounts?: string[] }).mounts ?? []
                        ).join(", ") || "—"}
                      </span>
                      <span>
                        networks:{" "}
                        {(
                          (container as { networks?: string[] }).networks ?? []
                        ).join(", ") || "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const id = (container as { id?: string }).id;
                        if (!id) return;
                        setTerminalContainer({
                          id,
                          name: (container as { name?: string }).name || id,
                        });
                      }}
                    >
                      <Terminal className="size-3" />
                      terminal
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium hover:bg-muted">
                      <Upload className="size-3" /> upload
                      <input
                        type="file"
                        accept=".tar,application/x-tar"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          const id = (container as { id?: string }).id;
                          if (file && id) void uploadContainer(id, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {(["start", "stop", "restart", "remove"] as const).map(
                      (command) => (
                        <Button
                          key={command}
                          size="sm"
                          variant={
                            command === "remove" ? "destructive" : "outline"
                          }
                          disabled={controlContainer.isPending}
                          onClick={() => {
                            const id = (container as { id?: string }).id;
                            if (!id) return;
                            if (
                              command === "remove" &&
                              !window.confirm("Force remove this container?")
                            )
                              return;
                            controlContainer.mutate({
                              organizationId,
                              serverId,
                              containerId: id,
                              command,
                            });
                          }}
                        >
                          {command}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {kind === "volumes" && Array.isArray(inventoryQuery.data) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs">
                <span className="text-muted-foreground">
                  Upload destination
                </span>
                <Input
                  className="h-8 w-44 font-mono"
                  value={volumeDestination}
                  onChange={(event) => setVolumeDestination(event.target.value)}
                  placeholder="/"
                  aria-label="Volume upload destination"
                />
                <span className="text-muted-foreground">
                  Select a volume below and upload a safe .tar archive.
                </span>
              </div>
              {inventoryQuery.data.map((volume) => {
                const item = volume as { name?: string; driver?: string };
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <span className="font-mono">
                      {item.name} · {item.driver}
                    </span>
                    <div className="flex items-center gap-1">
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium hover:bg-muted">
                        <Upload className="size-3" /> upload
                        <input
                          type="file"
                          accept=".tar,application/x-tar"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file && item.name)
                              void uploadVolume(item.name, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={controlResource.isPending}
                        onClick={() => {
                          if (!item.name) return;
                          if (!window.confirm(`Remove volume '${item.name}'?`))
                            return;
                          controlResource.mutate({
                            organizationId,
                            serverId,
                            resourceId: item.name,
                            command: "remove-volume",
                          });
                        }}
                      >
                        remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {kind === "images" && Array.isArray(inventoryQuery.data) && (
            <div className="space-y-2">
              {inventoryQuery.data.map((image) => {
                const item = image as {
                  id?: string;
                  tags?: string[];
                  sizeBytes?: number;
                };
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono">
                        {(item.tags ?? []).join(", ") || item.id}
                      </div>
                      <div className="text-muted-foreground">
                        {item.id} ·{" "}
                        {Math.round((item.sizeBytes ?? 0) / 1024 / 1024)} MB
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={controlResource.isPending}
                      onClick={() => {
                        if (!item.id) return;
                        if (!window.confirm(`Force remove image '${item.id}'?`))
                          return;
                        controlResource.mutate({
                          organizationId,
                          serverId,
                          resourceId: item.id,
                          command: "remove-image",
                        });
                      }}
                    >
                      remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {kind === "networks" && Array.isArray(inventoryQuery.data) && (
            <div className="space-y-2">
              {inventoryQuery.data.map((network) => {
                const item = network as {
                  id?: string;
                  name?: string;
                  driver?: string;
                };
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <span className="font-mono">
                      {item.name} · {item.driver}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={controlResource.isPending}
                      onClick={() => {
                        if (!item.id) return;
                        if (!window.confirm(`Remove network '${item.name}'?`))
                          return;
                        controlResource.mutate({
                          organizationId,
                          serverId,
                          resourceId: item.id,
                          command: "remove-network",
                        });
                      }}
                    >
                      remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <DockerContainerTerminalDialog
        open={terminalContainer !== null}
        onOpenChange={(open) => {
          if (!open) setTerminalContainer(null);
        }}
        organizationId={organizationId}
        serverId={serverId}
        container={terminalContainer}
      />
    </DashboardPage>
  );
}
