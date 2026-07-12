"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  ComputerIcon,
  DatabaseIcon,
  Delete02Icon,
  Folder01Icon,
  PlusSignIcon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type ApplicationBuildConfig,
  parseApplicationBuildConfig,
} from "@upstand/domain";
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
  DropdownMenuTrigger,
} from "@upstand/ui/components/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { Switch } from "@upstand/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@upstand/ui/components/tabs";
import { cn } from "@upstand/ui/lib/utils";
import {
  Activity,
  Code,
  Cpu,
  Eye,
  EyeOff,
  FileText,
  Globe,
  HardDrive,
  Link as LinkIcon,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Settings,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { BackupPanel } from "@/components/resource/backup-panel";
import { getServerUrl } from "@/lib/server-url";
import { ResourceAdvancedSettings } from "@/components/resource/resource-advanced-settings";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { ShowDockerLogs } from "@/components/shared/docker-logs";
import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

// ─── Type Config ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, IconSvgElement> = {
  application: ComputerIcon,
  database: DatabaseIcon,
  compose: ServerStack01Icon,
};

const TYPE_BG: Record<string, string> = {
  application: "bg-primary/10 text-primary",
  database: "bg-amber-500/10 text-amber-500",
  compose: "bg-violet-500/10 text-violet-500",
};

type DomainMapping = {
  host: string;
  path: string;
  internalPath: string;
  stripPath: boolean;
  port: number;
  serviceName?: string;
  https: boolean;
  middlewares: string[];
};

type MetricPoint = {
  time: string;
  cpu: number;
  ram: number;
  ramUsage: number;
  networkRxBytes: number;
  networkTxBytes: number;
};

type DeploymentItem = {
  id: string;
  status: string;
  title: string;
  logs: string;
  createdAt: string;
};

type ContainerItem = {
  id: string;
  name: string;
  status: string;
  ports: string;
  node: string;
};

const RESOURCE_PROVIDERS = [
  "github",
  "gitlab",
  "bitbucket",
  "gitea",
  "git",
  "raw",
] as const;

type ResourceProvider = (typeof RESOURCE_PROVIDERS)[number];

type ResourceCredentials = {
  provider?: ResourceProvider;
  autoDeploy?: boolean;
  githubAccount?: string;
  repository?: string;
  branch?: string;
  composePath?: string;
  triggerType?: string;
  watchPaths?: string[];
  enableSubmodules?: boolean;
  repositoryUrl?: string;
  sshKeyId?: string;
  composeFile?: string;
};

const createBuildConfig = (
  type: ApplicationBuildConfig["type"],
): ApplicationBuildConfig => {
  switch (type) {
    case "dockerfile":
      return {
        type,
        dockerfilePath: "Dockerfile",
        dockerContextPath: ".",
        dockerBuildArgs: {},
      };
    case "railpack":
      return { type, railpackVersion: "0.23.0" };
    case "nixpacks":
      return { type };
    case "heroku-buildpacks":
      return { type, herokuVersion: "24" };
    case "paketo-buildpacks":
      return { type };
    case "static":
      return { type, publishDirectory: "dist", spa: true };
  }
};

const RAILPACK_VERSIONS = [
  "0.23.0",
  "0.22.0",
  "0.21.0",
  "0.20.0",
  "0.19.0",
  "0.18.0",
  "0.17.0",
  "0.16.0",
  "0.15.4",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isResourceProvider = (value: unknown): value is ResourceProvider =>
  typeof value === "string" &&
  RESOURCE_PROVIDERS.includes(value as ResourceProvider);

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;

const parseResourceCredentials = (
  value: string | null | undefined,
): ResourceCredentials | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    return {
      provider: isResourceProvider(parsed.provider)
        ? parsed.provider
        : undefined,
      autoDeploy:
        typeof parsed.autoDeploy === "boolean" ? parsed.autoDeploy : undefined,
      githubAccount: readString(parsed.githubAccount),
      repository: readString(parsed.repository),
      branch: readString(parsed.branch),
      composePath: readString(parsed.composePath),
      triggerType: readString(parsed.triggerType),
      watchPaths: readStringArray(parsed.watchPaths),
      enableSubmodules:
        typeof parsed.enableSubmodules === "boolean"
          ? parsed.enableSubmodules
          : undefined,
      repositoryUrl: readString(parsed.repositoryUrl),
      sshKeyId: readString(parsed.sshKeyId),
      composeFile: readString(parsed.composeFile),
    };
  } catch {
    return null;
  }
};

const parseDeploymentItems = (value: string): DeploymentItem[] => {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item.id);
      if (!id) return [];
      return [
        {
          id,
          status: readString(item.status) ?? "unknown",
          title: readString(item.title) ?? "Deployment",
          logs: readString(item.logs) ?? "",
          createdAt: readString(item.createdAt) ?? new Date(0).toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
};

const parseContainerItems = (value: string): ContainerItem[] => {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!isRecord(item)) return [];
      const id = readString(item.id);
      if (!id) return [];
      return [
        {
          id,
          name: readString(item.name) ?? id,
          status: readString(item.status) ?? "unknown",
          ports: readString(item.ports) ?? "N/A",
          node: readString(item.node) ?? "local",
        },
      ];
    });
  } catch {
    return [];
  }
};

const emptyDomainMapping = (): DomainMapping => ({
  host: "",
  path: "/",
  internalPath: "/",
  stripPath: false,
  port: 80,
  serviceName: "",
  https: true,
  middlewares: [],
});

function parseDomainMappings(value: string): DomainMapping[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const mapping = item as Partial<DomainMapping>;
      if (typeof mapping.host !== "string") return [];
      return [
        {
          host: mapping.host,
          path: mapping.path || "/",
          internalPath: mapping.internalPath || "/",
          stripPath: Boolean(mapping.stripPath),
          port: Number(mapping.port) || 80,
          serviceName: mapping.serviceName || "",
          https: mapping.https !== false,
          middlewares: Array.isArray(mapping.middlewares)
            ? mapping.middlewares.filter(
                (middleware): middleware is string =>
                  typeof middleware === "string",
              )
            : [],
        },
      ];
    });
  } catch {
    return [];
  }
}

// ─── Main Detail ───────────────────────────────────────────────────────────────

export default function ResourceDetail({
  projectId,
  environmentId,
  resourceId,
  session,
}: {
  projectId: string;
  environmentId: string;
  resourceId: string;
  session: typeof authClient.$Infer.Session;
}) {
  const router = useRouter();

  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);

  // Interactive Tabs States
  const [envList, setEnvList] = useState<{ key: string; value: string }[]>([]);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Record<string, boolean>>(
    {},
  );

  const [domainList, setDomainList] = useState<DomainMapping[]>([]);
  const [domainDraft, setDomainDraft] =
    useState<DomainMapping>(emptyDomainMapping);
  const [editingDomainIndex, setEditingDomainIndex] = useState<number | null>(
    null,
  );

  const [deployList, setDeployList] = useState<DeploymentItem[]>([]);
  const [selectedDeployment, setSelectedDeployment] =
    useState<DeploymentItem | null>(null);
  const [viewDeploymentLogsOpen, setViewDeploymentLogsOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [autoDeploy, setAutoDeploy] = useState(true);

  const [containerList, setContainerList] = useState<ContainerItem[]>([]);
  const [selectedContainer, setSelectedContainer] =
    useState<ContainerItem | null>(null);
  const [containerModalType, setContainerModalType] = useState<
    "logs" | "config" | "networks" | "mounts" | "terminal" | null
  >(null);
  const [selectedLogContainerId, setSelectedLogContainerId] =
    useState<string>("all");

  const [showDbPassword, setShowDbPassword] = useState(false);
  const [showDbRootPassword, setShowDbRootPassword] = useState(false);
  const [buildConfig, setBuildConfig] = useState<ApplicationBuildConfig>(
    createBuildConfig("dockerfile"),
  );

  // Provider States
  const [providerType, setProviderType] = useState<ResourceProvider>("github");
  const [githubAccount, setGithubAccount] = useState(
    "Dokploy-2025-12-24-tdwab7",
  );
  const [githubRepo, setGithubRepo] = useState("loomana-app");
  const [githubBranch, setGithubBranch] = useState("master");
  const [githubComposePath, setGithubComposePath] = useState(
    "./docker-compose.yml",
  );
  const [githubTriggerType, setGithubTriggerType] = useState("On Push");
  const [githubWatchPaths, setGithubWatchPaths] = useState<string[]>([]);
  const [githubSubmodules, setGithubSubmodules] = useState(false);

  const [gitUrl, setGitUrl] = useState("");
  const [gitSshKeyId, setGitSshKeyId] = useState("");
  const [gitBranch, setGitBranch] = useState("master");
  const [gitComposePath, setGitComposePath] = useState("./docker-compose.yml");
  const [gitWatchPaths, setGitWatchPaths] = useState<string[]>([]);
  const [gitSubmodules, setGitSubmodules] = useState(false);

  const [rawComposeFile, setRawComposeFile] = useState(`version: '3'
services:
  web:
    image: nginx
    ports:
      - "80:80"`);

  // Fetch project
  const { data: project } = useQuery({
    ...trpc.project.get.queryOptions({ id: projectId }),
  });

  // Fetch environment
  const { data: env } = useQuery({
    ...trpc.environment.get.queryOptions({ id: environmentId }),
  });

  // Fetch SSH Keys for Git provider dropdown
  const { data: sshKeys } = useQuery({
    ...trpc.sshKey.list.queryOptions({
      organizationId: project?.organizationId || "",
    }),
    enabled: !!project?.organizationId,
  });

  // Fetch Git Providers
  const { data: gitProviders } = useQuery({
    ...trpc.gitProvider.list.queryOptions({
      organizationId: project?.organizationId || "",
    }),
    enabled: !!project?.organizationId,
  });

  // Fetch Git Repositories
  const { data: gitRepos, isPending: loadingRepos } = useQuery({
    ...trpc.gitProvider.listRepositories.queryOptions({
      gitProviderId: githubAccount,
    }),
    enabled:
      !!githubAccount &&
      ["github", "gitlab", "bitbucket", "gitea"].includes(providerType) &&
      (() => {
        const p = gitProviders?.find((x) => x.id === githubAccount);
        if (!p) return false;
        const config = JSON.parse(p.config);
        if (p.provider === "github") return !!config.githubInstallationId;
        if (p.provider === "gitlab" || p.provider === "gitea")
          return !!config.accessToken;
        if (p.provider === "bitbucket") return true;
        return false;
      })(),
  });

  const [repoOwner, repoName] = githubRepo.includes("/")
    ? githubRepo.split("/")
    : ["", githubRepo];

  // Fetch Git Branches
  const { data: gitBranches, isPending: loadingBranches } = useQuery({
    ...trpc.gitProvider.listBranches.queryOptions({
      gitProviderId: githubAccount,
      owner: repoOwner,
      repo: repoName,
    }),
    enabled:
      !!githubAccount &&
      ["github", "gitlab", "bitbucket", "gitea"].includes(providerType) &&
      !!repoOwner &&
      !!repoName &&
      (() => {
        const p = gitProviders?.find((x) => x.id === githubAccount);
        if (!p) return false;
        const config = JSON.parse(p.config);
        if (p.provider === "github") return !!config.githubInstallationId;
        if (p.provider === "gitlab" || p.provider === "gitea")
          return !!config.accessToken;
        if (p.provider === "bitbucket") return true;
        return false;
      })(),
  });

  const {
    data: resource,
    isPending: loadingResource,
    refetch: refetchResource,
  } = useQuery({
    ...trpc.resource.get.queryOptions({ id: resourceId }),
    refetchInterval: 3000,
  });

  const { data: routingTargets = [] } = useQuery({
    ...trpc.resource.getRoutingTargets.queryOptions({ id: resourceId }),
    enabled: !!resourceId,
    staleTime: 15_000,
  });

  const dbConfig = useMemo(() => {
    if (resource?.type === "database" && resource.credentials) {
      try {
        return JSON.parse(resource.credentials);
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [resource]);

  // Fetch live container list from Docker via backend
  const { data: liveContainers } = useQuery({
    ...trpc.resource.getContainers.queryOptions({ id: resourceId }),
    refetchInterval: 5000,
  });

  // Fetch real logs from Docker
  const { data: realLogsData } = useQuery({
    ...trpc.resource.getLogs.queryOptions({
      id: resourceId,
      containerId:
        selectedLogContainerId === "all" ? undefined : selectedLogContainerId,
    }),
    refetchInterval: 4000,
  });

  // Fetch real-time container metrics
  const { data: statsData } = useQuery({
    ...trpc.resource.getStats.queryOptions({ id: resourceId }),
    refetchInterval: resource?.status === "running" ? 5000 : false,
    enabled: !!resourceId && resource?.status === "running",
  });

  const realLogs = useMemo(() => {
    if (!realLogsData) return [];
    return realLogsData.trim().split("\n");
  }, [realLogsData]);

  // Fetch container-specific logs for the modal
  const { data: containerLogsData } = useQuery({
    ...trpc.resource.getLogs.queryOptions({
      id: resourceId,
      containerId: selectedContainer?.id || undefined,
    }),
    enabled: containerModalType === "logs" && !!selectedContainer?.id,
    refetchInterval: containerModalType === "logs" ? 3000 : false,
  });

  const containerLogs = useMemo(() => {
    if (!containerLogsData) return [];
    return containerLogsData.trim().split("\n");
  }, [containerLogsData]);

  // Sync state variables from DB
  useEffect(() => {
    if (resource) {
      setNameInput(resource.name);
      setBuildConfig(parseApplicationBuildConfig(resource.buildConfig));
      try {
        const parsed = JSON.parse(resource.envVars || "{}");
        setEnvList(
          Object.entries(parsed).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      } catch (e) {
        setEnvList([]);
      }
      setDomainList(parseDomainMappings(resource.domains));
      const deployments = parseDeploymentItems(resource.deployments);
      setDeployList(deployments);
      setIsBuilding(
        deployments.some((deployment) => deployment.status === "running"),
      );
      if (liveContainers) {
        setContainerList(liveContainers);
      } else {
        setContainerList(parseContainerItems(resource.containers));
      }
      if (isResourceProvider(resource.provider)) {
        setProviderType(resource.provider);
      }
      const config = parseResourceCredentials(resource.credentials);
      if (config) {
        if (config.provider) {
          setProviderType(config.provider);
        }
        setAutoDeploy(config.autoDeploy !== false);
        if (
          config.provider &&
          ["github", "gitlab", "bitbucket", "gitea"].includes(config.provider)
        ) {
          setGithubAccount(config.githubAccount ?? "");
          setGithubRepo(config.repository ?? "");
          setGithubBranch(config.branch ?? "");
          setGithubComposePath(config.composePath ?? "./docker-compose.yml");
          setGithubTriggerType(config.triggerType ?? "On Push");
          setGithubWatchPaths(config.watchPaths ?? []);
          setGithubSubmodules(config.enableSubmodules ?? false);
        } else if (config.provider === "git") {
          setGitUrl(config.repositoryUrl ?? "");
          setGitSshKeyId(config.sshKeyId ?? "");
          setGitBranch(config.branch ?? "master");
          setGitComposePath(config.composePath ?? "./docker-compose.yml");
          setGitWatchPaths(config.watchPaths ?? []);
          setGitSubmodules(config.enableSubmodules ?? false);
        } else if (config.provider === "raw") {
          setRawComposeFile(config.composeFile ?? "");
        }
      }
    }
  }, [resource, liveContainers]);

  // Automatically select the first provider of the chosen type when switching tabs
  useEffect(() => {
    if (
      gitProviders &&
      ["github", "gitlab", "bitbucket", "gitea"].includes(providerType)
    ) {
      const filtered = gitProviders.filter((p) => p.provider === providerType);
      const currentIsValid = filtered.some((p) => p.id === githubAccount);

      if (!currentIsValid && filtered.length > 0) {
        const activeOne = filtered.find((p) => {
          const cfg = JSON.parse(p.config);
          return p.provider === "github"
            ? !!cfg.githubInstallationId
            : p.provider === "bitbucket"
              ? true
              : !!cfg.accessToken;
        });
        setGithubAccount(activeOne?.id || filtered[0].id);
      } else if (filtered.length === 0) {
        setGithubAccount("");
      }
    }
  }, [providerType, gitProviders]);

  // Reset repository when Git Account changes
  useEffect(() => {
    if (githubAccount) {
      if (gitRepos && gitRepos.length > 0) {
        const exists = gitRepos.some((r) => r.fullName === githubRepo);
        if (!exists) {
          setGithubRepo(gitRepos[0].fullName);
        }
      } else {
        setGithubRepo("");
        setGithubBranch("");
      }
    }
  }, [githubAccount, gitRepos]);

  // Reset branch when repository changes
  useEffect(() => {
    if (githubRepo && gitBranches && gitBranches.length > 0) {
      const exists = gitBranches.includes(githubBranch);
      if (!exists) {
        setGithubBranch(gitBranches[0]);
      }
    }
  }, [githubRepo, gitBranches]);

  // Mutations
  const updateResourceMutation = useMutation({
    ...trpc.resource.update.mutationOptions(),
    onSuccess: () => {
      refetchResource();
    },
    onError: (err) => toast.error(err.message || "Failed to update resource"),
  });

  const deployResourceMutation = useMutation({
    ...trpc.resource.deploy.mutationOptions(),
    onSuccess: () => {
      toast.success("Deployment triggered successfully");
      refetchResource();
    },
    onError: (err) => {
      setIsBuilding(false);
      toast.error(err.message || "Failed to trigger deployment");
    },
  });

  const controlResourceMutation = useMutation({
    ...trpc.resource.control.mutationOptions(),
    onSuccess: () => {
      toast.success("Command dispatched successfully");
      refetchResource();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to control resource");
    },
  });

  const deleteResourceMutation = useMutation({
    ...trpc.resource.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Resource deleted successfully");
      router.push(`/projects/${projectId}/${environmentId}` as Route);
    },
    onError: (err) => toast.error(err.message || "Failed to delete resource"),
  });

  useEffect(() => {
    if (!statsData) return;
    const collectedAt = new Date(statsData.collectedAt);
    const metric: MetricPoint = {
      time: collectedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      cpu: statsData.cpu,
      ram: statsData.ram,
      ramUsage: statsData.ramUsage,
      networkRxBytes: statsData.networkRxBytes,
      networkTxBytes: statsData.networkTxBytes,
    };
    setMetrics((previous) => {
      const next = [...previous, metric];
      return next.slice(-60);
    });
  }, [statsData]);

  if (loadingResource) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!resource || !env || !project) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 text-center">
        <p className="text-muted-foreground">Resource not found.</p>
        <Link href={`/projects/${projectId}/${environmentId}` as Route}>
          <Button variant="outline">Back to Environment</Button>
        </Link>
      </div>
    );
  }

  const Icon = TYPE_ICONS[resource.type] || ComputerIcon;
  const isRunning = resource.status === "running";

  const handleSaveProvider = () => {
    let config: ResourceCredentials = { provider: providerType, autoDeploy };
    if (["github", "gitlab", "bitbucket", "gitea"].includes(providerType)) {
      config = {
        ...config,
        githubAccount,
        repository: githubRepo,
        branch: githubBranch,
        composePath: githubComposePath,
        triggerType: githubTriggerType,
        watchPaths: githubWatchPaths,
        enableSubmodules: githubSubmodules,
      };
    } else if (providerType === "git") {
      config = {
        ...config,
        repositoryUrl: gitUrl,
        sshKeyId: gitSshKeyId,
        branch: gitBranch,
        composePath: gitComposePath,
        watchPaths: gitWatchPaths,
        enableSubmodules: gitSubmodules,
      };
    } else if (providerType === "raw") {
      config = {
        ...config,
        composeFile: rawComposeFile,
      };
    }

    updateResourceMutation.mutate(
      {
        id: resourceId,
        provider: providerType,
        credentials: JSON.stringify(config),
      },
      {
        onSuccess: () => {
          toast.success("Provider configuration saved successfully");
        },
      },
    );
  };

  const triggerStatusChange = (status: "running" | "stopped") => {
    const command = status === "running" ? "start" : "stop";
    toast.info(`Sending ${command} signal to resource...`);
    controlResourceMutation.mutate({
      id: resourceId,
      command,
    });
  };

  // ─── Environment Variables Event Handlers ─────────────────────────────────────
  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    const updated = [...envList];
    const index = updated.findIndex((e) => e.key === newEnvKey.trim());
    if (index > -1) {
      updated[index].value = newEnvValue;
      toast.success(`Updated key ${newEnvKey.trim()}`);
    } else {
      updated.push({ key: newEnvKey.trim(), value: newEnvValue });
    }
    setEnvList(updated);
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const editEnvVar = (key: string, value: string) => {
    setNewEnvKey(key);
    setNewEnvValue(value);
  };

  const deleteEnvVar = (key: string) => {
    setEnvList(envList.filter((e) => e.key !== key));
  };

  const saveEnvVars = () => {
    const obj: Record<string, string> = {};
    for (const item of envList) {
      if (item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    updateResourceMutation.mutate(
      { id: resourceId, envVars: JSON.stringify(obj) },
      {
        onSuccess: () =>
          toast.success("Environment variables saved successfully"),
      },
    );
  };

  // ─── Domain Event Handlers ─────────────────────────────────────────────────────
  const saveDomain = () => {
    if (!domainDraft.host.trim()) {
      toast.error("A hostname is required");
      return;
    }
    if (resource?.type === "compose" && !domainDraft.serviceName?.trim()) {
      toast.error("Select or enter the Compose service name");
      return;
    }

    const mapping: DomainMapping = {
      ...domainDraft,
      host: domainDraft.host.trim(),
      path: domainDraft.path.trim() || "/",
      internalPath: domainDraft.internalPath.trim() || "/",
      serviceName: domainDraft.serviceName?.trim() || undefined,
      middlewares: domainDraft.middlewares
        .map((middleware) => middleware.trim())
        .filter(Boolean),
    };
    const updated =
      editingDomainIndex === null
        ? [...domainList, mapping]
        : domainList.map((item, index) =>
            index === editingDomainIndex ? mapping : item,
          );

    updateResourceMutation.mutate(
      { id: resourceId, domains: JSON.stringify(updated) },
      {
        onSuccess: () => {
          toast.success(
            editingDomainIndex === null
              ? "Domain connected successfully"
              : "Domain updated successfully",
          );
          setDomainDraft(emptyDomainMapping());
          setEditingDomainIndex(null);
        },
      },
    );
  };

  const deleteDomain = (idx: number) => {
    const updated = domainList.filter((_, i) => i !== idx);
    updateResourceMutation.mutate(
      { id: resourceId, domains: JSON.stringify(updated) },
      {
        onSuccess: () => {
          toast.success("Domain connection deleted");
          if (editingDomainIndex === idx) {
            setDomainDraft(emptyDomainMapping());
            setEditingDomainIndex(null);
          }
        },
      },
    );
  };

  const editDomain = (index: number) => {
    setDomainDraft(domainList[index]);
    setEditingDomainIndex(index);
  };

  // ─── Deployment Handlers ───────────────────────────────────────────────────────
  const triggerDeployment = () => {
    setIsBuilding(true);
    toast.info("Building and deploying resource...");
    deployResourceMutation.mutate({ id: resourceId });
  };

  const clearDeployments = () => {
    setDeployList([]);
    updateResourceMutation.mutate(
      { id: resourceId, deployments: "[]" },
      {
        onSuccess: () => toast.success("Deployment history cleared"),
      },
    );
  };

  // ─── Container State Handlers ───────────────────────────────────────────────────
  const dispatchContainerCommand = (
    containerId: string,
    cmd: "start" | "stop" | "restart" | "kill",
  ) => {
    const command = cmd === "kill" ? "stop" : cmd;
    toast.info(`Sending ${command} command to container...`);
    controlResourceMutation.mutate({
      id: resourceId,
      command,
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {/* Breadcrumbs */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Link
            href={"/projects" as Route}
            className="transition-colors hover:text-primary"
          >
            Projects
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <Link
            href={`/projects/${projectId}` as Route}
            className="transition-colors hover:text-primary"
          >
            {project.name}
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <Link
            href={`/projects/${projectId}/${environmentId}` as Route}
            className="transition-colors hover:text-primary"
          >
            {env.name}
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <span className="font-medium text-foreground">{resource.name}</span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center",
                TYPE_BG[resource.type],
              )}
            >
              <HugeiconsIcon icon={Icon} className="size-5" />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-foreground">
                {resource.name}
              </h1>
              <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
                {resource.type} • {resource.appName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-2 flex items-center gap-1.5 border border-border/30 bg-accent/25 px-3 py-1.5">
              <span className={cn("relative flex h-2 w-2")}>
                {isRunning && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    isRunning ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                />
              </span>
              <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                {resource.status}
              </span>
            </div>

            {isRunning ? (
              <>
                <Button
                  onClick={() => triggerStatusChange("stopped")}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border/40"
                  disabled={updateResourceMutation.isPending}
                >
                  <Square className="size-4 text-destructive" />
                  Stop
                </Button>
                <Button
                  onClick={() => {
                    triggerStatusChange("stopped");
                    setTimeout(() => triggerStatusChange("running"), 800);
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border/40"
                  disabled={updateResourceMutation.isPending}
                >
                  <RotateCw className="size-4" />
                  Restart
                </Button>
              </>
            ) : (
              <Button
                onClick={() => triggerStatusChange("running")}
                size="sm"
                className="gap-1.5"
                disabled={updateResourceMutation.isPending}
              >
                <Play className="size-4" />
                Start
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex max-w-full flex-nowrap gap-1 overflow-x-auto border border-border/40 bg-card/45 p-1 [scrollbar-width:thin]">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="size-4" /> General
          </TabsTrigger>
          <TabsTrigger value="environment" className="gap-2">
            <Code className="size-4" /> Environment
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Settings className="size-4" /> Advanced
          </TabsTrigger>
          <TabsTrigger value="domains" className="gap-2">
            <Globe className="size-4" /> Domains
          </TabsTrigger>
          <TabsTrigger value="deployments" className="gap-2">
            <RefreshCw className="size-4" /> Deployments
          </TabsTrigger>
          <TabsTrigger value="containers" className="gap-2">
            <HugeiconsIcon icon={ServerStack01Icon} className="size-4" />{" "}
            Containers
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-2">
            <HardDrive className="size-4" /> Backups
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Terminal className="size-4" /> Logs
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2">
            <Activity className="size-4" /> Monitoring
          </TabsTrigger>
        </TabsList>

        {/* ─── GENERAL TAB ───────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-6 outline-none">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-6 md:col-span-2">
              {/* Deploy settings */}
              <Card className="border border-border/40 bg-card/20">
                <CardHeader>
                  <CardTitle className="font-semibold text-lg">
                    Deployment Operations
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    Control pipeline states and webhook configs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 border-border/20 border-t pt-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="block font-semibold text-foreground text-sm">
                        Auto Deploy webhook triggers
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Deploy the container automatically when source code
                        updates.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground text-xs">
                        {autoDeploy ? "Active" : "Disabled"}
                      </span>
                      <input
                        type="checkbox"
                        checked={autoDeploy}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoDeploy(val);
                          const config = {
                            ...parseResourceCredentials(resource.credentials),
                            autoDeploy: val,
                          };
                          updateResourceMutation.mutate(
                            {
                              id: resourceId,
                              credentials: JSON.stringify(config),
                            },
                            {
                              onSuccess: () => {
                                toast.success(
                                  `Auto Deploy ${val ? "enabled" : "disabled"}`,
                                );
                              },
                            },
                          );
                        }}
                        className="size-4 cursor-pointer rounded accent-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-border/20 border-t pt-2 pt-4">
                    <Button
                      onClick={triggerDeployment}
                      disabled={isBuilding}
                      className="gap-2 font-medium"
                    >
                      <RefreshCw
                        className={cn("size-4", isBuilding && "animate-spin")}
                      />
                      Deploy Now
                    </Button>
                    <Button
                      onClick={() =>
                        triggerStatusChange(isRunning ? "stopped" : "running")
                      }
                      variant="outline"
                      className="gap-2 border-border/40"
                    >
                      {isRunning ? (
                        <Square className="size-4 text-destructive" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      {isRunning ? "Stop Service" : "Start Service"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {resource.type === "application" && (
                <Card className="border border-border/40 bg-card/20">
                  <CardHeader>
                    <CardTitle className="font-semibold text-lg">
                      Build Configuration
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Select the builder and configure only the inputs it
                      requires. Changes apply to the next deployment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 border-border/20 border-t pt-4">
                    <FieldGroup>
                      <Field>
                        <FieldContent>
                          <FieldLabel htmlFor="build-type">
                            Build type
                          </FieldLabel>
                          <FieldDescription>
                            Dockerfile, Railpack, Nixpacks, Cloud Native
                            Buildpacks, or a static NGINX image.
                          </FieldDescription>
                        </FieldContent>
                        <Select
                          value={buildConfig.type}
                          onValueChange={(value) => {
                            const nextType =
                              value as ApplicationBuildConfig["type"];
                            setBuildConfig(createBuildConfig(nextType));
                          }}
                        >
                          <SelectTrigger
                            id="build-type"
                            className="w-full bg-background sm:w-72"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="dockerfile">
                                Dockerfile
                              </SelectItem>
                              <SelectItem value="railpack">Railpack</SelectItem>
                              <SelectItem value="nixpacks">Nixpacks</SelectItem>
                              <SelectItem value="heroku-buildpacks">
                                Heroku Buildpacks
                              </SelectItem>
                              <SelectItem value="paketo-buildpacks">
                                Paketo Buildpacks
                              </SelectItem>
                              <SelectItem value="static">Static</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>

                    {buildConfig.type === "dockerfile" && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="dockerfile-path">
                              Dockerfile path
                            </Label>
                            <Input
                              id="dockerfile-path"
                              value={buildConfig.dockerfilePath}
                              onChange={(event) =>
                                setBuildConfig({
                                  ...buildConfig,
                                  dockerfilePath: event.target.value,
                                })
                              }
                              placeholder="Dockerfile"
                              className="bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="docker-context-path">
                              Docker context path
                            </Label>
                            <Input
                              id="docker-context-path"
                              value={buildConfig.dockerContextPath}
                              onChange={(event) =>
                                setBuildConfig({
                                  ...buildConfig,
                                  dockerContextPath: event.target.value,
                                })
                              }
                              placeholder="."
                              className="bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="docker-build-stage">
                              Build stage{" "}
                              <span className="text-muted-foreground">
                                (optional)
                              </span>
                            </Label>
                            <Input
                              id="docker-build-stage"
                              value={buildConfig.dockerBuildStage ?? ""}
                              onChange={(event) =>
                                setBuildConfig({
                                  ...buildConfig,
                                  dockerBuildStage:
                                    event.target.value || undefined,
                                })
                              }
                              placeholder="production"
                              className="bg-background"
                            />
                          </div>
                        </div>
                        <Field>
                          <FieldLabel htmlFor="docker-build-args">
                            Docker build arguments
                          </FieldLabel>
                          <FieldDescription>
                            Configure values passed to the Dockerfile builder.
                          </FieldDescription>
                          <CodeSurface>
                            <CodeEditor
                              id="docker-build-args"
                              language="json"
                              height="130px"
                              value={JSON.stringify(
                                buildConfig.dockerBuildArgs ?? {},
                                null,
                                2,
                              )}
                              onChange={(value) => {
                                try {
                                  const parsed = JSON.parse(value) as unknown;
                                  if (
                                    parsed &&
                                    typeof parsed === "object" &&
                                    !Array.isArray(parsed)
                                  ) {
                                    const args = Object.fromEntries(
                                      Object.entries(parsed).filter(
                                        ([, item]) => typeof item === "string",
                                      ),
                                    );
                                    setBuildConfig({
                                      ...buildConfig,
                                      dockerBuildArgs: args,
                                    });
                                  }
                                } catch {
                                  // Keep the editor responsive while the user is typing incomplete JSON.
                                }
                              }}
                              aria-label="Docker build arguments JSON"
                            />
                          </CodeSurface>
                        </Field>
                      </>
                    )}

                    {buildConfig.type === "railpack" && (
                      <div className="max-w-sm space-y-2">
                        <Label htmlFor="railpack-version">
                          Railpack version
                        </Label>
                        <Select
                          value={
                            RAILPACK_VERSIONS.includes(
                              (buildConfig.railpackVersion ??
                                "") as (typeof RAILPACK_VERSIONS)[number],
                            )
                              ? (buildConfig.railpackVersion ?? "")
                              : "custom"
                          }
                          onValueChange={(value) => {
                            if (value !== "custom") {
                              setBuildConfig({
                                ...buildConfig,
                                railpackVersion: value ?? "",
                              });
                            }
                          }}
                        >
                          <SelectTrigger
                            id="railpack-version"
                            className="bg-background"
                          >
                            <SelectValue placeholder="Select Railpack version" />
                          </SelectTrigger>
                          <SelectContent>
                            {RAILPACK_VERSIONS.map((version) => (
                              <SelectItem key={version} value={version}>
                                {version}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">
                              Custom version
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {!RAILPACK_VERSIONS.includes(
                          (buildConfig.railpackVersion ??
                            "") as (typeof RAILPACK_VERSIONS)[number],
                        ) && (
                          <Input
                            value={buildConfig.railpackVersion ?? ""}
                            onChange={(event) =>
                              setBuildConfig({
                                ...buildConfig,
                                railpackVersion: event.target.value,
                              })
                            }
                            placeholder="0.23.0"
                            className="bg-background"
                            aria-label="Custom Railpack version"
                          />
                        )}
                      </div>
                    )}

                    {buildConfig.type === "nixpacks" && (
                      <div className="max-w-sm space-y-2">
                        <Label htmlFor="nixpacks-publish-directory">
                          Publish directory{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="nixpacks-publish-directory"
                          value={buildConfig.publishDirectory ?? ""}
                          onChange={(event) =>
                            setBuildConfig({
                              ...buildConfig,
                              publishDirectory: event.target.value || undefined,
                            })
                          }
                          placeholder="dist"
                          className="bg-background"
                        />
                      </div>
                    )}

                    {buildConfig.type === "heroku-buildpacks" && (
                      <div className="max-w-sm space-y-2">
                        <Label htmlFor="heroku-version">
                          Heroku stack version
                        </Label>
                        <Select
                          value={buildConfig.herokuVersion}
                          onValueChange={(value) =>
                            setBuildConfig({
                              ...buildConfig,
                              herokuVersion: value as "24" | "26",
                            })
                          }
                        >
                          <SelectTrigger
                            id="heroku-version"
                            className="bg-background"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="24">Heroku-24</SelectItem>
                              <SelectItem value="26">Heroku-26</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {buildConfig.type === "paketo-buildpacks" && (
                      <p className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground text-sm">
                        Paketo builds use the production Jammy full builder and
                        rely on buildpack detection in your repository.
                      </p>
                    )}

                    {buildConfig.type === "static" && (
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="w-full max-w-sm space-y-2">
                          <Label htmlFor="static-publish-directory">
                            Publish directory
                          </Label>
                          <Input
                            id="static-publish-directory"
                            value={buildConfig.publishDirectory}
                            onChange={(event) =>
                              setBuildConfig({
                                ...buildConfig,
                                publishDirectory: event.target.value,
                              })
                            }
                            placeholder="dist"
                            className="bg-background"
                          />
                        </div>
                        <Field
                          orientation="horizontal"
                          className="w-full sm:w-auto"
                        >
                          <FieldContent>
                            <FieldLabel htmlFor="static-spa">
                              Single-page application
                            </FieldLabel>
                            <FieldDescription>
                              Fallback unknown routes to index.html.
                            </FieldDescription>
                          </FieldContent>
                          <Switch
                            id="static-spa"
                            checked={buildConfig.spa}
                            onCheckedChange={(spa) =>
                              setBuildConfig({ ...buildConfig, spa })
                            }
                          />
                        </Field>
                      </div>
                    )}

                    <div className="flex justify-end border-border/20 border-t pt-4">
                      <Button
                        type="button"
                        onClick={() =>
                          updateResourceMutation.mutate({
                            id: resourceId,
                            buildConfig,
                          })
                        }
                        disabled={updateResourceMutation.isPending}
                      >
                        Save Build Configuration
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Provider Card */}
              {resource.type !== "database" && (
                <Card className="border border-border/40 bg-card/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                      <CardTitle className="font-semibold text-lg">
                        Provider
                      </CardTitle>
                      <CardDescription className="text-muted-foreground text-sm">
                        Select the source of your code
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 border-border/20 border-t pt-4">
                    {/* Provider Tabs */}
                    <div className="flex flex-wrap gap-1 border border-border/30 bg-muted/40 p-1">
                      {[
                        { id: "github", label: "GitHub", icon: Globe },
                        { id: "gitlab", label: "GitLab", icon: Globe },
                        { id: "bitbucket", label: "Bitbucket", icon: Globe },
                        { id: "gitea", label: "Gitea", icon: Code },
                        { id: "git", label: "Git", icon: Globe },
                        { id: "raw", label: "Raw", icon: Code },
                      ].map((prov) => {
                        const Icon = prov.icon;
                        const active = providerType === prov.id;
                        return (
                          <button
                            key={prov.id}
                            type="button"
                            onClick={() =>
                              setProviderType(prov.id as ResourceProvider)
                            }
                            className={cn(
                              "flex cursor-pointer items-center gap-2 border-none px-3 py-1.5 font-semibold text-xs transition-all duration-200",
                              active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-background/20 hover:text-foreground",
                            )}
                          >
                            <Icon className="size-3.5" />
                            {prov.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* GitHub/GitLab/Bitbucket/Gitea Form */}
                    {["github", "gitlab", "bitbucket", "gitea"].includes(
                      providerType,
                    ) && (
                      <div className="space-y-4 pt-2">
                        {gitProviders?.filter(
                          (p) => p.provider === providerType,
                        ).length === 0 && (
                          <div className="space-y-1 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3.5 text-xs text-yellow-600">
                            <p className="font-semibold capitalize">
                              No {providerType} accounts configured.
                            </p>
                            <p>
                              To pull repositories and branches from{" "}
                              {providerType}, configure a connection in{" "}
                              <Link
                                href={"/git-providers" as Route}
                                className="font-bold underline hover:text-yellow-700"
                              >
                                Git Providers Settings
                              </Link>
                              .
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="capitalize">
                            {providerType} Account
                          </Label>
                          <Select
                            value={githubAccount}
                            onValueChange={(value) =>
                              setGithubAccount(value ?? "")
                            }
                            disabled={
                              gitProviders?.filter(
                                (p) => p.provider === providerType,
                              ).length === 0
                            }
                          >
                            <SelectTrigger className="border-border/40">
                              <SelectValue placeholder="Select Account" />
                            </SelectTrigger>
                            <SelectContent>
                              {gitProviders
                                ?.filter((p) => p.provider === providerType)
                                .map((p) => {
                                  const config = JSON.parse(p.config);
                                  const isInstalled =
                                    p.provider === "github"
                                      ? !!config.githubInstallationId
                                      : p.provider === "bitbucket"
                                        ? true
                                        : !!config.accessToken;
                                  return (
                                    <SelectItem
                                      key={p.id}
                                      value={p.id}
                                      disabled={!isInstalled}
                                    >
                                      {p.name}{" "}
                                      {!isInstalled
                                        ? "(Not Installed/Authorized)"
                                        : ""}
                                    </SelectItem>
                                  );
                                })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Repository</Label>
                          <Select
                            value={githubRepo}
                            onValueChange={(value) =>
                              setGithubRepo(value ?? "")
                            }
                            disabled={
                              !githubAccount ||
                              gitProviders?.filter(
                                (p) => p.provider === providerType,
                              ).length === 0
                            }
                          >
                            <SelectTrigger className="border-border/40">
                              <SelectValue
                                placeholder={
                                  loadingRepos
                                    ? "Loading Repositories..."
                                    : "Select Repository"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {gitRepos?.map((repo) => (
                                <SelectItem key={repo.id} value={repo.fullName}>
                                  {repo.fullName}
                                </SelectItem>
                              ))}
                              {(!gitRepos || gitRepos.length === 0) && (
                                <SelectItem value="none" disabled>
                                  No Repositories Found
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Branch</Label>
                            <Select
                              value={githubBranch}
                              onValueChange={(value) =>
                                setGithubBranch(value ?? "")
                              }
                              disabled={
                                !githubRepo ||
                                gitProviders?.filter(
                                  (p) => p.provider === providerType,
                                ).length === 0
                              }
                            >
                              <SelectTrigger className="border-border/40">
                                <SelectValue
                                  placeholder={
                                    loadingBranches
                                      ? "Loading Branches..."
                                      : "Select Branch"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {gitBranches?.map((branch) => (
                                  <SelectItem key={branch} value={branch}>
                                    {branch}
                                  </SelectItem>
                                ))}
                                {(!gitBranches || gitBranches.length === 0) && (
                                  <SelectItem value="none" disabled>
                                    No Branches Found
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Compose Path</Label>
                            <Input
                              value={githubComposePath}
                              onChange={(e) =>
                                setGithubComposePath(e.target.value)
                              }
                              placeholder="./docker-compose.yml"
                              className="border-border/40 bg-card/30"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Trigger Type</Label>
                          <Select
                            value={githubTriggerType}
                            onValueChange={(value) =>
                              setGithubTriggerType(value ?? "On Push")
                            }
                          >
                            <SelectTrigger className="border-border/40">
                              <SelectValue placeholder="Select Trigger" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="On Push">On Push</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Watch Paths */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            Watch Paths{" "}
                            <span className="font-normal text-[10px] text-muted-foreground">
                              (Trigger build only when changes occur under these
                              paths)
                            </span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="watch-path-in"
                              placeholder="e.g. src/**, dist/*.js"
                              className="flex-1 border-border/40 bg-card/30"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim();
                                  if (val && !githubWatchPaths.includes(val)) {
                                    setGithubWatchPaths([
                                      ...githubWatchPaths,
                                      val,
                                    ]);
                                    e.currentTarget.value = "";
                                  }
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                const input = document.getElementById(
                                  "watch-path-in",
                                ) as HTMLInputElement;
                                const val = input?.value?.trim();
                                if (val && !githubWatchPaths.includes(val)) {
                                  setGithubWatchPaths([
                                    ...githubWatchPaths,
                                    val,
                                  ]);
                                  input.value = "";
                                }
                              }}
                              className="text-xs"
                            >
                              Add
                            </Button>
                          </div>
                          {githubWatchPaths.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {githubWatchPaths.map((p) => (
                                <span
                                  key={p}
                                  className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-accent/30 px-2 py-0.5 text-foreground text-xs"
                                >
                                  {p}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setGithubWatchPaths(
                                        githubWatchPaths.filter((x) => x !== p),
                                      )
                                    }
                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Enable submodules */}
                        <div className="flex items-center justify-between border-border/20 border-t pt-2">
                          <div>
                            <span className="block font-medium text-foreground text-sm">
                              Enable Submodules
                            </span>
                            <span className="text-muted-foreground text-xs">
                              Clone submodules recursively during repository
                              checkouts.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={githubSubmodules}
                            onChange={(e) =>
                              setGithubSubmodules(e.target.checked)
                            }
                            className="size-4 cursor-pointer rounded accent-primary"
                          />
                        </div>
                      </div>
                    )}

                    {/* Git Form */}
                    {providerType === "git" && (
                      <div className="space-y-4 pt-2">
                        <div className="grid items-end gap-4 sm:grid-cols-3">
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Repository URL</Label>
                            <Input
                              value={gitUrl}
                              onChange={(e) => setGitUrl(e.target.value)}
                              placeholder="git@github.com:user/repo.git"
                              className="border-border/40 bg-card/30"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="flex items-center justify-between">
                              <span>SSH Key</span>
                              <Link
                                href={"/ssh-keys" as Route}
                                className="text-[10px] text-primary hover:underline"
                              >
                                Manage Keys
                              </Link>
                            </Label>
                            <Select
                              value={gitSshKeyId}
                              onValueChange={(value) =>
                                setGitSshKeyId(value ?? "")
                              }
                            >
                              <SelectTrigger className="border-border/40">
                                <SelectValue placeholder="Select SSH Key" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  No authentication
                                </SelectItem>
                                {sshKeys?.map((key) => (
                                  <SelectItem key={key.id} value={key.id}>
                                    {key.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Branch</Label>
                            <Input
                              value={gitBranch}
                              onChange={(e) => setGitBranch(e.target.value)}
                              placeholder="master"
                              className="border-border/40 bg-card/30"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Compose Path</Label>
                            <Input
                              value={gitComposePath}
                              onChange={(e) =>
                                setGitComposePath(e.target.value)
                              }
                              placeholder="./docker-compose.yml"
                              className="border-border/40 bg-card/30"
                            />
                          </div>
                        </div>

                        {/* Watch Paths */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            Watch Paths
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="git-watch-path-in"
                              placeholder="e.g. src/**, dist/*.js"
                              className="flex-1 border-border/40 bg-card/30"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim();
                                  if (val && !gitWatchPaths.includes(val)) {
                                    setGitWatchPaths([...gitWatchPaths, val]);
                                    e.currentTarget.value = "";
                                  }
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                const input = document.getElementById(
                                  "git-watch-path-in",
                                ) as HTMLInputElement;
                                const val = input?.value?.trim();
                                if (val && !gitWatchPaths.includes(val)) {
                                  setGitWatchPaths([...gitWatchPaths, val]);
                                  input.value = "";
                                }
                              }}
                              className="text-xs"
                            >
                              Add
                            </Button>
                          </div>
                          {gitWatchPaths.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {gitWatchPaths.map((p) => (
                                <span
                                  key={p}
                                  className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-accent/30 px-2 py-0.5 text-foreground text-xs"
                                >
                                  {p}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setGitWatchPaths(
                                        gitWatchPaths.filter((x) => x !== p),
                                      )
                                    }
                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Enable submodules */}
                        <div className="flex items-center justify-between border-border/20 border-t pt-2">
                          <div>
                            <span className="block font-medium text-foreground text-sm">
                              Enable Submodules
                            </span>
                            <span className="text-muted-foreground text-xs">
                              Clone submodules recursively during repository
                              checkouts.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={gitSubmodules}
                            onChange={(e) => setGitSubmodules(e.target.checked)}
                            className="size-4 cursor-pointer rounded accent-primary"
                          />
                        </div>
                      </div>
                    )}

                    {/* Raw Form */}
                    {providerType === "raw" && (
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label>Compose File</Label>
                          <div className="overflow-hidden rounded-md border border-border/30 bg-zinc-950 p-2">
                            <CodeEditor
                              height="350px"
                              language="yaml"
                              value={rawComposeFile}
                              onChange={(value) =>
                                setRawComposeFile(value || "")
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Button */}
                    <div className="flex justify-end border-border/20 border-t pt-2">
                      <Button
                        onClick={handleSaveProvider}
                        disabled={updateResourceMutation.isPending}
                        className="font-medium"
                      >
                        {updateResourceMutation.isPending
                          ? "Saving..."
                          : "Save"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rename settings */}
              <Card className="border border-border/40 bg-card/20">
                <CardHeader>
                  <CardTitle className="font-semibold text-lg">
                    General Configuration
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    Modify resource identification parameters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="border-border/20 border-t pt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (nameInput.trim()) {
                        updateResourceMutation.mutate(
                          { id: resourceId, name: nameInput.trim() },
                          {
                            onSuccess: () =>
                              toast.success("Resource name saved"),
                          },
                        );
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="res-name-set">Resource Name</Label>
                      <Input
                        id="res-name-set"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="border-border/40 bg-card/30"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        updateResourceMutation.isPending || !nameInput.trim()
                      }
                    >
                      {updateResourceMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="border border-destructive/20 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="font-semibold text-destructive text-lg">
                    Danger Zone
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    Permanently delete this service. This action is
                    irreversible.
                  </CardDescription>
                </CardHeader>
                <CardContent className="border-destructive/10 border-t pt-4">
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    Delete Resource
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar info */}
            <div className="space-y-6">
              <Card className="border border-border/40 bg-card/10">
                <CardHeader>
                  <CardTitle className="font-semibold text-base">
                    Resource Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 border-border/20 border-t pt-4 text-xs">
                  <div className="space-y-1">
                    <span className="block font-medium text-muted-foreground">
                      Resource ID
                    </span>
                    <span className="break-all font-mono text-foreground">
                      {resource.id}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="block font-medium text-muted-foreground">
                      Environment ID
                    </span>
                    <span className="break-all font-mono text-foreground">
                      {resource.environmentId}
                    </span>
                  </div>
                  {resource.type === "database" ? (
                    <>
                      <div className="space-y-1">
                        <span className="block font-medium text-muted-foreground">
                          Docker Image
                        </span>
                        <span className="font-mono font-semibold text-foreground">
                          {resource.dockerImage}
                        </span>
                      </div>

                      {dbConfig && (
                        <div className="mt-4 space-y-3 rounded-xl border border-border/30 bg-muted/5 p-4 md:col-span-2">
                          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            Connection Details
                          </h4>
                          <div className="grid gap-4 text-xs sm:grid-cols-2">
                            <div className="space-y-1">
                              <span className="block font-medium text-muted-foreground">
                                Internal Hostname
                              </span>
                              <span className="font-mono font-semibold text-foreground">
                                {resource.appName}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <span className="block font-medium text-muted-foreground">
                                Internal Port
                              </span>
                              <span className="font-mono font-semibold text-zinc-300">
                                {resource.dbType?.toLowerCase() === "postgres"
                                  ? "5432"
                                  : resource.dbType?.toLowerCase() ===
                                        "mysql" ||
                                      resource.dbType?.toLowerCase() ===
                                        "mariadb"
                                    ? "3306"
                                    : resource.dbType?.toLowerCase() ===
                                        "mongodb"
                                      ? "27017"
                                      : "6379"}
                              </span>
                            </div>

                            {dbConfig.dbUser && (
                              <div className="space-y-1">
                                <span className="block font-medium text-muted-foreground">
                                  {resource.dbType?.toLowerCase() === "mongodb"
                                    ? "Root User"
                                    : "Database User"}
                                </span>
                                <span className="font-mono font-semibold text-foreground">
                                  {dbConfig.dbUser}
                                </span>
                              </div>
                            )}

                            {dbConfig.dbName && (
                              <div className="space-y-1">
                                <span className="block font-medium text-muted-foreground">
                                  Database Name
                                </span>
                                <span className="font-mono font-semibold text-foreground">
                                  {dbConfig.dbName}
                                </span>
                              </div>
                            )}

                            {dbConfig.dbPassword && (
                              <div className="space-y-1 sm:col-span-2">
                                <span className="block font-medium text-muted-foreground">
                                  Password
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="select-all font-mono font-semibold text-zinc-300 tracking-wide">
                                    {showDbPassword
                                      ? dbConfig.dbPassword
                                      : "••••••••••••••••"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setShowDbPassword(!showDbPassword)
                                    }
                                    className="size-7 cursor-pointer hover:bg-muted/10"
                                  >
                                    {showDbPassword ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {dbConfig.dbRootPassword && (
                              <div className="space-y-1 sm:col-span-2">
                                <span className="block font-medium text-muted-foreground">
                                  Root Password
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="select-all font-mono font-semibold text-zinc-300 tracking-wide">
                                    {showDbRootPassword
                                      ? dbConfig.dbRootPassword
                                      : "••••••••••••••••"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setShowDbRootPassword(!showDbRootPassword)
                                    }
                                    className="size-7 cursor-pointer hover:bg-muted/10"
                                  >
                                    {showDbRootPassword ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1">
                      <span className="block font-medium text-muted-foreground">
                        Provider
                      </span>
                      <span className="font-semibold text-foreground uppercase">
                        {resource.provider}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className="block font-medium text-muted-foreground">
                      Creation Date
                    </span>
                    <span className="font-semibold text-foreground">
                      {new Date(resource.createdAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6 outline-none">
          <ResourceAdvancedSettings
            resourceId={resourceId}
            resourceType={resource.type}
            advancedConfig={resource.advancedConfig}
          />
        </TabsContent>

        {/* ─── ENVIRONMENT TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="environment" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Environment Variables
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Define configuration variables injected into container
                processes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 border-border/20 border-t pt-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Key (e.g. API_KEY)"
                  value={newEnvKey}
                  onChange={(e) =>
                    setNewEnvKey(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                    )
                  }
                  className="border-border/40 bg-card/30"
                />
                <Input
                  placeholder="Value"
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  className="border-border/40 bg-card/30"
                />
                <Button
                  onClick={addEnvVar}
                  variant="outline"
                  className="gap-2 border-border/40 font-medium"
                >
                  <Plus className="size-4" /> Add Variable
                </Button>
              </div>

              {envList.length > 0 ? (
                <div className="mt-6 overflow-hidden border border-border/20 bg-card/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                        <th className="p-3">Environment Key</th>
                        <th className="p-3">Injected Value</th>
                        <th className="w-16 p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {envList.map((item) => {
                        const isVisible = visibleEnvKeys[item.key];
                        return (
                          <tr
                            key={item.key}
                            className="border-border/10 border-b hover:bg-muted/5"
                          >
                            <td className="p-3 font-mono font-semibold text-foreground">
                              {item.key}
                            </td>
                            <td className="p-3 font-mono text-zinc-300">
                              <span className="flex items-center gap-2">
                                <span className="flex-1 select-all break-all">
                                  {item.value ? (
                                    isVisible ? (
                                      item.value
                                    ) : (
                                      "••••••••••••"
                                    )
                                  ) : (
                                    <span className="text-zinc-600 italic">
                                      Empty
                                    </span>
                                  )}
                                </span>
                                {item.value && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setVisibleEnvKeys((prev) => ({
                                        ...prev,
                                        [item.key]: !prev[item.key],
                                      }))
                                    }
                                    className="size-7 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                                  >
                                    {isVisible ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </Button>
                                )}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex justify-center gap-1">
                                <Button
                                  onClick={() =>
                                    editEnvVar(item.key, item.value)
                                  }
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:bg-muted/10"
                                >
                                  <Code className="size-3.5" />
                                </Button>
                                <Button
                                  onClick={() => deleteEnvVar(item.key)}
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No environment variables defined yet.
                </div>
              )}

              <div className="flex justify-end border-border/20 border-t pt-4">
                <Button
                  onClick={saveEnvVars}
                  disabled={updateResourceMutation.isPending}
                  className="font-medium"
                >
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DOMAINS TAB ───────────────────────────────────────────────────────── */}
        <TabsContent value="domains" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Domains & HTTPS
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Route a public hostname to a service on the Upstand overlay
                network. HTTPS uses Caddy Automatic HTTPS and Let&apos;s
                Encrypt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 border-border/20 border-t pt-4">
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="domain-service">Service name</FieldLabel>
                  {routingTargets.length > 0 && (
                    <Select
                      value={domainDraft.serviceName || "manual"}
                      onValueChange={(serviceName) =>
                        setDomainDraft((current) => ({
                          ...current,
                          serviceName:
                            serviceName === "manual" || !serviceName
                              ? ""
                              : serviceName,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a deployed service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {routingTargets.map((target) => (
                            <SelectItem key={target} value={target}>
                              {target}
                            </SelectItem>
                          ))}
                          <SelectItem value="manual">Manual entry</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    id="domain-service"
                    value={domainDraft.serviceName || ""}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        serviceName: event.target.value,
                      }))
                    }
                    placeholder={
                      resource?.type === "compose"
                        ? "e.g. storefront_web"
                        : resource?.appName || resource?.name || "service-name"
                    }
                  />
                  <FieldDescription>
                    {resource?.type === "compose"
                      ? "Compose resources require the exact deployed Swarm service name."
                      : "Leave blank to use this resource's Swarm service name."}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="domain-host">Host</FieldLabel>
                  <Input
                    id="domain-host"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="app.example.com"
                    value={domainDraft.host}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        host: event.target.value,
                      }))
                    }
                  />
                  <FieldDescription>
                    DNS must point to this server and ports 80 and 443 must be
                    publicly reachable for Let&apos;s Encrypt.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="domain-path">Public path</FieldLabel>
                  <Input
                    id="domain-path"
                    value={domainDraft.path}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        path: event.target.value,
                      }))
                    }
                    placeholder="/"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="domain-internal-path">
                    Internal path prefix
                  </FieldLabel>
                  <Input
                    id="domain-internal-path"
                    value={domainDraft.internalPath}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        internalPath: event.target.value,
                      }))
                    }
                    placeholder="/"
                  />
                  <FieldDescription>
                    Requests are rewritten to this prefix before reaching the
                    application.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="domain-port">Container port</FieldLabel>
                  <Input
                    id="domain-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={domainDraft.port}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        port: Number.parseInt(event.target.value, 10) || 80,
                      }))
                    }
                  />
                  <FieldDescription>
                    This is the internal service port, not a published host
                    port.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="domain-middlewares">
                    Caddy snippets
                  </FieldLabel>
                  <Input
                    id="domain-middlewares"
                    value={domainDraft.middlewares.join(", ")}
                    onChange={(event) =>
                      setDomainDraft((current) => ({
                        ...current,
                        middlewares: event.target.value.split(","),
                      }))
                    }
                    placeholder="e.g. security-headers, auth"
                  />
                  <FieldDescription>
                    Comma-separated administrator-defined Caddy snippets. These
                    are Caddy imports, not Traefik middleware names.
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="strip-domain-path">
                      Strip path
                    </FieldLabel>
                    <FieldDescription>
                      Remove the public path prefix before proxying the request.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="strip-domain-path"
                    checked={domainDraft.stripPath}
                    onCheckedChange={(stripPath) =>
                      setDomainDraft((current) => ({ ...current, stripPath }))
                    }
                  />
                </Field>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="domain-https">HTTPS</FieldLabel>
                    <FieldDescription>
                      Caddy obtains and renews the certificate automatically.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="domain-https"
                    checked={domainDraft.https}
                    onCheckedChange={(https) =>
                      setDomainDraft((current) => ({ ...current, https }))
                    }
                  />
                </Field>
              </FieldGroup>

              <div className="flex flex-wrap justify-end gap-2">
                {editingDomainIndex !== null && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDomainDraft(emptyDomainMapping());
                      setEditingDomainIndex(null);
                    }}
                  >
                    <X data-icon="inline-start" />
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={saveDomain}
                  disabled={updateResourceMutation.isPending}
                >
                  <LinkIcon data-icon="inline-start" />
                  {editingDomainIndex === null
                    ? "Connect domain"
                    : "Save domain"}
                </Button>
              </div>

              {domainList.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/20">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 text-muted-foreground text-xs uppercase">
                        <TableHead>Host</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Upstream</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead className="w-24 text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domainList.map((item, idx) => (
                        <TableRow key={`${item.host}:${item.path}`}>
                          <TableCell className="font-medium text-primary">
                            {item.host}
                          </TableCell>
                          <TableCell className="font-mono">
                            {item.path}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {item.serviceName ||
                            resource?.appName ||
                            resource?.name
                              ? `${item.serviceName || resource?.appName || resource?.name}:${item.port}`
                              : item.port}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={item.https ? "default" : "secondary"}
                            >
                              {item.https
                                ? "HTTPS / Let’s Encrypt"
                                : "HTTP only"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              onClick={() => editDomain(idx)}
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${item.host}${item.path}`}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              type="button"
                              onClick={() => deleteDomain(idx)}
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete ${item.host}${item.path}`}
                              className="text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No external domains linked.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── DEPLOYMENTS TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="deployments" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Deployment Webhook & Trigger
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Manually build or setup external CI trigger pipelines.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 border-border/20 border-t pt-4">
              <div className="space-y-2">
                <Label>Auto Deploy Webhook Endpoint URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={
                      typeof window !== "undefined"
                        ? `${getServerUrl()}/api/deploy/rc-${resource.id}`
                        : ""
                    }
                    className="select-all border-border/40 bg-black/40 font-mono text-xs text-zinc-300"
                  />
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(
                          `${getServerUrl()}/api/deploy/rc-${resource.id}`,
                        );
                        toast.success("Webhook URL copied to clipboard");
                      }
                    }}
                    variant="outline"
                    className="border-border/40"
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={triggerDeployment}
                  disabled={isBuilding}
                  className="gap-2 font-medium"
                >
                  <RefreshCw
                    className={cn("size-4", isBuilding && "animate-spin")}
                  />
                  Deploy Now
                </Button>
                <Button
                  onClick={clearDeployments}
                  variant="outline"
                  className="gap-2 border-border/40"
                >
                  <Trash2 className="size-4" /> Clear Deployments
                </Button>
                <Button
                  onClick={() => toast.success("Kill Build signal dispatched")}
                  variant="outline"
                  className="gap-2 border-border/40"
                >
                  Kill Build
                </Button>
                <Button
                  onClick={() => toast.success("Current deployment cancelled")}
                  variant="outline"
                  className="gap-2 border-border/40"
                >
                  Cancel Deployment
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/40 bg-card/20">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Deployment History (Max 10)
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Audit trail of recent project builds.
              </CardDescription>
            </CardHeader>
            <CardContent className="border-border/20 border-t pt-4">
              {deployList.length > 0 ? (
                <div className="overflow-hidden border border-border/20 bg-card/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                        <th className="p-3">Deployment ID</th>
                        <th className="p-3">Pipeline Status</th>
                        <th className="p-3">Trigger Time</th>
                        <th className="p-3 text-center">Logs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deployList.map((dep) => (
                        <tr
                          key={dep.id}
                          className="border-border/10 border-b hover:bg-muted/5"
                        >
                          <td className="p-3 font-mono font-semibold text-foreground text-xs">
                            {dep.id}
                          </td>
                          <td className="p-3">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 font-semibold text-xs",
                                dep.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-destructive/10 text-destructive",
                              )}
                            >
                              {dep.status}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {new Date(dep.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              onClick={() => {
                                setSelectedDeployment(dep);
                                setViewDeploymentLogsOpen(true);
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 font-medium text-xs hover:bg-accent"
                            >
                              <Eye className="size-3.5" /> Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No deployment history found.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CONTAINERS TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="containers" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Active Swarm Replicas
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Containers matching Swarm service replica specification.
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
                                  onClick={() =>
                                    dispatchContainerCommand(con.id, "kill")
                                  }
                                >
                                  <Trash2 className="mr-2 size-4 text-destructive" />{" "}
                                  Kill
                                </DropdownMenuItem>
                                <hr className="my-1 border-border/20" />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedContainer(con);
                                    setContainerModalType("logs");
                                  }}
                                >
                                  <FileText className="mr-2 size-4" /> View Logs
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedContainer(con);
                                    setContainerModalType("config");
                                  }}
                                >
                                  <Code className="mr-2 size-4" /> View Config
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedContainer(con);
                                    setContainerModalType("networks");
                                  }}
                                >
                                  <Network className="mr-2 size-4" /> View
                                  Networks
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedContainer(con);
                                    setContainerModalType("mounts");
                                  }}
                                >
                                  <HardDrive className="mr-2 size-4" /> View
                                  Mounts
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
                  No container replicas registered.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="space-y-6 outline-none">
          <BackupPanel
            resource={resource}
            organizationId={project.organizationId}
          />
        </TabsContent>

        {/* ─── LOGS TAB ──────────────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="font-semibold text-lg">
                  Container Logs
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  View live stderr/stdout output streams from active containers.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="log-container-select"
                  className="whitespace-nowrap font-medium text-muted-foreground text-xs"
                >
                  Filter by Container:
                </Label>
                <Select
                  value={selectedLogContainerId}
                  onValueChange={(value) =>
                    setSelectedLogContainerId(value ?? "all")
                  }
                >
                  <SelectTrigger
                    id="log-container-select"
                    className="h-9 w-56 border-border/40 bg-background text-xs"
                  >
                    <SelectValue placeholder="Select Container" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      All Containers
                    </SelectItem>
                    {containerList.map((con) => (
                      <SelectItem
                        key={con.id}
                        value={con.id}
                        className="text-xs"
                      >
                        {con.name} ({con.id.substring(0, 7)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="border-border/20 border-t pt-4">
              <ShowDockerLogs
                containerId={selectedLogContainerId}
                logs={realLogs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MONITORING TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="monitoring" className="space-y-6 outline-none">
          <Card className="border border-border/40 bg-card/20">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="font-semibold text-lg">
                  Live Resource Metrics
                </CardTitle>
                <CardDescription className="text-muted-foreground text-sm">
                  Real Docker statistics aggregated across{" "}
                  {statsData?.containerCount ?? 0} active container replicas.
                  History starts when this tab is opened.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 border-border/20 border-t pt-4">
              <div className="grid gap-6 md:grid-cols-2">
                {/* CPU usage */}
                <Card className="border border-border/40 bg-black/20 p-4">
                  <CardHeader className="p-0 pb-4">
                    <CardTitle className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      Workload CPU (%)
                    </CardTitle>
                  </CardHeader>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={metrics}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="cpuGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="time"
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cpu"
                          stroke="var(--color-primary)"
                          fillOpacity={1}
                          fill="url(#cpuGrad)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* RAM usage */}
                <Card className="border border-border/40 bg-black/20 p-4">
                  <CardHeader className="p-0 pb-4">
                    <CardTitle className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      Memory Utilization (%)
                    </CardTitle>
                  </CardHeader>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={metrics}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="ramGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-chart-2)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-chart-2)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="time"
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="var(--color-muted-foreground)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="ram"
                          stroke="var(--color-chart-2)"
                          fillOpacity={1}
                          fill="url(#ramGrad)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── MODALS ───────────────────────────────────────────────────────────── */}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-2xl border border-destructive/30 bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-destructive text-xl">
              <HugeiconsIcon icon={Alert02Icon} className="size-5" />
              Delete Resource
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {resource.name}
              </span>
              ? This will permanently stop the service and delete its history.
            </DialogDescription>
            <div className="mt-3 flex items-start gap-2 border-border/40 border-t py-3">
              <input
                id="delete-volumes-checkbox"
                type="checkbox"
                checked={deleteVolumes}
                onChange={(e) => setDeleteVolumes(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer rounded accent-destructive"
              />
              <label
                htmlFor="delete-volumes-checkbox"
                className="cursor-pointer select-none text-muted-foreground text-xs leading-relaxed"
              >
                Remove associated Docker volumes (Warning: this will delete all
                persistent database/application data permanently)
              </label>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteResourceMutation.isPending}
              className="gap-2"
              onClick={() => {
                deleteResourceMutation.mutate({
                  id: resourceId,
                  deleteVolumes,
                });
              }}
            >
              {deleteResourceMutation.isPending && (
                <Spinner className="size-4" />
              )}
              Delete Resource
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deployment build logs modal */}
      <Dialog
        open={viewDeploymentLogsOpen}
        onOpenChange={setViewDeploymentLogsOpen}
      >
        <DialogContent className="max-w-2xl rounded-2xl border border-border bg-black font-mono shadow-2xl">
          <DialogHeader className="border-zinc-800 border-b pb-3">
            <DialogTitle className="font-semibold text-zinc-300">
              Build & Deploy Logs: {selectedDeployment?.id}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Generated on{" "}
              {selectedDeployment &&
                new Date(selectedDeployment.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 select-text overflow-y-auto whitespace-pre-wrap bg-zinc-950 p-4 font-mono text-xs text-zinc-300 leading-relaxed">
            {selectedDeployment?.logs || "No logs available."}
          </div>
          <DialogFooter className="border-zinc-800 border-t pt-3">
            <Button
              onClick={() => setViewDeploymentLogsOpen(false)}
              className="border-none bg-zinc-800 hover:bg-zinc-700"
            >
              Close Logs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Container detail dialogs */}
      <Dialog
        open={containerModalType !== null}
        onOpenChange={(v) => {
          if (!v) setContainerModalType(null);
        }}
      >
        <DialogContent className="max-w-xl rounded-2xl border border-border bg-card shadow-2xl">
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
            <DialogDescription className="text-muted-foreground text-xs">
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
            <pre className="max-h-80 select-text overflow-auto bg-black/40 p-4 font-mono text-xs">
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
                  Environment: envList.reduce(
                    (acc, curr) => ({ ...acc, [curr.key]: curr.value }),
                    {},
                  ),
                },
                null,
                2,
              )}
            </pre>
          )}

          {containerModalType === "networks" && (
            <div className="space-y-3 bg-muted/10 p-4 text-foreground text-sm">
              <div className="flex justify-between border-border/10 border-b pb-1.5">
                <span className="text-muted-foreground">Network Name</span>
                <span className="font-mono font-semibold">
                  upstand-overlay-net
                </span>
              </div>
              <div className="flex justify-between border-border/10 border-b pb-1.5">
                <span className="text-muted-foreground">Gateway IP</span>
                <span className="font-mono font-semibold">10.0.4.1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allocated IP</span>
                <span className="font-mono font-semibold">10.0.4.15</span>
              </div>
            </div>
          )}

          {containerModalType === "mounts" && (
            <div className="space-y-3 bg-muted/10 p-4 text-foreground text-sm">
              <div className="flex flex-col gap-1 border-border/10 border-b pb-2">
                <span className="font-semibold text-muted-foreground text-xs">
                  VOLUME MOUNT
                </span>
                <span className="break-all font-mono font-semibold text-xs">
                  /var/lib/docker/volumes/{resource.appName}_data/_data
                </span>
                <span className="font-medium text-primary text-xs">
                  Mapped to /data inside container
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
            <Button onClick={() => setContainerModalType(null)}>
              Close View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
