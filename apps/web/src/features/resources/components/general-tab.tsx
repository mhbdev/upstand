"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApplicationBuildConfig } from "@upstand/domain";
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
import { Switch } from "@upstand/ui/components/switch";
import { cn } from "@upstand/ui/lib/utils";
import { Code, Globe, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { trpc } from "@/utils/trpc";

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

interface GeneralTabProps {
  resource: any;
  sshKeys: any[];
  gitProviders: any[];
  updateResource: any;
  isUpdatingResource: boolean;
  deployResource: any;
  isDeployingResource: boolean;
  controlResource: any;
  isControllingResource: boolean;
  deleteResource: any;
  isDeletingResource: boolean;
}

export type ResourceProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "gitea"
  | "git"
  | "raw";

const parseApplicationBuildConfig = (
  value: string | null | undefined,
): ApplicationBuildConfig => {
  if (!value)
    return {
      type: "dockerfile",
      dockerfilePath: "Dockerfile",
      dockerContextPath: ".",
      dockerBuildArgs: {},
    };
  try {
    return JSON.parse(value);
  } catch {
    return {
      type: "dockerfile",
      dockerfilePath: "Dockerfile",
      dockerContextPath: ".",
      dockerBuildArgs: {},
    };
  }
};

const parseResourceCredentials = (value: string | null | undefined): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

export function GeneralTab({
  resource,
  sshKeys,
  gitProviders,
  updateResource,
  isUpdatingResource,
  deployResource,
  isDeployingResource,
  controlResource,
  isControllingResource,
  deleteResource,
  isDeletingResource,
}: GeneralTabProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // General Rename State
  const [nameInput, setNameInput] = useState("");

  // Build Configuration State
  const [buildConfig, setBuildConfig] = useState<ApplicationBuildConfig>(() =>
    parseApplicationBuildConfig(resource.buildConfig),
  );

  // Provider State
  const [providerType, setProviderType] = useState<ResourceProvider>("github");
  const [autoDeploy, setAutoDeploy] = useState(true);

  // Specific Provider States
  const [githubAccount, setGithubAccount] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
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

  const [rawComposeFile, setRawComposeFile] = useState("");

  const isRunning = resource.status === "running";
  const isBuilding = resource.deployments
    ? JSON.parse(resource.deployments || "[]").some(
        (d: any) => d.status === "running",
      )
    : false;

  // Hydrate states when resource changes
  useEffect(() => {
    if (resource) {
      setNameInput(resource.name);
      setBuildConfig(parseApplicationBuildConfig(resource.buildConfig));
      if (resource.provider) {
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
  }, [resource]);

  // Fetch Repositories and Branches for select provider type
  const isSupported = ["github", "gitlab", "bitbucket", "gitea"].includes(
    providerType,
  );
  const isGitReposEnabled =
    !!githubAccount &&
    isSupported &&
    (() => {
      const p = gitProviders?.find((x) => x.id === githubAccount);
      if (!p) return false;
      const config = JSON.parse(p.config);
      if (p.provider === "github") return !!config.githubInstallationId;
      if (p.provider === "gitlab" || p.provider === "gitea")
        return !!config.accessToken;
      if (p.provider === "bitbucket") return true;
      return false;
    })();

  const gitReposQuery = useQuery({
    ...trpc.gitProvider.listRepositories.queryOptions({
      gitProviderId: githubAccount,
    }),
    enabled: isGitReposEnabled,
  });

  const [repoOwner, repoName] = githubRepo.includes("/")
    ? githubRepo.split("/")
    : ["", githubRepo];

  const isGitBranchesEnabled =
    !!githubAccount &&
    isSupported &&
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
    })();

  const gitBranchesQuery = useQuery({
    ...trpc.gitProvider.listBranches.queryOptions({
      gitProviderId: githubAccount,
      owner: repoOwner,
      repo: repoName,
    }),
    enabled: isGitBranchesEnabled,
  });

  const gitRepos = gitReposQuery.data;
  const loadingRepos = gitReposQuery.isPending;
  const gitBranches = gitBranchesQuery.data;
  const loadingBranches = gitBranchesQuery.isPending;

  // Sync GitHub account dropdown when switching tabs
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

  // Reset repository when account changes
  useEffect(() => {
    if (githubAccount && gitRepos && gitRepos.length > 0) {
      const exists = gitRepos.some((r: any) => r.fullName === githubRepo);
      if (!exists) {
        setGithubRepo(gitRepos[0].fullName);
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

  const handleSaveProvider = () => {
    let config: any = { provider: providerType, autoDeploy };
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

    updateResource(
      {
        id: resource.id,
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
    controlResource({ id: resource.id, command });
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      updateResource(
        { id: resource.id, name: nameInput.trim() },
        {
          onSuccess: () => toast.success("Resource name saved"),
        },
      );
    }
  };

  return (
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
                  Deploy the container automatically when source code updates.
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
                    updateResource(
                      {
                        id: resource.id,
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

            <div className="flex flex-wrap gap-2 border-border/20 border-t pt-4">
              <Button
                onClick={() => deployResource({ id: resource.id })}
                disabled={isBuilding || isDeployingResource}
                className="gap-2 font-medium"
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    (isBuilding || isDeployingResource) && "animate-spin",
                  )}
                />
                Deploy Now
              </Button>
              <Button
                onClick={() =>
                  triggerStatusChange(isRunning ? "stopped" : "running")
                }
                variant="outline"
                disabled={isControllingResource}
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
                Select the builder and configure only the inputs it requires.
                Changes apply to the next deployment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 border-border/20 border-t pt-4">
              <FieldGroup>
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="build-type">Build type</FieldLabel>
                    <FieldDescription>
                      Dockerfile, Railpack, Nixpacks, Cloud Native Buildpacks,
                      or a static NGINX image.
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    value={buildConfig.type}
                    onValueChange={(value) => {
                      const nextType = value as ApplicationBuildConfig["type"];
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
                        <SelectItem value="dockerfile">Dockerfile</SelectItem>
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
                      <Label htmlFor="dockerfile-path">Dockerfile path</Label>
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
                            dockerBuildStage: event.target.value || undefined,
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
                            // Keep reactive typing
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
                  <Label htmlFor="railpack-version">Railpack version</Label>
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
                      <SelectItem value="custom">Custom version</SelectItem>
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
                    <span className="text-muted-foreground">(optional)</span>
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
                  <Label htmlFor="heroku-version">Heroku stack version</Label>
                  <Select
                    value={buildConfig.herokuVersion}
                    onValueChange={(value) => {
                      setBuildConfig({
                        ...buildConfig,
                        herokuVersion: value as "24" | "26",
                      });
                    }}
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
                  Paketo builds use the production Jammy full builder and rely
                  on buildpack detection in your repository.
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
                  <Field orientation="horizontal" className="w-full sm:w-auto">
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
                      onCheckedChange={(spa) => {
                        setBuildConfig({ ...buildConfig, spa });
                      }}
                    />
                  </Field>
                </div>
              )}

              <div className="flex justify-end border-border/20 border-t pt-4">
                <Button
                  type="button"
                  onClick={() =>
                    updateResource({ id: resource.id, buildConfig })
                  }
                  disabled={isUpdatingResource}
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
              <div
                aria-label="Source provider"
                className="flex max-w-full gap-1 overflow-x-auto border border-border/30 bg-muted/40 p-1 [scrollbar-width:thin]"
                role="tablist"
              >
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
                      aria-selected={active}
                      role="tab"
                      type="button"
                      onClick={() =>
                        setProviderType(prov.id as ResourceProvider)
                      }
                      className={cn(
                        "flex shrink-0 cursor-pointer items-center gap-2 border-none px-3 py-1.5 font-semibold text-xs transition-colors",
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
                  {gitProviders?.filter((p) => p.provider === providerType)
                    .length === 0 && (
                    <div className="space-y-1 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3.5 text-xs text-yellow-600">
                      <p className="font-semibold capitalize">
                        No {providerType} accounts configured.
                      </p>
                      <p>
                        To pull repositories and branches from {providerType},
                        configure a connection in{" "}
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
                    <Label className="capitalize">{providerType} Account</Label>
                    <Select
                      value={githubAccount}
                      onValueChange={(value) => setGithubAccount(value ?? "")}
                      disabled={
                        gitProviders?.filter((p) => p.provider === providerType)
                          .length === 0
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
                      onValueChange={(value) => setGithubRepo(value ?? "")}
                      disabled={
                        !githubAccount ||
                        gitProviders?.filter((p) => p.provider === providerType)
                          .length === 0
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
                        {gitRepos?.map((repo: any) => (
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
                        onValueChange={(value) => setGithubBranch(value ?? "")}
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
                          {gitBranches?.map((branch: string) => (
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
                        onChange={(e) => setGithubComposePath(e.target.value)}
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
                              setGithubWatchPaths([...githubWatchPaths, val]);
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
                            setGithubWatchPaths([...githubWatchPaths, val]);
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
                      onChange={(e) => setGithubSubmodules(e.target.checked)}
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
                        onValueChange={(value) => setGitSshKeyId(value ?? "")}
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
                        onChange={(e) => setGitComposePath(e.target.value)}
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
                    <div className="overflow-hidden rounded-md border border-border/30 bg-muted/20 p-2">
                      <CodeEditor
                        height="350px"
                        language="yaml"
                        value={rawComposeFile}
                        onChange={(value) => setRawComposeFile(value || "")}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end border-border/20 border-t pt-2">
                <Button
                  onClick={handleSaveProvider}
                  disabled={isUpdatingResource}
                  className="font-medium"
                >
                  {isUpdatingResource ? "Saving..." : "Save"}
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
            <form onSubmit={handleRename} className="space-y-4">
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
                disabled={isUpdatingResource || !nameInput.trim()}
              >
                {isUpdatingResource ? "Saving..." : "Save Changes"}
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
              Permanently delete this service. This action is irreversible.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-destructive/10 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="block font-medium font-semibold text-destructive text-sm">
                  Delete Resource
                </span>
                <span className="text-muted-foreground text-xs">
                  This terminates container states and removes configuration
                  items.
                </span>
              </div>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2"
              >
                <Trash2 className="size-4" /> Delete Resource
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: details info */}
      <div className="space-y-6">
        <Card className="border border-border/40 bg-card/20">
          <CardHeader>
            <CardTitle className="font-semibold text-base">
              Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/20 border-border/10 border-t pt-2 text-sm">
            {[
              { label: "Resource ID", value: resource.id },
              { label: "Type", value: resource.type, className: "capitalize" },
              {
                label: "Docker Swarm Status",
                value: resource.status,
                className: "capitalize font-semibold text-primary",
              },
            ].map(({ label, value, className }) => (
              <div key={label} className="flex justify-between py-2.5">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("text-right font-mono text-xs", className)}>
                  {value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this resource?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {resource.name}? This permanently
              removes all configuration records, docker service states, and
              active container mappings. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingResource}
              onClick={() => {
                deleteResource({ id: resource.id });
              }}
            >
              {isDeletingResource ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
