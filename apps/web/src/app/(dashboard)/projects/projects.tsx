"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUpGalTargetDefinition } from "@upstand/api/ai/upgal-ui-targets";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Field, FieldGroup, FieldLabel } from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import { Separator } from "@upstand/ui/components/separator";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@upstand/ui/components/tooltip";
import { cn } from "@upstand/ui/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { PageEmpty } from "@/components/dashboard/page-empty";
import { CardGridSkeleton } from "@/components/dashboard/page-skeleton";
import { PageToolbar } from "@/components/dashboard/page-toolbar";
import { EditableEntityIcon } from "@/components/editable-entity-icon";
import {
  AlertTriangleIcon,
  CopyIcon,
  FolderIcon,
  PlusIcon,
  Trash2Icon,
} from "@/components/huge-icons";
import { UpGalTarget } from "@/components/upgal-target";
import { useRequiredActiveOrganization } from "@/hooks/use-required-active-organization";
import type { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const createProjectTarget = getUpGalTargetDefinition("create-project");
const projectNameTarget = getUpGalTargetDefinition("project-name");
const createProjectSubmitTarget = getUpGalTargetDefinition(
  "create-project-submit",
);

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface Project {
  id: string;
  name: string;
  icon?: string | null;
  createdAt: Date | string;
}

function ProjectCard({
  project,
  onDelete,
  onDuplicate,
}: {
  project: Project;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    ...trpc.project.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.project.list.queryKey(),
      });
    },
  });

  const { data: envs } = useQuery({
    ...trpc.environment.list.queryOptions({ projectId: project.id }),
    enabled: !!project.id,
  });

  const { envCount, totalResources } = useMemo(() => {
    return {
      envCount: envs?.length ?? 0,
      totalResources:
        envs?.reduce((acc, curr) => acc + curr.resourceCount, 0) ?? 0,
    };
  }, [envs]);

  const formattedDate = useMemo(
    () => dateFormatter.format(new Date(project.createdAt)),
    [project.createdAt],
  );

  const handleDuplicate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDuplicate();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  };

  return (
    <Card size="sm" className="flex flex-col justify-between">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <EditableEntityIcon
            icon={project.icon}
            defaultIcon={
              <FolderIcon className="size-4 text-primary" aria-hidden="true" />
            }
            entityName={project.name}
            entityType="project"
            sizeClassName="size-9 rounded-2xl"
            bgClassName="bg-primary/10 text-primary"
            onSaveIcon={async (newIcon) => {
              await updateMutation.mutateAsync({
                id: project.id,
                icon: newIcon,
              });
            }}
          />
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              <Link
                href={`/projects/${project.id}` as any}
                className="hover:underline"
              >
                {project.name}
              </Link>
            </CardTitle>
            <CardDescription>
              <div className="flex gap-4 text-muted-foreground text-xs">
                <div>
                  <span className="font-semibold text-foreground">
                    {envCount}
                  </span>{" "}
                  {envCount === 1 ? "environment" : "environments"}
                </div>
                <div>
                  <span className="font-semibold text-foreground">
                    {totalResources}
                  </span>{" "}
                  {totalResources === 1 ? "resource" : "resources"}
                </div>
              </div>
            </CardDescription>
          </div>
        </div>
        <Badge variant="success">Active</Badge>
      </CardHeader>

      <Separator />

      <CardFooter className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          Created <span className="font-semibold">{formattedDate}</span>
        </span>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDuplicate}
                  aria-label={`Duplicate project ${project.name}`}
                >
                  <CopyIcon aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="destructive"
                  size="icon-sm"
                  onClick={handleDelete}
                  aria-label={`Delete project ${project.name}`}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  );
}

function DuplicateProjectDialog({
  open,
  onOpenChange,
  project,
  organizationId,
  onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string } | null;
  organizationId: string;
  onDuplicated: () => void;
}) {
  const [name, setName] = useState("");
  const mutation = useMutation({
    ...trpc.project.duplicate.mutationOptions(),
    onSuccess: () => {
      toast.success("Project duplicated");
      onOpenChange(false);
      onDuplicated();
    },
    onError: (error) =>
      toast.error(error.message || "Failed to duplicate project"),
  });
  useEffect(() => {
    if (open && project) setName(`${project.name} Copy`);
  }, [open, project]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Project</DialogTitle>
          <DialogDescription>
            Copy environments and resource configuration without copying runtime
            deployments.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (project && name.trim())
              mutation.mutate({
                id: project.id,
                organizationId,
                name: name.trim(),
              });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="duplicate-project-name">
                New Project Name
              </FieldLabel>
              <Input
                id="duplicate-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !name.trim()}>
              {mutation.isPending && <Spinner data-icon="inline-start" />}
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmptyProjects({ onNew }: { onNew: () => void }) {
  return (
    <PageEmpty
      icon={FolderIcon}
      title="No projects yet"
      description="Create your first project to start deploying apps and services."
      action={
        <UpGalTarget definition={createProjectTarget}>
          <Button onClick={onNew} size="sm" className="mt-1 gap-2">
            <PlusIcon data-icon="inline-start" />
            Create Project
          </Button>
        </UpGalTarget>
      }
    />
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const mutation = useMutation({
    ...trpc.project.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Project created successfully");
      setName("");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message || "Failed to create project"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border bg-card shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">
            Create Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Projects group your environments, apps, and services together.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim())
              mutation.mutate({ name: name.trim(), organizationId });
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="proj-name">Project Name</FieldLabel>
              <UpGalTarget definition={projectNameTarget}>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Web App"
                  autoComplete="off"
                  autoFocus
                  className="border-border/40 focus:border-primary"
                />
              </UpGalTarget>
            </Field>
          </FieldGroup>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <UpGalTarget definition={createProjectSubmitTarget}>
              <Button
                type="submit"
                disabled={mutation.isPending || !name.trim()}
                className="gap-2"
              >
                {mutation.isPending && <Spinner className="size-4" />}
                Create Project
              </Button>
            </UpGalTarget>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  organizationId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: { id: string; name: string } | null;
  organizationId: string;
  onDeleted: () => void;
}) {
  const [envsWithResources, setEnvsWithResources] = useState<any[]>([]);
  const [_checking, _setChecking] = useState(false);

  const { data: envs } = useQuery({
    ...trpc.environment.list.queryOptions({ projectId: project?.id ?? "" }),
    enabled: !!project?.id,
  });

  useEffect(() => {
    if (envs) {
      const busy = envs.filter((e: any) => e.resourceCount > 0);
      setEnvsWithResources(busy);
    }
  }, [envs]);

  const mutation = useMutation({
    ...trpc.project.deleteProject.mutationOptions(),
    onSuccess: () => {
      toast.success("Project deleted successfully");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err) => toast.error(err.message || "Failed to delete project"),
  });

  const hasBusyEnvironments = envsWithResources.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "rounded-2xl border bg-card shadow-2xl",
          hasBusyEnvironments ? "border-warning/30" : "border-destructive/30",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-xl">
            {hasBusyEnvironments ? (
              <span className="flex items-center gap-2 text-warning">
                <AlertTriangleIcon className="size-5" />
                Cannot Delete Project
              </span>
            ) : (
              <span className="flex items-center gap-2 text-destructive">
                <AlertTriangleIcon className="size-5" />
                Delete Project
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {hasBusyEnvironments ? (
              <span>
                Project{" "}
                <span className="font-semibold text-foreground">
                  {project?.name}
                </span>{" "}
                contains active resources. You must first delete all resources
                in all environments before you can delete this project.
              </span>
            ) : (
              <span>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  {project?.name}
                </span>
                ? This action is permanent and cannot be undone.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasBusyEnvironments && (
          <div className="my-2 flex flex-col gap-2 border-warning/10 bg-warning/5 p-4">
            <h4 className="font-semibold text-warning text-xs uppercase tracking-wider">
              Environments with Resources
            </h4>
            <ul className="flex flex-col gap-1.5 text-sm">
              {envsWithResources.map((env) => (
                <li
                  key={env.id}
                  className="flex items-center justify-between text-muted-foreground"
                >
                  <span>{env.name}</span>
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning text-xs">
                    {env.resourceCount}{" "}
                    {env.resourceCount === 1 ? "resource" : "resources"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {hasBusyEnvironments ? "Close" : "Cancel"}
          </Button>
          {!hasBusyEnvironments && (
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              className="gap-2"
              onClick={() => {
                if (project) {
                  mutation.mutate({ id: project.id, organizationId });
                }
              }}
            >
              {mutation.isPending && <Spinner className="size-4" />} Delete
              Project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Projects(_props: {
  session: typeof authClient.$Infer.Session;
}) {
  const organizationState = useRequiredActiveOrganization();

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [duplicateProjectOpen, setDuplicateProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const organizationId = organizationState.organizationId as string;

  const {
    data: projects,
    isLoading: loadingProjects,
    refetch,
  } = useQuery({
    ...trpc.project.list.queryOptions({ organizationId }),
    enabled: organizationState.status === "ready",
  });

  const filteredProjects =
    projects?.filter((proj: any) =>
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  return (
    <DashboardPage>
      {/* Header section */}
      <DashboardPageHeader
        title="Projects"
        description={
          <>
            Manage your apps, databases, and environments under{" "}
            <span className="font-semibold text-foreground">
              {organizationState.organization?.name || "your organization"}
            </span>
            .
          </>
        }
        icon={<FolderIcon className="size-6 text-primary" />}
        actions={
          filteredProjects.length > 0 && (
            <UpGalTarget definition={createProjectTarget}>
              <Button
                onClick={() => setCreateProjectOpen(true)}
                className="gap-2 font-medium"
                disabled={!organizationId}
              >
                <PlusIcon data-icon="inline-start" />
                Create Project
              </Button>
            </UpGalTarget>
          )
        }
      />

      {filteredProjects.length > 0 && (
        <PageToolbar
          search={searchQuery}
          searchPlaceholder="Search projects…"
          onSearchChange={setSearchQuery}
          onClearSearch={() => setSearchQuery("")}
          hasActiveFilters={Boolean(searchQuery)}
        />
      )}

      {/* Projects Grid */}
      {loadingProjects ? (
        <CardGridSkeleton count={3} />
      ) : filteredProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onDelete={() => {
                setSelectedProject(proj);
                setDeleteProjectOpen(true);
              }}
              onDuplicate={() => {
                setSelectedProject(proj);
                setDuplicateProjectOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyProjects onNew={() => setCreateProjectOpen(true)} />
      )}

      {/* Modals */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        organizationId={organizationId}
        onCreated={refetch}
      />

      <DeleteProjectDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        project={selectedProject}
        organizationId={organizationId}
        onDeleted={refetch}
      />
      <DuplicateProjectDialog
        open={duplicateProjectOpen}
        onOpenChange={setDuplicateProjectOpen}
        project={selectedProject}
        organizationId={organizationId}
        onDuplicated={refetch}
      />
    </DashboardPage>
  );
}
