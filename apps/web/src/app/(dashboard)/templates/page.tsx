"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Template } from "@upstand/domain";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@upstand/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@upstand/ui/components/alert-dialog";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@upstand/ui/components/empty";
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
import { Separator } from "@upstand/ui/components/separator";
import { Textarea } from "@upstand/ui/components/textarea";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Download,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { CodeEditor, CodeSurface } from "@/components/shared/code-editor";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
`;

const PROMPT_PRESETS = [
  "A production-ready Postgres database with persistent named storage",
  "A small Go API with Postgres and a private network",
  "A self-hosted analytics stack with a web UI and a database",
];

type EditorMode = "library" | "studio";
type TemplateRecord = Omit<Template, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type DeployableTemplate = Pick<
  TemplateRecord,
  "id" | "name" | "description" | "tags"
> & {
  source: "custom" | "builtin";
  version?: string;
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function getServiceCount(composeFile: string): number {
  const servicesSection = composeFile.split(/^services:\s*$/m)[1];
  if (!servicesSection) return 0;
  return (servicesSection.match(/^ {2}[A-Za-z0-9_.-]+:\s*$/gm) ?? []).length;
}

export default function TemplatesPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const importInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<EditorMode>("library");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [composeFile, setComposeFile] = useState(DEFAULT_COMPOSE);
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generatedModel, setGeneratedModel] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [deployingSource, setDeployingSource] = useState<"custom" | "builtin">(
    "custom",
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [serverId, setServerId] = useState("");
  const [buildServerId, setBuildServerId] = useState("");
  const [composeType, setComposeType] = useState<"stack" | "compose">("stack");
  const [resourceName, setResourceName] = useState("");
  const [appName, setAppName] = useState("");
  const [randomize, setRandomize] = useState(true);

  const templates = useQuery({
    ...trpc.template.list.queryOptions({
      organizationId,
      search: search.trim() || undefined,
    }),
    enabled: Boolean(organizationId),
  });
  const catalog = useQuery({
    ...trpc.template.catalog.queryOptions({
      search: search.trim() || undefined,
    }),
    enabled: Boolean(organizationId),
    staleTime: 15 * 60 * 1000,
  });
  const starters = useQuery({ ...trpc.template.starters.queryOptions() });
  const projects = useQuery({
    ...trpc.project.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const environments = useQuery({
    ...trpc.environment.list.queryOptions({ projectId }),
    enabled: Boolean(projectId),
  });
  const servers = useQuery({
    ...trpc.server.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const aiSettings = useQuery({
    ...trpc.ai.listProviders.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  const clearEditor = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setTags("");
    setComposeFile(DEFAULT_COMPOSE);
    setGenerationPrompt("");
    setGeneratedModel(null);
  };

  const openNewEditor = () => {
    clearEditor();
    setMode("studio");
  };

  const openEditor = (template: NonNullable<typeof templates.data>[number]) => {
    setEditingId(template.id);
    setName(template.name);
    setDescription(template.description ?? "");
    setTags(template.tags.join(", "));
    setComposeFile(template.composeFile);
    setGeneratedModel(null);
    setMode("studio");
  };

  const create = useMutation({
    ...trpc.template.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Template saved to your organization catalog");
      clearEditor();
      setMode("library");
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    ...trpc.template.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Template updated");
      clearEditor();
      setMode("library");
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const generate = useMutation({
    ...trpc.ai.generateTemplate.mutationOptions(),
    onSuccess: (result) => {
      setComposeFile(result.composeFile);
      if (!name.trim()) setName("Generated Compose template");
      setGeneratedModel(result.model);
      toast.success(
        "Draft generated and safety-checked. Review it before saving.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.template.remove.mutationOptions(),
    onSuccess: () => {
      toast.success("Template deleted");
      setDeleteTarget(null);
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const deploy = useMutation({
    ...trpc.template.deploy.mutationOptions(),
    onSuccess: () => {
      toast.success("Deployment queued. Track its progress in Deployments.");
      setDeployingId(null);
      setDeployingSource("custom");
      setProjectId("");
      setEnvironmentId("");
      setServerId("");
      setBuildServerId("");
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedTemplate: DeployableTemplate | undefined =
    deployingSource === "builtin"
      ? catalog.data?.find((template) => template.id === deployingId)
      : (() => {
          const template = templates.data?.find(
            (candidate) => candidate.id === deployingId,
          );
          return template
            ? { ...template, source: "custom" as const }
            : undefined;
        })();
  const readyServers = (servers.data ?? []).filter(
    (server) => server.status === "ready",
  );
  const aiReady = Boolean(
    aiSettings.data?.some(
      (provider) => provider.configured && provider.enabled,
    ),
  );
  const isSaving = create.isPending || update.isPending;
  const canGenerate = Boolean(
    organizationId &&
      generationPrompt.trim().length >= 8 &&
      !generate.isPending,
  );

  const importComposeFile = async (file: File) => {
    if (!/\.(ya?ml)$/i.test(file.name)) {
      toast.error("Choose a .yml or .yaml Compose file");
      return;
    }
    if (file.size > 1_048_576) {
      toast.error("Compose files must not exceed 1 MiB");
      return;
    }
    try {
      setComposeFile(await file.text());
      if (!name.trim()) setName(file.name.replace(/\.ya?ml$/i, ""));
      setGeneratedModel(null);
      setMode("studio");
      toast.success(
        "Compose file loaded. The server will validate it when saved.",
      );
    } catch {
      toast.error("The Compose file could not be read");
    }
  };

  const exportTemplate = (template: { name: string; composeFile: string }) => {
    const blob = new Blob([template.composeFile], {
      type: "application/x-yaml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(template.name) || "compose-template"}.yaml`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const applyStarter = (starter: NonNullable<typeof starters.data>[number]) => {
    setEditingId(null);
    setName(starter.name);
    setDescription(starter.description);
    setTags(starter.tags.join(", "));
    setComposeFile(starter.composeFile);
    setGeneratedModel(null);
    setMode("studio");
  };

  const submitEditor = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationId) return toast.error("Select an organization first");
    if (!name.trim()) return toast.error("Template name is required");
    if (!composeFile.trim()) return toast.error("Compose YAML is required");
    const input = {
      organizationId,
      name: name.trim(),
      description: description.trim() || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      composeFile,
    };
    if (editingId) update.mutate({ ...input, id: editingId });
    else create.mutate(input);
  };

  return (
    <DashboardPage className="gap-5 sm:gap-6">
      <DashboardPageHeader
        title="Templates"
        icon={<Boxes className="size-6 text-primary" />}
        description="Build reusable Compose blueprints, generate safe drafts with UpGal, and deploy them to any environment."
        actions={
          <>
            {mode === "studio" && (
              <Button variant="outline" onClick={() => setMode("library")}>
                <ArrowLeft data-icon="inline-start" />
                Back to catalog
              </Button>
            )}
            <Button onClick={openNewEditor}>
              <Plus data-icon="inline-start" />
              New template
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Saved templates"
          value={templates.data?.length ?? 0}
          icon={<Boxes />}
        />
        <MetricCard
          label="Built-in catalog"
          value={catalog.data?.length ?? 0}
          icon={<FilePlus2 />}
        />
        <MetricCard
          label="AI generation"
          value={aiReady ? "Ready" : "Setup needed"}
          icon={<Sparkles />}
          accent={!aiReady}
        />
      </div>

      {mode === "studio" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="border-b bg-muted/15">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {editingId ? "Edit template" : "Create a template"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Compose YAML is checked for syntax and unsafe host access
                    before it is stored.
                  </CardDescription>
                </div>
                {editingId && (
                  <Badge variant="outline">Editing saved template</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form className="space-y-6" onSubmit={submitEditor}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Name</Label>
                    <Input
                      id="template-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Production web stack"
                      maxLength={120}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-tags">Tags</Label>
                    <Input
                      id="template-tags"
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="web, postgres, production"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-description">Description</Label>
                  <Input
                    id="template-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What this blueprint is for and what it expects"
                    maxLength={500}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label htmlFor="template-compose">Compose YAML</Label>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Named volumes and networks are supported; host binds and
                        Docker socket mounts are blocked.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => importInputRef.current?.click()}
                    >
                      <Upload data-icon="inline-start" />
                      Import YAML
                    </Button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".yaml,.yml,application/yaml,text/yaml"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void importComposeFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <CodeSurface className="[&_.cm-editor]:min-h-[28rem]">
                    <CodeEditor
                      id="template-compose"
                      value={composeFile}
                      onChange={(value) => {
                        setComposeFile(value);
                        setGeneratedModel(null);
                      }}
                      language="yaml"
                      lineWrapping
                      aria-label="Docker Compose YAML"
                    />
                  </CodeSurface>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Code2 className="size-4" />
                    {getServiceCount(composeFile)} service
                    {getServiceCount(composeFile) === 1 ? "" : "s"} detected in
                    draft
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        clearEditor();
                        setMode("library");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSaving || !organizationId}
                    >
                      {isSaving && (
                        <Loader2
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      )}
                      {editingId ? "Update template" : "Save template"}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-5">
            <Card className="border-primary/25 bg-primary/[0.035]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <WandSparkles className="size-4 text-primary" />
                  Generate with UpGal
                </CardTitle>
                <CardDescription>
                  Describe the stack in plain language. UpGal returns YAML only,
                  then the same server safety validator checks it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!aiReady && !aiSettings.isPending && (
                  <Alert>
                    <AlertCircle className="size-4" />
                    <AlertTitle>AI provider not configured</AlertTitle>
                    <AlertDescription>
                      Add a provider in{" "}
                      <a
                        className="underline underline-offset-2"
                        href="/settings/ai"
                      >
                        AI settings
                      </a>{" "}
                      to generate drafts.
                    </AlertDescription>
                  </Alert>
                )}
                <Textarea
                  value={generationPrompt}
                  onChange={(event) => setGenerationPrompt(event.target.value)}
                  placeholder="A small Go API with Postgres and a private network"
                  className="min-h-28 resize-y"
                  maxLength={2000}
                  aria-label="Describe the Compose template to generate"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="rounded-full border px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                      onClick={() => setGenerationPrompt(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={!canGenerate || !aiReady}
                  onClick={() =>
                    generate.mutate({
                      organizationId,
                      request: generationPrompt.trim(),
                    })
                  }
                >
                  {generate.isPending ? (
                    <Loader2
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  {generate.isPending ? "Generating draft…" : "Generate draft"}
                </Button>
                {generatedModel && (
                  <p className="flex items-center gap-1.5 text-emerald-600 text-xs dark:text-emerald-400">
                    <Check className="size-3.5" />
                    Generated and validated with {generatedModel}. Review before
                    saving.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Studio checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ChecklistItem
                  done={Boolean(name.trim())}
                  label="Name the blueprint"
                />
                <ChecklistItem
                  done={getServiceCount(composeFile) > 0}
                  label="Define at least one service"
                />
                <ChecklistItem
                  done={Boolean(composeFile.trim())}
                  label="Keep the Compose file non-empty"
                />
                <p className="pt-1 text-muted-foreground text-xs leading-relaxed">
                  The authoritative syntax and safety checks run on the server
                  when you save.
                </p>
              </CardContent>
            </Card>
          </aside>
        </section>
      ) : (
        <>
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-background">
            <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="max-w-2xl">
                <Badge
                  variant="outline"
                  className="mb-3 border-primary/30 bg-background/60 text-primary"
                >
                  Template studio
                </Badge>
                <h2 className="font-semibold text-xl tracking-tight sm:text-2xl">
                  Turn infrastructure ideas into repeatable launches.
                </h2>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  Start from a safe blueprint, import an existing Compose file,
                  or ask UpGal to draft one for review. Every saved template
                  stays private to this organization.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button onClick={openNewEditor}>
                  <Plus data-icon="inline-start" /> Build from scratch
                </Button>
                <Button
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload data-icon="inline-start" /> Import file
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".yaml,.yml,application/yaml,text/yaml"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importComposeFile(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Built-in catalog</CardTitle>
                <CardDescription className="mt-1">
                  {catalog.data?.length ?? 0} maintained open-source blueprints,
                  imported locally and ready to deploy without an external
                  catalog.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="size-2 rounded-full bg-emerald-500" />
                Live catalog
              </div>
            </CardHeader>
            <CardContent>
              {catalog.isPending ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading built-in
                  catalog…
                </div>
              ) : catalog.isError ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Catalog unavailable</AlertTitle>
                  <AlertDescription>
                    The built-in catalog could not be loaded. Saved and starter
                    templates remain available; reload the page to retry.
                  </AlertDescription>
                </Alert>
              ) : catalog.data?.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {catalog.data.map((template) => (
                    <article
                      key={template.id}
                      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/10 p-4 transition-colors hover:border-primary/35 hover:bg-primary/[0.025]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-primary">
                          <Code2 className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-medium">
                            {template.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                            {template.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-h-6 flex-wrap gap-1">
                        {template.tags.slice(0, 4).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {template.version}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setDeployingSource("builtin");
                            setDeployingId(template.id);
                            setResourceName(template.name);
                            setAppName(slug(template.name));
                          }}
                        >
                          <Rocket data-icon="inline-start" /> Deploy
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-40 border">
                  <EmptyHeader>
                    <EmptyTitle>No catalog matches</EmptyTitle>
                    <EmptyDescription>
                      Try a different search term.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Starter blueprints</CardTitle>
              <CardDescription>
                Use a reviewed starting point, then customize it in the studio
                before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(starters.data ?? []).map((starter) => (
                <div
                  key={starter.id}
                  className="group flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/15 p-4 transition-colors hover:border-primary/35 hover:bg-primary/[0.025]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Code2 className="size-4" />
                      </div>
                      <p className="truncate font-medium">{starter.name}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      Starter
                    </Badge>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-muted-foreground text-xs leading-relaxed">
                    {starter.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {starter.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto"
                    onClick={() => applyStarter(starter)}
                  >
                    Use starter <ChevronRight data-icon="inline-end" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Your catalog</CardTitle>
                <CardDescription className="mt-1">
                  Saved blueprints are scoped to the active organization.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search templates"
                  className="pl-9"
                  aria-label="Search templates"
                />
              </div>
            </CardHeader>
            <CardContent>
              {templates.isPending ? (
                <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading catalog…
                </div>
              ) : templates.data?.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {templates.data.map((template) => (
                    <article
                      key={template.id}
                      className="group flex min-w-0 flex-col rounded-xl border p-4 transition-colors hover:border-primary/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Code2 className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">
                              {template.name}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                              {template.description || "No description"}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {getServiceCount(template.composeFile)} services
                        </Badge>
                      </div>
                      <div className="mt-3 flex min-h-6 flex-wrap gap-1">
                        {template.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <Separator className="my-4" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">
                          Updated{" "}
                          {new Date(template.updatedAt).toLocaleDateString()}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditor(template)}
                          >
                            <Pencil data-icon="inline-start" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportTemplate(template)}
                          >
                            <Download data-icon="inline-start" /> Export
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setDeployingSource("custom");
                              setDeployingId(template.id);
                              setResourceName(template.name);
                              setAppName(slug(template.name));
                            }}
                          >
                            <Rocket data-icon="inline-start" /> Deploy
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete ${template.name}`}
                            onClick={() =>
                              setDeleteTarget({
                                id: template.id,
                                name: template.name,
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-64 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Boxes />
                    </EmptyMedia>
                    <EmptyTitle>
                      {search
                        ? "No matching templates"
                        : "Your catalog is empty"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {search
                        ? "Try another search term."
                        : "Create a template, use a starter, or import a Compose file to get started."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {!search && (
                    <EmptyContent>
                      <Button onClick={openNewEditor}>
                        <Plus data-icon="inline-start" /> Create first template
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the saved blueprint. Existing resources
              created from it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                deleteTarget &&
                remove.mutate({ organizationId, id: deleteTarget.id })
              }
            >
              {remove.isPending && (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              )}
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedTemplate && (
        <DeployDialog
          template={selectedTemplate}
          open
          projects={projects.data ?? []}
          environments={environments.data ?? []}
          servers={readyServers}
          projectId={projectId}
          environmentId={environmentId}
          serverId={serverId}
          buildServerId={buildServerId}
          composeType={composeType}
          resourceName={resourceName}
          appName={appName}
          randomize={randomize}
          isPending={deploy.isPending}
          onClose={() => setDeployingId(null)}
          onProjectChange={(value) => {
            setProjectId(value);
            setEnvironmentId("");
          }}
          onEnvironmentChange={setEnvironmentId}
          onServerChange={setServerId}
          onBuildServerChange={setBuildServerId}
          onComposeTypeChange={setComposeType}
          onResourceNameChange={setResourceName}
          onAppNameChange={setAppName}
          onRandomizeChange={setRandomize}
          onDeploy={() =>
            deploy.mutate({
              organizationId,
              templateId: selectedTemplate.id,
              source: selectedTemplate.source,
              environmentId,
              resourceName: resourceName.trim(),
              appName: appName.trim(),
              composeType,
              serverId: serverId || undefined,
              buildServerId: buildServerId || null,
              randomize,
            })
          }
        />
      )}
    </DashboardPage>
  );
}

function MetricCard({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p
            className={`mt-1 font-semibold text-lg ${accent ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {value}
          </p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-5 items-center justify-center rounded-full border ${done ? "border-emerald-500 bg-emerald-500 text-white" : "text-muted-foreground"}`}
      >
        {done ? (
          <Check className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

type DeployDialogProps = {
  template: DeployableTemplate;
  open: boolean;
  projects: { id: string; name: string }[];
  environments: { id: string; name: string }[];
  servers: { id: string; name: string; serverType: string }[];
  projectId: string;
  environmentId: string;
  serverId: string;
  buildServerId: string;
  composeType: "stack" | "compose";
  resourceName: string;
  appName: string;
  randomize: boolean;
  isPending: boolean;
  onClose: () => void;
  onProjectChange: (value: string) => void;
  onEnvironmentChange: (value: string) => void;
  onServerChange: (value: string) => void;
  onBuildServerChange: (value: string) => void;
  onComposeTypeChange: (value: "stack" | "compose") => void;
  onResourceNameChange: (value: string) => void;
  onAppNameChange: (value: string) => void;
  onRandomizeChange: (value: boolean) => void;
  onDeploy: () => void;
};

function DeployDialog({
  template,
  open,
  projects,
  environments,
  servers,
  projectId,
  environmentId,
  serverId,
  buildServerId,
  composeType,
  resourceName,
  appName,
  randomize,
  isPending,
  onClose,
  onProjectChange,
  onEnvironmentChange,
  onServerChange,
  onBuildServerChange,
  onComposeTypeChange,
  onResourceNameChange,
  onAppNameChange,
  onRandomizeChange,
  onDeploy,
}: DeployDialogProps) {
  const canDeploy = Boolean(
    projectId && environmentId && resourceName.trim() && appName.trim(),
  );
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto sm:w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Deploy {template.name}</DialogTitle>
          <DialogDescription>
            Create a resource from this blueprint and queue its first
            deployment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Project"
            value={projectId || "_none"}
            onValueChange={(value) =>
              onProjectChange(value === "_none" ? "" : value)
            }
            items={projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
            placeholder="Select project"
          />
          <SelectField
            label="Environment"
            value={environmentId || "_none"}
            disabled={!projectId}
            onValueChange={(value) =>
              onEnvironmentChange(value === "_none" ? "" : value)
            }
            items={environments.map((environment) => ({
              value: environment.id,
              label: environment.name,
            }))}
            placeholder="Select environment"
          />
          <div className="space-y-2">
            <Label htmlFor="deploy-resource-name">Resource name</Label>
            <Input
              id="deploy-resource-name"
              value={resourceName}
              onChange={(event) => onResourceNameChange(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deploy-app-name">App name</Label>
            <Input
              id="deploy-app-name"
              value={appName}
              onChange={(event) => onAppNameChange(event.target.value)}
              maxLength={120}
            />
            <p className="text-muted-foreground text-xs">
              Used as the resource’s stable Compose app key.
            </p>
          </div>
          <SelectField
            label="Deployment target"
            value={serverId || "_automatic"}
            onValueChange={(value) =>
              onServerChange(value === "_automatic" ? "" : value)
            }
            items={servers.map((server) => ({
              value: server.id,
              label: `${server.name} (${server.serverType})`,
            }))}
            placeholder="Automatic"
            allowEmptyLabel="Automatic (recommended)"
            emptyValue="_automatic"
          />
          <SelectField
            label="Build target"
            value={buildServerId || "_automatic"}
            onValueChange={(value) =>
              onBuildServerChange(value === "_automatic" ? "" : value)
            }
            items={servers
              .filter(
                (server) =>
                  server.serverType === "build" ||
                  server.serverType === "deploy",
              )
              .map((server) => ({ value: server.id, label: server.name }))}
            placeholder="Automatic"
            allowEmptyLabel="Automatic"
            emptyValue="_automatic"
          />
          <SelectField
            label="Compose mode"
            value={composeType}
            onValueChange={(value) =>
              onComposeTypeChange(value as "stack" | "compose")
            }
            items={[
              { value: "stack", label: "Docker Swarm stack" },
              { value: "compose", label: "Docker Compose" },
            ]}
            placeholder="Select mode"
          />
          <label className="flex items-start gap-3 rounded-xl border p-3 text-sm sm:mt-6">
            <input
              type="checkbox"
              checked={randomize}
              onChange={(event) => onRandomizeChange(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">Isolate names</span>
              <span className="text-muted-foreground text-xs">
                Randomize service, network, and volume names to avoid
                collisions.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter className="flex-wrap items-center justify-between border-t pt-4 sm:justify-between">
          <p className="text-muted-foreground text-xs">
            The template remains unchanged; deployment creates a new resource.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canDeploy || isPending} onClick={onDeploy}>
              {isPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Rocket data-icon="inline-start" />
              )}
              Queue deployment
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  items,
  onValueChange,
  placeholder,
  disabled,
  allowEmptyLabel,
  emptyValue = "_none",
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  allowEmptyLabel?: string;
  emptyValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        items={[
          { value: emptyValue, label: allowEmptyLabel ?? placeholder },
          ...items,
        ]}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue ?? emptyValue)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={emptyValue}>
              {allowEmptyLabel ?? placeholder}
            </SelectItem>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
