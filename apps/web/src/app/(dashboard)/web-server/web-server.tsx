"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  PlusSignIcon,
  ServerStack01Icon,
  Settings01Icon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@upstand/ui/components/dropdown-menu";
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
import { Switch } from "@upstand/ui/components/switch";
import { Textarea } from "@upstand/ui/components/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShowDockerLogs } from "@/components/shared/docker-logs";
import { WebServerTerminalDialog } from "@/components/web-server-terminal-dialog";
import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

interface PortMapping {
  targetPort: number;
  publishedPort: number;
  protocol: "tcp" | "udp";
}

interface EnvVar {
  key: string;
  value: string;
}

export default function WebServerDashboard({
  session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  // Database Web Server settings
  const [email, setEmail] = useState("");
  const [httpPort, setHttpPort] = useState(80);
  const [httpsPort, setHttpsPort] = useState(443);
  const [enableHttp3, setEnableHttp3] = useState(true);
  const [globalCaddyfile, setGlobalCaddyfile] = useState("");
  const [caddySnippets, setCaddySnippets] = useState("");

  // Dialogue States
  const [serverLogsOpen, setServerLogsOpen] = useState(false);
  const [gpuModalOpen, setGpuModalOpen] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [portsModalOpen, setPortsModalOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Additional settings states
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [portMappings, setPortMappings] = useState<PortMapping[]>([]);

  // Log views
  const [caddyLogsTail, setCaddyLogsTail] = useState(100);
  const [serverLogsTail, setServerLogsTail] = useState(100);
  const [caddyLogsCopied, setCaddyLogsCopied] = useState(false);
  const [serverLogsCopied, setServerLogsCopied] = useState(false);
  const [autoRefreshCaddyLogs, setAutoRefreshCaddyLogs] = useState(true);
  const [autoRefreshServerLogs, setAutoRefreshServerLogs] = useState(true);

  // 1. Fetch Caddy/server settings and container status
  const {
    data: info,
    isPending: loadingInfo,
    refetch: refetchInfo,
  } = useQuery({
    ...trpc.webServer.getSettings.queryOptions(),
    refetchInterval: 15000,
  });

  // 2. Fetch Caddy logs
  const {
    data: caddyLogs,
    isPending: loadingCaddyLogs,
    refetch: refetchCaddyLogs,
  } = useQuery({
    ...trpc.webServer.getLogs.queryOptions({ tail: caddyLogsTail }),
    refetchInterval: autoRefreshCaddyLogs ? 5000 : false,
  });

  // 3. Fetch Server logs
  const {
    data: serverLogs,
    isPending: loadingServerLogs,
    refetch: refetchServerLogs,
  } = useQuery({
    ...trpc.webServer.getServerLogs.queryOptions({ tail: serverLogsTail }),
    refetchInterval: serverLogsOpen && autoRefreshServerLogs ? 5000 : false,
    enabled: serverLogsOpen,
  });

  // 4. Fetch GPU Status
  const {
    data: gpuStatus,
    isPending: loadingGpu,
    refetch: refetchGpu,
  } = useQuery({
    ...trpc.webServer.checkGpuStatus.queryOptions(),
    enabled: gpuModalOpen,
  });

  // 5. Fetch Updates status
  const { data: updateData, refetch: refetchUpdates } = useQuery({
    ...trpc.webServer.getUpdateData.queryOptions(),
  });

  // Sync state with fetched settings
  useEffect(() => {
    if (info?.settings) {
      setEmail(info.settings.letsEncryptEmail || "");
      setHttpPort(info.settings.httpPort);
      setHttpsPort(info.settings.httpsPort);
      setEnableHttp3(info.settings.enableHttp3);
      setGlobalCaddyfile(info.settings.globalCaddyfile || "");
      setCaddySnippets(info.settings.caddySnippets || "");

      // Sync Environment variables
      try {
        const parsedEnv = JSON.parse(info.settings.caddyEnvironment || "{}");
        const list = Object.entries(parsedEnv).map(([k, v]) => ({
          key: k,
          value: String(v),
        }));
        setEnvVars(list);
      } catch {
        setEnvVars([]);
      }

      // Sync Ports
      try {
        const parsedPorts = JSON.parse(info.settings.caddyPorts || "[]");
        setPortMappings(parsedPorts);
      } catch {
        setPortMappings([]);
      }
    }
  }, [info]);

  // Mutations
  const updateSettingsMutation = useMutation({
    ...trpc.webServer.updateSettings.mutationOptions(),
    onSuccess: () => {
      toast.success("Web Server settings updated successfully");
      refetchInfo();
      refetchCaddyLogs();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update settings");
    },
  });

  const reloadMutation = useMutation({
    ...trpc.webServer.reload.mutationOptions(),
    onSuccess: (_, variables) => {
      const act = variables.action === "restart" ? "restarted" : "reloaded";
      toast.success(`Caddy proxy successfully ${act}`);
      refetchInfo();
      refetchCaddyLogs();
    },
    onError: (err) => {
      toast.error(err.message || "Operation failed");
    },
  });

  const reloadServerMutation = useMutation({
    ...trpc.webServer.reloadServer.mutationOptions(),
    onSuccess: () => {
      toast.success("Upstand server restart command issued successfully");
      setTimeout(() => refetchInfo(), 3000);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to restart server container");
    },
  });

  const updateServerIpMutation = useMutation({
    ...trpc.webServer.updateServerIp.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Server public IP updated to: ${data.ip}`);
      refetchInfo();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update Server IP");
    },
  });

  const cleanRedisMutation = useMutation({
    ...trpc.webServer.cleanRedis.mutationOptions(),
    onSuccess: () => {
      toast.success("Redis database flushed successfully (flushall)");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to flush Redis");
    },
  });

  const reloadRedisMutation = useMutation({
    ...trpc.webServer.reloadRedis.mutationOptions(),
    onSuccess: () => {
      toast.success("Redis container restarted successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to restart Redis container");
    },
  });

  const cleanAllDeploymentQueueMutation = useMutation({
    ...trpc.webServer.cleanAllDeploymentQueue.mutationOptions(),
    onSuccess: () => {
      toast.success(
        "Deployment queue cleaned. Stuck deployments marked as failed.",
      );
    },
    onError: (err) => {
      toast.error(err.message || "Failed to clean deployment queue");
    },
  });

  const cleanUnusedImagesMutation = useMutation({
    ...trpc.webServer.cleanUnusedImages.mutationOptions(),
    onSuccess: () => {
      toast.success("Unused Docker images pruned successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to prune images");
    },
  });

  const cleanUnusedVolumesMutation = useMutation({
    ...trpc.webServer.cleanUnusedVolumes.mutationOptions(),
    onSuccess: () => {
      toast.success("Unused Docker volumes pruned successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to prune volumes");
    },
  });

  const cleanStoppedContainersMutation = useMutation({
    ...trpc.webServer.cleanStoppedContainers.mutationOptions(),
    onSuccess: () => {
      toast.success("Stopped Docker containers pruned successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to prune containers");
    },
  });

  const cleanDockerBuilderMutation = useMutation({
    ...trpc.webServer.cleanDockerBuilder.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker build cache cleaned successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to clean builder cache");
    },
  });

  const cleanDockerPruneMutation = useMutation({
    ...trpc.webServer.cleanDockerPrune.mutationOptions(),
    onSuccess: () => {
      toast.success("Docker system prune completed successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to run system prune");
    },
  });

  const cleanAllMutation = useMutation({
    ...trpc.webServer.cleanAll.mutationOptions(),
    onSuccess: () => {
      toast.success("Comprehensive background Docker cleanup started");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start cleanup");
    },
  });

  const setupGpuMutation = useMutation({
    ...trpc.webServer.setupGpuSupport.mutationOptions(),
    onSuccess: () => {
      toast.success(
        "NVIDIA GPU support configured. Docker daemon restarting...",
      );
      setGpuModalOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to setup GPU support");
    },
  });

  const triggerUpdateMutation = useMutation({
    ...trpc.webServer.triggerUpdate.mutationOptions(),
    onSuccess: () => {
      toast.success(
        "Self-update initiated successfully! The system is updating in the background.",
      );
      refetchUpdates();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start self-update");
    },
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate({
      letsEncryptEmail: email.trim() || null,
      httpPort,
      httpsPort,
      enableHttp3,
      globalCaddyfile: globalCaddyfile.trim() || null,
      caddySnippets,
    });
  };

  const handleCopyLogs = async (type: "caddy" | "server") => {
    const text = type === "caddy" ? caddyLogs : serverLogs;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === "caddy") {
        setCaddyLogsCopied(true);
        setTimeout(() => setCaddyLogsCopied(false), 2000);
      } else {
        setServerLogsCopied(true);
        setTimeout(() => setServerLogsCopied(false), 2000);
      }
      toast.success("Logs copied to clipboard");
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  const handleCheckUpdates = async () => {
    toast.info("Checking for Upstand updates...");
    const res = await refetchUpdates();
    if (res.data?.channel === "source") {
      toast.info(
        "This source installation is updated by rerunning the installer.",
      );
    } else if (res.data?.updateAvailable) {
      toast.success(`A new version is available: ${res.data.latestVersion}!`, {
        description:
          "You can click 'Update Now' next to the version below to update.",
      });
    } else {
      toast.success(
        `Upstand is up to date (${res.data?.currentVersion || "v0.1.0"})`,
        {
          description: "No new updates found.",
        },
      );
    }
  };

  const handleToggleDailyCleanup = (checked: boolean) => {
    updateSettingsMutation.mutate({
      dailyDockerCleanup: checked,
    });
  };

  // Environment variables helpers
  const handleAddEnv = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleUpdateEnv = (
    idx: number,
    field: "key" | "value",
    val: string,
  ) => {
    const next = [...envVars];
    if (next[idx]) {
      next[idx][field] = val;
      setEnvVars(next);
    }
  };

  const handleRemoveEnv = (idx: number) => {
    setEnvVars(envVars.filter((_, i) => i !== idx));
  };

  const handleSaveEnv = () => {
    const obj: Record<string, string> = {};
    for (const item of envVars) {
      if (item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    updateSettingsMutation.mutate({
      caddyEnvironment: JSON.stringify(obj),
    });
    setEnvModalOpen(false);
  };

  // Ports helpers
  const handleAddPort = () => {
    setPortMappings([
      ...portMappings,
      { targetPort: 80, publishedPort: 80, protocol: "tcp" },
    ]);
  };

  const handleUpdatePort = (
    idx: number,
    field: keyof PortMapping,
    val: any,
  ) => {
    const next = [...portMappings];
    if (next[idx]) {
      next[idx] = {
        ...next[idx],
        [field]: val,
      };
      setPortMappings(next);
    }
  };

  const handleRemovePort = (idx: number) => {
    setPortMappings(portMappings.filter((_, i) => i !== idx));
  };

  const handleSavePorts = () => {
    const filtered = portMappings.filter(
      (p) => p.targetPort > 0 && p.publishedPort > 0,
    );
    updateSettingsMutation.mutate({
      caddyPorts: JSON.stringify(filtered),
    });
    setPortsModalOpen(false);
  };

  const isSaving = updateSettingsMutation.isPending;
  const isOperating = reloadMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-border/40 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl text-foreground">
            <HugeiconsIcon
              icon={ServerStack01Icon}
              className="size-6 text-primary"
            />
            Web Server (Caddy)
          </h1>
          <p className="text-muted-foreground text-sm">
            Configure dynamic domain routing, global SSL settings, ACME Let's
            Encrypt certificates, and review live proxy access logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchInfo();
              refetchCaddyLogs();
            }}
            className="text-xs"
          >
            Refresh Status
          </Button>
        </div>
      </div>

      {loadingInfo ? (
        <div className="flex min-h-60 items-center justify-center">
          <Spinner className="size-8" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ─── WEB SERVER OPERATIONS PANEL ────────────────────────────────── */}
          <Card className="border border-border/40 bg-card/20 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-semibold text-lg">
                <HugeiconsIcon
                  icon={ServerStack01Icon}
                  className="size-5 text-primary"
                />
                Web Server Control Panel
              </CardTitle>
              <CardDescription className="text-xs">
                Reload, configure, or clean the proxy and node services.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 border-border/10 border-t pt-5">
              {/* Dropdowns Row */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {/* Server Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between border-border/60 font-semibold"
                      >
                        Server
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-4 rotate-90 opacity-60"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuPortal>
                    <DropdownMenuContent className="w-56 bg-popover text-popover-foreground">
                      <DropdownMenuItem
                        onClick={() => reloadServerMutation.mutate()}
                      >
                        Reload (Restart Server)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setServerLogsOpen(true)}>
                        View Logs
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTerminalOpen(true)}>
                        Open Terminal
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGpuModalOpen(true)}>
                        GPU Setup
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateServerIpMutation.mutate()}
                      >
                        Update Server IP
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanRedisMutation.mutate()}
                      >
                        Clean Redis
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanAllDeploymentQueueMutation.mutate()}
                      >
                        Clean all deployment queue
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => reloadRedisMutation.mutate()}
                      >
                        Reload Redis
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>

                {/* Caddy Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between border-border/60 font-semibold"
                      >
                        Caddy
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-4 rotate-90 opacity-60"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuPortal>
                    <DropdownMenuContent className="w-56 bg-popover text-popover-foreground">
                      <DropdownMenuItem
                        onClick={() =>
                          reloadMutation.mutate({ action: "reload" })
                        }
                      >
                        Reload
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          reloadMutation.mutate({ action: "restart" })
                        }
                      >
                        Restart Container
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEnvModalOpen(true)}>
                        Modify Environment
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPortsModalOpen(true)}>
                        Additional Port Mappings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>

                {/* Space Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between border-border/60 font-semibold"
                      >
                        Space
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-4 rotate-90 opacity-60"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuPortal>
                    <DropdownMenuContent className="w-56 bg-popover text-popover-foreground">
                      <DropdownMenuItem
                        onClick={() => cleanUnusedImagesMutation.mutate()}
                      >
                        Clean unused images
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanUnusedVolumesMutation.mutate()}
                      >
                        Clean unused volumes
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanStoppedContainersMutation.mutate()}
                      >
                        Clean stopped containers
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          toast.success(
                            "Build and git repository caches cleaned successfully",
                          )
                        }
                      >
                        Clean Patch Caches
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanDockerBuilderMutation.mutate()}
                      >
                        Clean Docker Builder
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanDockerPruneMutation.mutate()}
                      >
                        Clean Docker System
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cleanAllMutation.mutate()}
                      >
                        Clean all
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>

                {/* Check for updates Button */}
                <Button
                  variant="outline"
                  className="w-full justify-center border-border/60 font-semibold"
                  onClick={handleCheckUpdates}
                >
                  Check for updates
                </Button>
              </div>

              {/* Status footer information */}
              <div className="flex flex-col gap-4 border-border/10 border-t pt-4 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span>Server IP:</span>
                    <span className="font-mono text-foreground">
                      {info?.settings?.serverIp || "Detecting..."}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 hover:bg-muted/20"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          info?.settings?.serverIp || "",
                        );
                        toast.success("IP copied to clipboard");
                      }}
                      disabled={!info?.settings?.serverIp}
                    >
                      <HugeiconsIcon icon={Copy01Icon} className="size-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Version:</span>
                    <span className="font-semibold text-foreground">
                      {updateData?.currentVersion || "Loading…"}
                    </span>
                    {updateData?.updateAvailable && updateData.canUpdate && (
                      <Button
                        size="xs"
                        variant="default"
                        className="cursor-pointer bg-indigo-600 font-semibold text-[10px] text-white hover:bg-indigo-700"
                        onClick={() => {
                          if (
                            confirm(
                              `Are you sure you want to update Upstand to ${updateData.latestVersion}? This will pull the latest version and update all services in the cluster.`,
                            )
                          ) {
                            triggerUpdateMutation.mutate({
                              version: updateData.latestVersion,
                            });
                          }
                        }}
                        disabled={triggerUpdateMutation.isPending}
                      >
                        {triggerUpdateMutation.isPending
                          ? "Updating..."
                          : `Update to ${updateData.latestVersion}`}
                      </Button>
                    )}
                    {updateData?.channel && (
                      <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {updateData.channel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="daily-cleanup"
                      className="cursor-pointer text-xs"
                    >
                      Daily Docker Cleanup
                    </Label>
                    <Switch
                      id="daily-cleanup"
                      checked={info?.settings?.dailyDockerCleanup || false}
                      onCheckedChange={handleToggleDailyCleanup}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Uptime and stats */}
            <div className="space-y-6 lg:col-span-1">
              <Card className="border border-border/40 bg-card/20 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="font-semibold text-lg">
                    Server Status
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Real-time status of the proxy container
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 border-border/10 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Container State
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          info?.status?.running
                            ? "animate-pulse bg-emerald-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span className="font-semibold text-foreground text-sm capitalize">
                        {info?.status?.status || "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Uptime
                    </span>
                    <span className="font-mono text-foreground text-sm">
                      {info?.status?.uptime || "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Active Port Mappings
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      {info?.status?.ports && info.status.ports.length > 0 ? (
                        info.status.ports.map((port: string, idx: number) => (
                          <span
                            key={idx}
                            className="font-mono text-xs text-zinc-300"
                          >
                            {port}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          None
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Connected Domains
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-bold text-primary text-xs">
                      {info?.status?.activeDomainsCount || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* General Configurations & Custom Caddyfile */}
            <div className="space-y-6 lg:col-span-2">
              <form onSubmit={handleSaveSettings}>
                <Card className="border border-border/40 bg-card/20 shadow-sm">
                  <CardHeader>
                    <CardTitle className="font-semibold text-lg">
                      General Settings
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Configure port bindings and automatic SSL generation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 border-border/10 border-t pt-4">
                    {/* Let's Encrypt Email */}
                    <div className="space-y-2">
                      <Label htmlFor="lets-encrypt-email" className="text-xs">
                        Let's Encrypt Email Address
                      </Label>
                      <Input
                        id="lets-encrypt-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. ssl-admin@yourdomain.com"
                        className="border-border/40 bg-card/30"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Let's Encrypt will notify this email address about
                        certificate renewals or issues.
                      </p>
                    </div>

                    {/* Ports configurations */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="http-port" className="text-xs">
                          Caddy HTTP listener
                        </Label>
                        <Input
                          id="http-port"
                          type="number"
                          min={1}
                          max={65535}
                          value={httpPort}
                          onChange={(e) =>
                            setHttpPort(Number(e.target.value) || 80)
                          }
                          className="border-border/40 bg-card/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="https-port" className="text-xs">
                          Caddy HTTPS listener
                        </Label>
                        <Input
                          id="https-port"
                          type="number"
                          min={1}
                          max={65535}
                          value={httpsPort}
                          onChange={(e) =>
                            setHttpsPort(Number(e.target.value) || 443)
                          }
                          className="border-border/40 bg-card/30"
                        />
                      </div>
                    </div>

                    {/* HTTP/3 Toggle */}
                    <div className="flex items-center justify-between rounded-lg border border-border/20 bg-muted/5 p-3">
                      <div className="space-y-0.5">
                        <Label className="font-semibold text-foreground text-xs">
                          Enable HTTP/3 (QUIC)
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Enables UDP port bindings and protocol handshakes for
                          modern web performance.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={enableHttp3}
                        onChange={(e) => setEnableHttp3(e.target.checked)}
                        className="h-4 w-4 rounded border-border/40 accent-primary"
                      />
                    </div>

                    {/* Custom Global Options Overrides */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="global-caddyfile-overrides"
                        className="text-xs"
                      >
                        Custom Global Caddyfile Options (User Overrides)
                      </Label>
                      <Textarea
                        id="global-caddyfile-overrides"
                        rows={4}
                        value={globalCaddyfile}
                        onChange={(e) => setGlobalCaddyfile(e.target.value)}
                        placeholder="# Insert your own global directives here&#10;# e.g. local_certs&#10;# e.g. acme_ca https://acme-v02.api.letsencrypt.org/directory"
                        className="resize-none border border-border/40 bg-card/30 p-3 font-mono text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        This block is injected directly into Caddy's global
                        option block <code>{"{ ... }"}</code>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="caddy-snippets" className="text-xs">
                        Reusable Caddy route snippets
                      </Label>
                      <Textarea
                        id="caddy-snippets"
                        rows={6}
                        value={caddySnippets}
                        onChange={(e) => setCaddySnippets(e.target.value)}
                        placeholder={
                          "(security-headers) {\n\theader {\n\t\t-Server\n\t\tX-Content-Type-Options nosniff\n\t}\n}\n\n(auth) {\n\tforward_auth auth:8080\n}"
                        }
                        className="resize-none border border-border/40 bg-card/30 p-3 font-mono text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Define named Caddy snippets here, then reference their
                        names from a resource domain. The generated Caddyfile is
                        validated before it is loaded.
                      </p>
                    </div>

                    {/* Save button */}
                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="gap-2 font-medium"
                      >
                        {isSaving && <Spinner className="size-4" />}
                        Save Configuration
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>

              {/* Compiled Caddyfile Preview Card */}
              <Card className="border border-border/40 bg-card/20 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="font-semibold text-lg">
                    Main Caddyfile
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Active read-only main config file compiled on the host
                  </CardDescription>
                </CardHeader>
                <CardContent className="border-border/10 border-t pt-4">
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
                    <pre className="overflow-x-auto font-mono text-[11px] text-zinc-300">
                      {info?.status?.mainCaddyfile || "# No Caddyfile found."}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ─── LIVE CONTAINER LOGS (Caddy) ────────────────────────────────── */}
          <Card className="border border-border/40 bg-card/20 shadow-sm">
            <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="font-semibold text-lg">
                  Live Access & Process Logs
                </CardTitle>
                <CardDescription className="text-xs">
                  Tail standard output from the <code>upstand-caddy</code>{" "}
                  container
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <input
                    type="checkbox"
                    id="auto-refresh-logs"
                    checked={autoRefreshCaddyLogs}
                    onChange={(e) => setAutoRefreshCaddyLogs(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border/40 accent-primary"
                  />
                  <label htmlFor="auto-refresh-logs">Auto-refresh (5s)</label>
                </div>

                <select
                  value={caddyLogsTail}
                  onChange={(e) => {
                    setCaddyLogsTail(Number(e.target.value));
                    setTimeout(() => refetchCaddyLogs(), 50);
                  }}
                  className="rounded-md border border-border/40 bg-card px-2.5 py-1 text-foreground text-xs focus:outline-none"
                >
                  <option value={50}>Last 50 lines</option>
                  <option value={100}>Last 100 lines</option>
                  <option value={200}>Last 200 lines</option>
                  <option value={500}>Last 500 lines</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLogs("caddy")}
                  disabled={!caddyLogs}
                  className="gap-1 text-xs"
                >
                  <HugeiconsIcon
                    icon={caddyLogsCopied ? CheckmarkCircle02Icon : Copy01Icon}
                    className="size-3.5"
                  />
                  {caddyLogsCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="border-border/10 border-t pt-4">
              {loadingCaddyLogs && !caddyLogs ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Spinner className="mr-2 size-4" /> Loading log stream...
                </div>
              ) : (
                <ShowDockerLogs
                  containerId="caddy"
                  logs={caddyLogs?.split("\n") ?? []}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── SERVER LOGS DIALOG ─────────────────────────────────────────── */}
      <Dialog open={serverLogsOpen} onOpenChange={setServerLogsOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader className="flex w-full flex-row items-center justify-between">
            <div>
              <DialogTitle>Upstand Server Logs</DialogTitle>
              <DialogDescription>
                Tailing stdout from Upstand backend process.
              </DialogDescription>
            </div>
            <div className="mr-4 flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  id="auto-refresh-server"
                  checked={autoRefreshServerLogs}
                  onChange={(e) => setAutoRefreshServerLogs(e.target.checked)}
                  className="h-3 w-3 rounded border-border/40 accent-primary"
                />
                <label htmlFor="auto-refresh-server">Auto-refresh (5s)</label>
              </div>
              <select
                value={serverLogsTail}
                onChange={(e) => {
                  setServerLogsTail(Number(e.target.value));
                  setTimeout(() => refetchServerLogs(), 50);
                }}
                className="rounded-md border border-border/40 bg-card px-2 py-0.5 text-foreground text-xs"
              >
                <option value={50}>Last 50 lines</option>
                <option value={100}>Last 100 lines</option>
                <option value={200}>Last 200 lines</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyLogs("server")}
                disabled={!serverLogs}
                className="h-7 text-xs"
              >
                Copy
              </Button>
            </div>
          </DialogHeader>
          <div className="mt-2">
            {loadingServerLogs && !serverLogs ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Spinner className="mr-2 size-4" /> Loading log stream...
              </div>
            ) : (
              <ShowDockerLogs
                containerId="upstand-server"
                logs={serverLogs?.split("\n") ?? []}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── GPU SUPPORT DIALOG ─────────────────────────────────────────── */}
      <Dialog open={gpuModalOpen} onOpenChange={setGpuModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>GPU Support Setup</DialogTitle>
            <DialogDescription>
              Detect and configure NVIDIA GPU runtime resources in Docker Swarm.
            </DialogDescription>
          </DialogHeader>
          {loadingGpu ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-6" />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    NVIDIA Driver Status:
                  </span>
                  <Badge
                    variant={
                      gpuStatus?.driverInstalled ? "default" : "destructive"
                    }
                  >
                    {gpuStatus?.driverInstalled ? "Installed" : "Not Installed"}
                  </Badge>
                </div>
                {gpuStatus?.driverVersion && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Driver Version:
                    </span>
                    <span className="font-mono text-xs">
                      {gpuStatus.driverVersion}
                    </span>
                  </div>
                )}
                {gpuStatus?.gpuModel && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-semibold text-xs">
                      {gpuStatus.gpuModel}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CUDA Support:</span>
                  <Badge
                    variant={gpuStatus?.cudaSupport ? "default" : "outline"}
                  >
                    {gpuStatus?.cudaSupport ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    NVIDIA Runtime Configured:
                  </span>
                  <Badge
                    variant={
                      gpuStatus?.runtimeConfigured ? "default" : "destructive"
                    }
                  >
                    {gpuStatus?.runtimeConfigured
                      ? "Configured"
                      : "Not Configured"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Generic GPU Resources:
                  </span>
                  <span className="font-semibold">
                    {gpuStatus?.gpuResources || 0}
                  </span>
                </div>
              </div>

              {!gpuStatus?.runtimeConfigured && gpuStatus?.driverInstalled && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 text-xs">
                  NVIDIA drivers were found, but Docker nvidia-runtime is not
                  active. Click the configure button below to setup
                  `/etc/docker/daemon.json`.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGpuModalOpen(false)}>
              Close
            </Button>
            <Button
              disabled={
                setupGpuMutation.isPending || !gpuStatus?.driverInstalled
              }
              onClick={() => setupGpuMutation.mutate()}
            >
              {setupGpuMutation.isPending
                ? "Configuring..."
                : "Configure GPU Support"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODIFY ENVIRONMENT DIALOG ──────────────────────────────────── */}
      <Dialog open={envModalOpen} onOpenChange={setEnvModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modify Environment Variables</DialogTitle>
            <DialogDescription>
              Configure global environment variables for the Caddy container.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={handleAddEnv}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                Add Variable
              </Button>
            </div>
            {envVars.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No environment variables configured.
              </div>
            ) : (
              <div className="space-y-2">
                {envVars.map((env, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="KEY"
                      value={env.key}
                      onChange={(e) =>
                        handleUpdateEnv(idx, "key", e.target.value)
                      }
                      className="font-mono text-xs uppercase"
                    />
                    <span className="text-muted-foreground">=</span>
                    <Input
                      placeholder="value"
                      value={env.value}
                      onChange={(e) =>
                        handleUpdateEnv(idx, "value", e.target.value)
                      }
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveEnv(idx)}
                      className="size-9 shrink-0 text-destructive hover:bg-destructive/10"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnvModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEnv} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & Recreate Container"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ADDITIONAL PORTS DIALOG ────────────────────────────────────── */}
      <Dialog open={portsModalOpen} onOpenChange={setPortsModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Additional Port Mappings</DialogTitle>
            <DialogDescription>
              Configure additional ports to bind on the host interface for Caddy
              container.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={handleAddPort}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                Add Mapping
              </Button>
            </div>
            {portMappings.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No custom port mappings configured.
              </div>
            ) : (
              <div className="space-y-2">
                {portMappings.map((port, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-1/3">
                      <Label className="text-[10px] text-muted-foreground">
                        Target Port
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        placeholder="8080"
                        value={port.targetPort}
                        onChange={(e) =>
                          handleUpdatePort(
                            idx,
                            "targetPort",
                            Number(e.target.value) || 0,
                          )
                        }
                        className="text-xs"
                      />
                    </div>
                    <span className="pt-4 text-muted-foreground">:</span>
                    <div className="w-1/3">
                      <Label className="text-[10px] text-muted-foreground">
                        Published Port
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        placeholder="8080"
                        value={port.publishedPort}
                        onChange={(e) =>
                          handleUpdatePort(
                            idx,
                            "publishedPort",
                            Number(e.target.value) || 0,
                          )
                        }
                        className="text-xs"
                      />
                    </div>
                    <div className="w-1/4">
                      <Label className="text-[10px] text-muted-foreground">
                        Protocol
                      </Label>
                      <Select
                        value={port.protocol}
                        onValueChange={(val) =>
                          handleUpdatePort(idx, "protocol", val)
                        }
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Protocol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp">TCP</SelectItem>
                          <SelectItem value="udp">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePort(idx)}
                      className="mt-4 size-9 shrink-0 text-destructive hover:bg-destructive/10"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPortsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePorts} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & Recreate Container"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WebServerTerminalDialog
        open={terminalOpen}
        onOpenChange={setTerminalOpen}
      />
    </div>
  );
}
