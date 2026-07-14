"use client";

import { useQuery } from "@tanstack/react-query";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@upstand/ui/components/dropdown-menu";
import { cn } from "@upstand/ui/lib/utils";
import {
  CircleX,
  Code,
  FileText,
  HardDrive,
  Network,
  Play,
  RotateCw,
  Settings,
  Square,
  Terminal,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { toast } from "sonner";
import { ShowDockerLogs } from "@/components/shared/docker-logs";
import { authClient } from "@/lib/auth-client";
import { getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

type ContainerItem = {
  id: string;
  name: string;
  status: string;
  ports: string;
  node: string;
};

interface ContainersTabProps {
  resource: any;
  liveContainers: any;
  containerLogsData: any;
  controlContainer: any;
  isControllingContainer: boolean;
  setContainerModalOpen: (open: boolean) => void;
  setSelectedContainerId: (id: string | null) => void;
}

const parseContainerItems = (
  value: string | null | undefined,
): ContainerItem[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const id = typeof item.id === "string" ? item.id : undefined;
      if (!id) return [];
      return [
        {
          id,
          name: typeof item.name === "string" ? item.name : "container",
          status: typeof item.status === "string" ? item.status : "unknown",
          ports: typeof item.ports === "string" ? item.ports : "",
          node: typeof item.node === "string" ? item.node : "",
        },
      ];
    });
  } catch {
    return [];
  }
};

function resourceIngressNetwork(resource: any): {
  name: string;
  scope: string;
} {
  let isolated = false;
  try {
    const config = JSON.parse(resource.advancedConfig || "{}");
    isolated = config.isolatedDeployment === true;
  } catch {
    // Legacy resources use the shared network by default.
  }

  if (!isolated) {
    return {
      name: "upstand-network",
      scope: "Shared across non-isolated resources, projects, and environments",
    };
  }

  const suffix = String(resource.id)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  return {
    name: `upstand-resource-${suffix}`.slice(0, 63),
    scope:
      "Dedicated to this resource; Caddy is attached only while it has routes",
  };
}

export function ContainersTab({
  resource,
  liveContainers,
  containerLogsData,
  controlContainer,
  isControllingContainer,
  setContainerModalOpen,
  setSelectedContainerId,
}: ContainersTabProps) {
  const { data: organization } = authClient.useActiveOrganization();
  const [containerList, setContainerList] = useState<ContainerItem[]>([]);
  const [selectedContainer, setSelectedContainer] =
    useState<ContainerItem | null>(null);
  const [containerModalType, setContainerModalType] = useState<
    "logs" | "config" | "networks" | "mounts" | null
  >(null);
  const [terminalContainer, setTerminalContainer] =
    useState<ContainerItem | null>(null);

  useEffect(() => {
    if (liveContainers) {
      setContainerList(liveContainers);
    } else if (resource) {
      setContainerList(parseContainerItems(resource.containers));
    }
  }, [resource, liveContainers]);

  const dispatchContainerCommand = (
    containerId: string,
    command: "start" | "stop" | "restart" | "kill",
  ) => {
    toast.info(`Sending ${command} command to container...`);
    controlContainer({
      resourceId: resource.id,
      containerId,
      command,
    });
  };

  const uploadToContainer = (container: ContainerItem) => {
    const destination = window.prompt(
      "Absolute destination directory inside the container",
      "/tmp",
    );
    if (!destination || !organization?.id) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".tar,application/x-tar";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const params = new URLSearchParams({
          organizationId: organization.id,
          destination,
          resourceId: resource.id,
        });
        const response = await fetch(
          `${getServerUrl()}/api/docker/containers/${encodeURIComponent(container.id)}/upload?${params.toString()}`,
          { method: "POST", body: formData, credentials: "include" },
        );
        const result = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(result.error || "Container upload failed");
        toast.success(`Archive uploaded to ${container.name}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Container upload failed",
        );
      }
    };
    input.click();
  };

  const containerLogs = containerLogsData
    ? containerLogsData.trim().split("\n")
    : [];
  const ingressNetwork = resourceIngressNetwork(resource);

  const handleOpenModal = (
    container: ContainerItem,
    type: "logs" | "config" | "networks" | "mounts",
  ) => {
    setSelectedContainer(container);
    setContainerModalType(type);
    setSelectedContainerId(container.id);
    setContainerModalOpen(true);
  };

  const handleCloseModal = () => {
    setContainerModalType(null);
    setContainerModalOpen(false);
    setSelectedContainerId(null);
  };

  const getEnvMap = () => {
    try {
      const parsed = JSON.parse(resource.envVars || "{}");
      return parsed;
    } catch {
      return {};
    }
  };

  return (
    <>
      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            {resource.type === "compose"
              ? resource.composeType === "compose"
                ? "Docker Compose Containers"
                : "Swarm Stack Replicas"
              : "Active Swarm Replicas"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            {resource.type === "compose" && resource.composeType === "compose"
              ? "Containers belonging to this Docker Compose project."
              : "Containers matching the deployed resource service specification."}
          </CardDescription>
        </CardHeader>
        <CardContent className="border-border/20 border-t pt-4">
          {containerList.length > 0 ? (
            <div className="overflow-hidden border border-border/20 bg-card/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                    <th className="p-3">Replica Name</th>
                    <th className="p-3">Docker Container ID</th>
                    <th className="p-3">State</th>
                    <th className="p-3">Ports</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {containerList.map((con) => (
                    <tr
                      key={con.id}
                      className="border-border/10 border-b hover:bg-muted/5"
                    >
                      <td className="p-3 font-semibold text-foreground">
                        {con.name}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground text-xs">
                        {con.id}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              con.status === "running"
                                ? "animate-pulse bg-emerald-500"
                                : "bg-muted-foreground/50",
                            )}
                          />
                          <span className="font-semibold text-foreground text-xs uppercase">
                            {con.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-zinc-300">
                        {con.ports}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {con.node}
                      </td>
                      <td className="p-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                            <Settings className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 border border-border/45 bg-card shadow-xl"
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                dispatchContainerCommand(con.id, "restart")
                              }
                            >
                              <RotateCw className="mr-2 size-4" /> Restart
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                dispatchContainerCommand(con.id, "start")
                              }
                            >
                              <Play className="mr-2 size-4" /> Start
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                dispatchContainerCommand(con.id, "stop")
                              }
                            >
                              <Square className="mr-2 size-4 text-destructive" />{" "}
                              Stop
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isControllingContainer}
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                dispatchContainerCommand(con.id, "kill")
                              }
                            >
                              <CircleX className="mr-2 size-4" /> Kill
                            </DropdownMenuItem>
                            <hr className="my-1 border-border/20" />
                            <DropdownMenuItem
                              onClick={() => handleOpenModal(con, "logs")}
                            >
                              <FileText className="mr-2 size-4" /> View Logs
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenModal(con, "config")}
                            >
                              <Code className="mr-2 size-4" /> View Config
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenModal(con, "networks")}
                            >
                              <Network className="mr-2 size-4" /> View Networks
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenModal(con, "mounts")}
                            >
                              <HardDrive className="mr-2 size-4" /> View Mounts
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setTerminalContainer(con)}
                            >
                              <Terminal className="mr-2 size-4" /> Open Terminal
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => uploadToContainer(con)}
                            >
                              <Upload className="mr-2 size-4" /> Upload .tar
                              archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No containers.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Container detail dialogs */}
      <Dialog
        open={containerModalType !== null}
        onOpenChange={(v) => !v && handleCloseModal()}
      >
        <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,48rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:min-w-[36rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-foreground text-lg">
              {containerModalType === "logs" && (
                <FileText className="size-5 text-primary" />
              )}
              {containerModalType === "config" && (
                <Code className="size-5 text-amber-500" />
              )}
              {containerModalType === "networks" && (
                <Network className="size-5 text-emerald-500" />
              )}
              {containerModalType === "mounts" && (
                <HardDrive className="size-5 text-violet-500" />
              )}
              <span className="capitalize">{containerModalType}</span>:{" "}
              {selectedContainer?.name}
            </DialogTitle>
            <DialogDescription className="font-normal text-muted-foreground text-xs">
              Swarm replica ID: {selectedContainer?.id}
            </DialogDescription>
          </DialogHeader>

          {containerModalType === "logs" && (
            <ShowDockerLogs
              containerId={selectedContainer?.id || ""}
              logs={containerLogs}
            />
          )}

          {containerModalType === "config" && (
            <pre className="max-h-80 select-text overflow-auto rounded-md border border-border/40 bg-muted/20 p-4 font-mono text-xs">
              {JSON.stringify(
                {
                  Image: resource.dockerImage || "app:latest",
                  Service: resource.appName,
                  Labels: {
                    "swarm.service.name": resource.appName,
                    "upstand.resource.id": resource.id,
                  },
                  RestartPolicy: {
                    Name: "on-failure",
                    MaximumRetryCount: 3,
                  },
                  Environment: getEnvMap(),
                },
                null,
                2,
              )}
            </pre>
          )}

          {containerModalType === "networks" && (
            <div className="space-y-3 bg-muted/10 p-4 text-foreground text-sm">
              <div className="flex justify-between border-border/10 border-b pb-1.5">
                <span className="text-muted-foreground">Ingress network</span>
                <span className="font-mono font-semibold">
                  {ingressNetwork.name}
                </span>
              </div>
              <div className="flex justify-between border-border/10 border-b pb-1.5">
                <span className="text-muted-foreground">Sharing scope</span>
                <span className="max-w-[14rem] text-right font-semibold text-xs">
                  {ingressNetwork.scope}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                User-defined Compose networks are preserved. Upstand adds this
                ingress network so Caddy and routed services share a stable DNS
                path.
              </p>
            </div>
          )}

          {containerModalType === "mounts" && (
            <div className="space-y-3 bg-muted/10 p-4 text-foreground text-sm">
              <div className="flex flex-col gap-1 border-border/10 border-b pb-2">
                <span className="font-semibold text-muted-foreground text-xs">
                  VOLUME MOUNT
                </span>
                <span className="font-medium text-primary text-xs">
                  Runtime mount details come from the deployed Docker definition
                  and are not guessed by the dashboard.
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Driver</span>
                <span className="font-mono font-semibold text-xs">
                  local (overlayfs)
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button onClick={handleCloseModal}>Close View</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ContainerTerminalDialog
        resourceId={resource.id}
        container={terminalContainer}
        onClose={() => setTerminalContainer(null)}
      />
    </>
  );
}

function ContainerTerminalDialog({
  resourceId,
  container,
  onClose,
}: {
  resourceId: string;
  container: ContainerItem | null;
  onClose(): void;
}) {
  const { data: organization } = authClient.useActiveOrganization();
  const { data: keys = [] } = useQuery({
    ...trpc.sshKey.list.queryOptions({
      organizationId: organization?.id || "",
    }),
    enabled: Boolean(organization?.id && container),
  });
  const [keyId, setKeyId] = useState("");
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const socket = useState<{ current: WebSocket | null }>({ current: null })[0];

  useEffect(() => {
    if (!container) {
      socket.current?.close();
      socket.current = null;
      setConnected(false);
      setOutput("");
    }
  }, [container, socket]);

  const connect = async () => {
    if (!organization?.id || !container || !keyId) {
      toast.error("Choose an SSH key first");
      return;
    }
    setConnecting(true);
    try {
      const response = await fetch(
        new URL("/api/container-terminal/session", getServerUrl()),
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId: organization.id,
            resourceId,
            containerId: container.id,
            sshKeyId: keyId,
          }),
        },
      );
      const data = (await response.json()) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.token)
        throw new Error(data.error || "Unable to open terminal");
      const url = new URL(
        `/api/terminal/connect?token=${encodeURIComponent(data.token)}`,
        getServerUrl(),
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        setConnecting(false);
        setConnected(true);
        setOutput("Connected to container.\r\n");
      };
      ws.onmessage = async (event) => {
        const text =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(
                event.data instanceof Blob
                  ? await event.data.arrayBuffer()
                  : event.data,
              );
        setOutput((value) => `${value}${text}`);
      };
      ws.onerror = () => toast.error("Container terminal connection failed");
      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };
    } catch (error) {
      setConnecting(false);
      toast.error(
        error instanceof Error ? error.message : "Unable to open terminal",
      );
    }
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (command && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(`${command}\n`);
      setCommand("");
    }
  };

  return (
    <Dialog
      open={Boolean(container)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="flex h-[min(86svh,760px)] w-[calc(100vw-1rem)] max-w-[min(96vw,64rem)] flex-col">
        <DialogHeader>
          <DialogTitle>Container terminal</DialogTitle>
          <DialogDescription>
            Interactive shell for {container?.name}. The selected SSH key stays
            on the server.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Select
            items={[
              { value: "_none", label: "Select SSH key" },
              ...keys.map((key) => ({
                value: key.id,
                label: `${key.name} · ${key.fingerprint}`,
              })),
            ]}
            value={keyId || "_none"}
            onValueChange={(val) => setKeyId(val === "_none" || !val ? "" : val)}
          >
            <SelectTrigger className="min-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="_none">Select SSH key</SelectItem>
                {keys.map((key) => (
                  <SelectItem key={key.id} value={key.id}>
                    {key.name} · {key.fingerprint}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button onClick={connect} disabled={connecting || connected}>
            {connecting ? "Connecting…" : "Connect"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-[#0b0f0d] p-3 font-mono text-foreground text-xs">
          {output || "Disconnected. Choose an SSH key and connect."}
        </pre>
        <DialogFooter>
          <form onSubmit={send} className="flex w-full gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Run a command inside the container"
              disabled={!connected}
            />
            <Button type="submit" disabled={!connected || !command}>
              Run
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
