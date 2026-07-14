"use client";

import {
  Delete02Icon,
  Layers01Icon,
  Rocket01Icon,
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
import { Textarea } from "@upstand/ui/components/textarea";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const DEFAULT_COMPOSE = `services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n`;

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export default function TemplatesPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [composeFile, setComposeFile] = useState(DEFAULT_COMPOSE);
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [appName, setAppName] = useState("");
  const [randomize, setRandomize] = useState(true);
  const importInputRef = useRef<HTMLInputElement>(null);

  const templates = useQuery({
    ...trpc.template.list.queryOptions({
      organizationId,
      search: search || undefined,
    }),
    enabled: Boolean(organizationId),
  });
  const starters = useQuery({
    ...trpc.template.starters.queryOptions(),
  });
  const projects = useQuery({
    ...trpc.project.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const environments = useQuery({
    ...trpc.environment.list.queryOptions({ projectId }),
    enabled: Boolean(projectId),
  });
  const create = useMutation({
    ...trpc.template.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Template saved");
      setEditingId(null);
      setName("");
      setDescription("");
      setTags("");
      setComposeFile(DEFAULT_COMPOSE);
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    ...trpc.template.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Template updated");
      setEditingId(null);
      setName("");
      setDescription("");
      setTags("");
      setComposeFile(DEFAULT_COMPOSE);
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const generate = useMutation({
    ...trpc.ai.generateTemplate.mutationOptions(),
    onSuccess: (result) => {
      setComposeFile(result.composeFile);
      if (!name.trim()) setName("Generated Compose template");
      setGenerationPrompt("");
      toast.success("Draft generated and validated; review it before saving");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.template.remove.mutationOptions(),
    onSuccess: () => {
      toast.success("Template removed");
      void templates.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const deploy = useMutation({
    ...trpc.template.deploy.mutationOptions(),
    onSuccess: () => {
      toast.success("Template deployment queued");
      setDeployingId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedTemplate = useMemo(
    () => templates.data?.find((template) => template.id === deployingId),
    [deployingId, templates.data],
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
    setComposeFile(await file.text());
    if (!name.trim()) setName(file.name.replace(/\.ya?ml$/i, ""));
    toast.success(
      "Compose file imported into the editor; review before saving",
    );
  };

  const exportTemplate = (template: { name: string; composeFile: string }) => {
    const blob = new Blob([template.composeFile], {
      type: "application/x-yaml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(template.name) || "compose-template"}.yaml`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyStarter = (starter: NonNullable<typeof starters.data>[number]) => {
    setEditingId(null);
    setName(starter.name);
    setDescription(starter.description);
    setTags(starter.tags.join(", "));
    setComposeFile(starter.composeFile);
    toast.success(`${starter.name} loaded into the editor`);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Templates"
        icon={
          <HugeiconsIcon icon={Layers01Icon} className="size-6 text-primary" />
        }
        description="Save, search, import, and deploy organization-scoped Compose templates with collision-safe isolation."
      />
      <Card>
        <CardHeader>
          <CardTitle>Ready-to-use starters</CardTitle>
          <CardDescription>
            Safe, self-hostable Compose blueprints inspired by the practical
            starter catalog pattern in Dokploy. Review credentials and ports
            before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {starters.data?.map((starter) => (
            <div
              key={starter.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/20 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{starter.name}</p>
                  <p className="mt-1 line-clamp-3 text-muted-foreground text-xs">
                    {starter.description}
                  </p>
                </div>
                <Badge variant="outline">Starter</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {starter.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyStarter(starter)}
              >
                Use starter
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Template catalog</CardTitle>
            <CardDescription>
              Templates are private to the active organization.
            </CardDescription>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, description, or tags"
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {(templates.data ?? []).map((template) => (
              <div key={template.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {template.description || "No description"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(template.id);
                        setName(template.name);
                        setDescription(template.description ?? "");
                        setTags(template.tags.join(", "));
                        setComposeFile(template.composeFile);
                        window.scrollTo({
                          top: document.body.scrollHeight,
                          behavior: "smooth",
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDeployingId(template.id);
                        setResourceName(template.name);
                        setAppName(slug(template.name));
                      }}
                    >
                      <HugeiconsIcon
                        icon={Rocket01Icon}
                        data-icon="inline-start"
                      />
                      Deploy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportTemplate(template)}
                    >
                      Export
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => {
                        if (
                          window.confirm(`Delete template '${template.name}'?`)
                        )
                          remove.mutate({ organizationId, id: template.id });
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </div>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
                  {template.composeFile}
                </pre>
              </div>
            ))}
            {!templates.isPending && !templates.data?.length && (
              <p className="text-muted-foreground text-sm">
                No templates yet. Import your first Compose file on the right.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import template</CardTitle>
            <CardDescription>
              Compose YAML is validated before it is stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div>
                <p className="font-medium text-sm">
                  Generate a draft with UpGal
                </p>
                <p className="text-muted-foreground text-xs">
                  Generation only fills the editor. Nothing is saved or deployed
                  until you review and choose an explicit action.
                </p>
              </div>
              <Textarea
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                placeholder="A small Go API with Postgres and a private network"
                className="min-h-20 text-xs"
                maxLength={2000}
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  generate.isPending ||
                  !organizationId ||
                  generationPrompt.trim().length < 8
                }
                onClick={() =>
                  generate.mutate({
                    organizationId,
                    request: generationPrompt.trim(),
                  })
                }
              >
                {generate.isPending ? "Generating…" : "Generate draft"}
              </Button>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
              <Button
                type="button"
                variant="outline"
                onClick={() => importInputRef.current?.click()}
              >
                Import YAML file
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
              <span className="text-muted-foreground text-xs">
                Import loads locally into the editor and still passes the
                server-side Compose safety validator when saved.
              </span>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim())
                  return toast.error("Template name is required");
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
                if (editingId) {
                  update.mutate({ ...input, id: editingId });
                } else {
                  create.mutate(input);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-tags">Tags</Label>
                <Input
                  id="template-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="web, production"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-compose">Compose YAML</Label>
                <Textarea
                  id="template-compose"
                  className="min-h-56 font-mono text-xs"
                  value={composeFile}
                  onChange={(event) => setComposeFile(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  create.isPending || update.isPending || !organizationId
                }
              >
                {editingId ? "Update template" : "Save template"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setDescription("");
                    setTags("");
                    setComposeFile(DEFAULT_COMPOSE);
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>Deploy {selectedTemplate.name}</CardTitle>
            <CardDescription>
              Choose the target environment. Deployment is queued after the
              resource is created.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col space-y-2 text-sm">
              <span className="mb-1">Project</span>
              <Select
                items={[
                  { value: "_none", label: "Select project" },
                  ...(projects.data ?? []).map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
                ]}
                value={projectId || "_none"}
                onValueChange={(val) => {
                  setProjectId(val === "_none" || !val ? "" : val);
                  setEnvironmentId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="_none">Select project</SelectItem>
                    {(projects.data ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col space-y-2 text-sm">
              <span className="mb-1">Environment</span>
              <Select
                items={[
                  { value: "_none", label: "Select environment" },
                  ...(environments.data ?? []).map((environment) => ({
                    value: environment.id,
                    label: environment.name,
                  })),
                ]}
                value={environmentId || "_none"}
                onValueChange={(val) =>
                  setEnvironmentId(val === "_none" || !val ? "" : val)
                }
                disabled={!projectId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="_none">Select environment</SelectItem>
                    {(environments.data ?? []).map((environment) => (
                      <SelectItem key={environment.id} value={environment.id}>
                        {environment.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <div className="space-y-2">
              <Label htmlFor="template-resource-name">Resource name</Label>
              <Input
                id="template-resource-name"
                value={resourceName}
                onChange={(event) => setResourceName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-app-name">Service name</Label>
              <Input
                id="template-app-name"
                value={appName}
                onChange={(event) => setAppName(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={randomize}
                onChange={(event) => setRandomize(event.target.checked)}
              />
              Randomize Compose service, network, volume, config, and secret
              names
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button
                disabled={
                  deploy.isPending ||
                  !environmentId ||
                  !resourceName.trim() ||
                  !appName.trim()
                }
                onClick={() =>
                  deploy.mutate({
                    organizationId,
                    templateId: selectedTemplate.id,
                    environmentId,
                    resourceName: resourceName.trim(),
                    appName: appName.trim(),
                    composeType: "stack",
                    randomize,
                  })
                }
              >
                Queue deployment
              </Button>
              <Button variant="ghost" onClick={() => setDeployingId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardPage>
  );
}
