"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  PlusSignIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getUpGalTargetDefinition } from "@upstand/api/ai/upgal-ui-targets";
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
import { Switch } from "@upstand/ui/components/switch";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/dashboard/confirm-action-dialog";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { UpGalTarget } from "@/components/upgal-target";
import { authClient } from "@/lib/auth-client";
import { getServerApiUrl, getServerUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

const addGitProviderTarget = getUpGalTargetDefinition("add-git-provider");

type ProviderType = "github" | "gitlab" | "bitbucket" | "gitea";

export default function GitProviders({
  session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [providerType, setProviderType] = useState<ProviderType>("github");

  // Generic states
  const [name, setName] = useState("");

  // GitHub-specific state
  const [isOrganization, setIsOrganization] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [manifest, setManifest] = useState("");
  const [githubManifestState, setGithubManifestState] = useState("");

  // GitLab-specific state
  const [gitlabUrl, setGitlabUrl] = useState("https://gitlab.com");
  const [gitlabAppId, setGitlabAppId] = useState("");
  const [gitlabSecret, setGitlabSecret] = useState("");
  const [gitlabGroupName, setGitlabGroupName] = useState("");

  // Bitbucket-specific state
  const [bitbucketUsername, setBitbucketUsername] = useState("");
  const [bitbucketAppPassword, setBitbucketAppPassword] = useState("");
  const [bitbucketWorkspace, setBitbucketWorkspace] = useState("");

  // Gitea-specific state
  const [giteaUrl, setGiteaUrl] = useState("");
  const [giteaClientId, setGiteaClientId] = useState("");
  const [giteaClientSecret, setGiteaClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const [deleteProviderOpen, setDeleteProviderOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const orgId = activeOrg?.id;

  const oauthStateMutation = useMutation({
    ...trpc.gitProvider.createOAuthState.mutationOptions(),
    onError: (error) => toast.error(error.message),
  });
  const { mutate: issueGithubManifestState } = useMutation({
    ...trpc.gitProvider.createGithubManifestState.mutationOptions(),
    onSuccess: (result) => setGithubManifestState(result.state),
    onError: (error) => toast.error(error.message),
  });

  const {
    data: providers,
    isLoading: loadingProviders,
    refetch,
  } = useQuery({
    ...trpc.gitProvider.list.queryOptions({ organizationId: orgId || "" }),
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    ...trpc.gitProvider.create.mutationOptions(),
    onSuccess: (newProvider) => {
      toast.success("Git Provider registered successfully");
      setAddProviderOpen(false);
      resetForms();
      refetch();

      // If it requires OAuth, open authorize URL in a new window/tab
      if (
        newProvider.provider === "gitlab" ||
        newProvider.provider === "gitea"
      ) {
        oauthStateMutation.mutate(
          { organizationId: orgId || "", providerId: newProvider.id },
          {
            onSuccess: ({ state }) => {
              const authorizeUrl = getOAuthAuthorizeUrl(
                newProvider.id,
                newProvider.provider as ProviderType,
                JSON.parse(newProvider.config),
                state,
              );
              window.open(authorizeUrl, "_blank");
            },
          },
        );
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to register Git Provider");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.gitProvider.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Git Provider deleted successfully");
      setSelectedProvider(null);
      setDeleteProviderOpen(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete Git Provider");
    },
  });

  const randomString = useCallback(
    () => Math.random().toString(36).slice(2, 8),
    [],
  );

  const resetForms = () => {
    setName("");
    setIsOrganization(false);
    setOrgName("");
    setGitlabUrl("https://gitlab.com");
    setGitlabAppId("");
    setGitlabSecret("");
    setGitlabGroupName("");
    setBitbucketUsername("");
    setBitbucketAppPassword("");
    setBitbucketWorkspace("");
    setGiteaUrl("");
    setGiteaClientId("");
    setGiteaClientSecret("");
    setWebhookSecret("");
  };

  useEffect(() => {
    if (!orgId || !session?.user?.id) return;
    const origin = window.location.origin;
    const isLocal =
      getServerUrl().includes("localhost") ||
      getServerUrl().includes("127.0.0.1");

    const manifestData: Record<string, any> = {
      redirect_url: getServerApiUrl(
        `/api/providers/github/setup?organizationId=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(session.user.id)}`,
      ),
      name: `Upstand-${new Date().toISOString().split("T")[0]}-${randomString()}`,
      url: origin,
      callback_urls: [getServerApiUrl("/api/providers/github/setup")],
      public: false,
      request_oauth_on_install: true,
      default_permissions: {
        contents: "read",
        metadata: "read",
        emails: "read",
        pull_requests: "write",
      },
      default_events: ["pull_request", "push"],
    };

    if (!isLocal) {
      manifestData.hook_attributes = {
        url: getServerApiUrl("/api/deploy/github"),
      };
    }

    const manifestJSON = JSON.stringify(manifestData, null, 2);
    setManifest(manifestJSON);
  }, [orgId, session?.user?.id, randomString]);

  useEffect(() => {
    if (orgId && providerType === "github") {
      issueGithubManifestState({ organizationId: orgId });
    }
  }, [orgId, providerType, issueGithubManifestState]);

  const handleCreateNonGithub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      toast.error("No active organization selected");
      return;
    }

    let config = "";
    if (providerType === "gitlab") {
      config = JSON.stringify({
        gitlabUrl: gitlabUrl.replace(/\/+$/, ""),
        applicationId: gitlabAppId.trim(),
        secret: gitlabSecret.trim(),
        groupName: gitlabGroupName.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });
    } else if (providerType === "bitbucket") {
      config = JSON.stringify({
        bitbucketUsername: bitbucketUsername.trim(),
        appPassword: bitbucketAppPassword.trim(),
        bitbucketWorkspaceName: bitbucketWorkspace.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });
    } else if (providerType === "gitea") {
      config = JSON.stringify({
        giteaUrl: giteaUrl.replace(/\/+$/, ""),
        clientId: giteaClientId.trim(),
        clientSecret: giteaClientSecret.trim(),
        webhookSecret: webhookSecret.trim() || undefined,
      });
    }

    createMutation.mutate({
      organizationId: orgId,
      name: name.trim(),
      provider: providerType,
      config,
    });
  };

  const handleDelete = () => {
    if (!selectedProvider) return;
    deleteMutation.mutate({ id: selectedProvider.id });
  };

  const getGithubAppCreationUrl = () => {
    if (isOrganization && orgName.trim()) {
      return `https://github.com/organizations/${orgName.trim()}/settings/apps/new?state=gh_init:${orgId}:${session?.user?.id}`;
    }
    return `https://github.com/settings/apps/new?state=${encodeURIComponent(githubManifestState)}`;
  };

  const getOAuthAuthorizeUrl = (
    providerId: string,
    provider: ProviderType,
    config: any,
    state = providerId,
  ) => {
    if (provider === "gitlab") {
      const redirectUri = getServerApiUrl("/api/providers/gitlab/setup");
      return `${config.gitlabUrl}/oauth/authorize?client_id=${config.applicationId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}&scope=api%20read_user%20read_repository`;
    }
    if (provider === "gitea") {
      const redirectUri = getServerApiUrl("/api/providers/gitea/setup");
      return `${config.giteaUrl}/login/oauth/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
    }
    return "";
  };

  const getInstallationManagementUrl = (
    provider: ProviderType,
    config: Record<string, any>,
  ) => {
    if (provider === "github") {
      // GitHub exposes the installation permissions page for both personal
      // and organization installations at this URL.
      return config.githubInstallationId
        ? `https://github.com/settings/installations/${config.githubInstallationId}`
        : config.githubAppName || "https://github.com/settings/installations";
    }
    if (provider === "gitlab") {
      return `${String(config.gitlabUrl || "https://gitlab.com").replace(/\/$/, "")}/-/profile/applications`;
    }
    if (provider === "gitea") {
      return `${String(config.giteaUrl || "").replace(/\/$/, "")}/user/settings/applications`;
    }
    return "https://bitbucket.org/account/settings/app-passwords/";
  };

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Git Providers"
        icon={
          <HugeiconsIcon
            icon={SourceCodeIcon}
            className="size-6 text-primary"
          />
        }
        description="Add and manage Git providers to pull source code and enable automatic deployments."
        actions={
          <UpGalTarget definition={addGitProviderTarget}>
            <Button
              onClick={() => {
                resetForms();
                setProviderType("github");
                setAddProviderOpen(true);
              }}
              className="gap-2 font-medium"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
              Add Git Provider
            </Button>
          </UpGalTarget>
        }
      />

      {/* Main List */}
      {loadingProviders ? (
        <div className="flex min-h-60 items-center justify-center">
          <Spinner className="size-8" />
        </div>
      ) : !orgId ? (
        <div className="py-12 text-center text-muted-foreground">
          Please select an organization to view Git providers.
        </div>
      ) : providers && providers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => {
            const config = JSON.parse(provider.config);
            let isInstalled = false;

            if (provider.provider === "github") {
              isInstalled = !!config.githubInstallationId;
            } else if (
              provider.provider === "gitlab" ||
              provider.provider === "gitea"
            ) {
              isInstalled = !!config.accessToken;
            } else if (provider.provider === "bitbucket") {
              isInstalled = true; // Bitbucket Credentials are ready instantly
            }

            return (
              <Card key={provider.id} className="flex h-full flex-col">
                <CardHeader className="gap-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground text-xs uppercase">
                      {provider.provider.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-sm">
                            {provider.name}
                          </CardTitle>
                          <CardDescription className="mt-1 truncate text-xs capitalize">
                            {provider.provider} ·{" "}
                            {provider.provider === "github"
                              ? "GitHub App"
                              : provider.provider === "bitbucket"
                                ? "App password"
                                : "OAuth"}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedProvider({
                              id: provider.id,
                              name: provider.name,
                            });
                            setDeleteProviderOpen(true);
                          }}
                          className="-mt-2 -mr-2 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${provider.name}`}
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge
                      variant={isInstalled ? "secondary" : "outline"}
                      className="gap-1.5"
                    >
                      <span
                        className={
                          isInstalled
                            ? "size-1.5 rounded-full bg-emerald-500"
                            : "size-1.5 rounded-full bg-muted-foreground"
                        }
                      />
                      {isInstalled ? "Connected" : "Needs setup"}
                    </Badge>
                    <span className="truncate text-muted-foreground">
                      {provider.provider === "github"
                        ? config.githubAppName || "GitHub App"
                        : provider.provider === "bitbucket"
                          ? config.bitbucketUsername || "Bitbucket account"
                          : config.gitlabUrl || config.giteaUrl}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  <p className="text-muted-foreground text-xs">
                    {isInstalled
                      ? "Repository access is ready for deployments."
                      : "Authorize this provider to access repositories."}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    {!isInstalled ? (
                      provider.provider === "github" ? (
                        <a
                          href={`${config.githubAppName}/installations/new`}
                          onClick={(event) => {
                            event.preventDefault();
                            if (!orgId) return;
                            oauthStateMutation.mutate(
                              {
                                organizationId: orgId,
                                providerId: provider.id,
                              },
                              {
                                onSuccess: ({ state }) => {
                                  window.location.assign(
                                    `${config.githubAppName}/installations/new?state=${encodeURIComponent(state)}`,
                                  );
                                },
                              },
                            );
                          }}
                          className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline"
                        >
                          <HugeiconsIcon
                            icon={Alert02Icon}
                            className="size-3.5"
                          />
                          Install App
                        </a>
                      ) : (
                        <a
                          href={getOAuthAuthorizeUrl(
                            provider.id,
                            provider.provider as ProviderType,
                            config,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline"
                        >
                          <HugeiconsIcon
                            icon={Alert02Icon}
                            className="size-3.5"
                          />
                          Authorize
                        </a>
                      )
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1 border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-green-600"
                        >
                          <HugeiconsIcon
                            icon={CheckmarkCircle02Icon}
                            className="size-3"
                          />
                          Connected
                        </Badge>
                        <a
                          href={getInstallationManagementUrl(
                            provider.provider as ProviderType,
                            config,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline"
                        >
                          Manage access
                        </a>
                      </div>
                    )}
                    <HugeiconsIcon icon={ArrowRight01Icon} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed bg-card/10 p-12 text-center">
          <HugeiconsIcon
            icon={SourceCodeIcon}
            className="mx-auto size-12 text-muted-foreground/50"
          />
          <h2 className="mt-4 font-semibold text-foreground text-lg">
            No Git Providers
          </h2>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">
            Configure Git providers (GitHub App, GitLab, Bitbucket, Gitea) to
            access repositories, branches, and deploy resources.
          </p>
          <Button
            onClick={() => {
              resetForms();
              setProviderType("github");
              setAddProviderOpen(true);
            }}
            className="mt-6 gap-2"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add Git Provider
          </Button>
        </div>
      )}

      {/* Add Provider Dialog */}
      <Dialog open={addProviderOpen} onOpenChange={setAddProviderOpen}>
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-[min(96vw,720px)] overflow-y-auto sm:min-w-[36rem]">
          <DialogHeader>
            <DialogTitle>Add Git Provider</DialogTitle>
            <DialogDescription>
              Select your Git provider type and configure the credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select
                items={[
                  { value: "github", label: "GitHub App (Manifest Flow)" },
                  { value: "gitlab", label: "GitLab (OAuth Flow)" },
                  { value: "bitbucket", label: "Bitbucket (Credentials)" },
                  { value: "gitea", label: "Gitea (OAuth Flow)" },
                ]}
                value={providerType as string}
                onValueChange={(val) => {
                  if (val) setProviderType(val as ProviderType);
                }}
              >
                <SelectTrigger className="border-border/40">
                  <SelectValue placeholder="Select Provider Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">
                    GitHub App (Manifest Flow)
                  </SelectItem>
                  <SelectItem value="gitlab">GitLab (OAuth Flow)</SelectItem>
                  <SelectItem value="bitbucket">
                    Bitbucket (Credentials)
                  </SelectItem>
                  <SelectItem value="gitea">Gitea (OAuth Flow)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* GitHub App Manifest Form */}
            {providerType === "github" && (
              <form
                action={
                  githubManifestState ? getGithubAppCreationUrl() : undefined
                }
                method="post"
                className="space-y-4 pt-2"
              >
                <input
                  type="text"
                  name="manifest"
                  id="manifest"
                  defaultValue={manifest}
                  className="hidden"
                />

                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-org" className="font-medium text-sm">
                      Organization App
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Create this app for a GitHub Organization instead of
                      personal account.
                    </p>
                  </div>
                  <Switch
                    id="is-org"
                    checked={isOrganization}
                    onCheckedChange={setIsOrganization}
                  />
                </div>

                {isOrganization && (
                  <div className="space-y-2">
                    <Label htmlFor="org-name">GitHub Organization Name</Label>
                    <Input
                      id="org-name"
                      required
                      placeholder="e.g. my-awesome-org"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </div>
                )}

                <DialogFooter className="flex items-center gap-2 pt-4 sm:justify-between">
                  <a
                    href={
                      isOrganization && orgName
                        ? `https://github.com/organizations/${orgName}/settings/installations`
                        : "https://github.com/settings/installations"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-xs hover:underline"
                  >
                    Unsure if already installed?
                  </a>
                  <Button
                    type="submit"
                    disabled={
                      (isOrganization && !orgName.trim()) ||
                      !githubManifestState
                    }
                    className="gap-1.5"
                  >
                    Create GitHub App
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                  </Button>
                </DialogFooter>
              </form>
            )}

            {/* Non-GitHub Forms */}
            {providerType !== "github" && (
              <form onSubmit={handleCreateNonGithub} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Provider Name</Label>
                  <Input
                    id="name"
                    required
                    placeholder="e.g. My GitLab, Gitea Instance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* GitLab Fields */}
                {providerType === "gitlab" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="gitlab-url">GitLab URL</Label>
                      <Input
                        id="gitlab-url"
                        required
                        placeholder="https://gitlab.com"
                        value={gitlabUrl}
                        onChange={(e) => setGitlabUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gitlab-app-id">
                        Application ID (Client ID)
                      </Label>
                      <Input
                        id="gitlab-app-id"
                        required
                        placeholder="OAuth application ID"
                        value={gitlabAppId}
                        onChange={(e) => setGitlabAppId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gitlab-secret">Client Secret</Label>
                      <Input
                        id="gitlab-secret"
                        required
                        type="password"
                        placeholder="OAuth client secret"
                        value={gitlabSecret}
                        onChange={(e) => setGitlabSecret(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gitlab-group">
                        Group Name (Optional)
                      </Label>
                      <Input
                        id="gitlab-group"
                        placeholder="Filter repositories by GitLab group slug"
                        value={gitlabGroupName}
                        onChange={(e) => setGitlabGroupName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Bitbucket Fields */}
                {providerType === "bitbucket" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bitbucket-username">
                        Bitbucket Username
                      </Label>
                      <Input
                        id="bitbucket-username"
                        required
                        placeholder="Bitbucket username"
                        value={bitbucketUsername}
                        onChange={(e) => setBitbucketUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bitbucket-app-pwd">App Password</Label>
                      <Input
                        id="bitbucket-app-pwd"
                        required
                        type="password"
                        placeholder="Bitbucket app password"
                        value={bitbucketAppPassword}
                        onChange={(e) =>
                          setBitbucketAppPassword(e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bitbucket-workspace">
                        Workspace Name (Optional)
                      </Label>
                      <Input
                        id="bitbucket-workspace"
                        placeholder="Bitbucket workspace slug"
                        value={bitbucketWorkspace}
                        onChange={(e) => setBitbucketWorkspace(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Gitea Fields */}
                {providerType === "gitea" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="gitea-url">Gitea Server URL</Label>
                      <Input
                        id="gitea-url"
                        required
                        placeholder="https://gitea.com or custom self-hosted URL"
                        value={giteaUrl}
                        onChange={(e) => setGiteaUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gitea-client-id">Client ID</Label>
                      <Input
                        id="gitea-client-id"
                        required
                        placeholder="Gitea OAuth Application Client ID"
                        value={giteaClientId}
                        onChange={(e) => setGiteaClientId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gitea-secret">Client Secret</Label>
                      <Input
                        id="gitea-secret"
                        required
                        type="password"
                        placeholder="Gitea OAuth Application Client Secret"
                        value={giteaClientSecret}
                        onChange={(e) => setGiteaClientSecret(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2 border-border/30 border-t pt-4">
                  <Label htmlFor="provider-webhook-secret">
                    Webhook signing secret (optional)
                  </Label>
                  <Input
                    id="provider-webhook-secret"
                    type="password"
                    placeholder="Use the same secret configured in the provider webhook"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Required for signed auto-deploy webhooks. It is stored in
                    the provider configuration.
                  </p>
                </div>

                <DialogFooter className="flex gap-2 pt-4 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAddProviderOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending
                      ? "Registering..."
                      : "Save Provider"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleteProviderOpen}
        onOpenChange={(open) => {
          setDeleteProviderOpen(open);
          if (!open) setSelectedProvider(null);
        }}
        title="Delete Git provider?"
        description={
          <>
            This will delete <strong>{selectedProvider?.name}</strong> and stop
            Upstand from fetching repositories from it. This action cannot be
            undone.
          </>
        }
        actionLabel="Delete provider"
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </DashboardPage>
  );
}
