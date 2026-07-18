"use client";

import {
  Alert02Icon,
  Delete02Icon,
  Folder01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
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
import { Spinner } from "@upstand/ui/components/spinner";
import { cn } from "@upstand/ui/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { defineUpGalTarget, UpGalTarget } from "@/components/upgal-target";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const createProjectTarget = defineUpGalTarget({
  id: "create-project",
  label: "New Project button",
  description: "Opens the form for creating a new project.",
  kind: "button",
  action: "open_dialog",
});
const projectNameTarget = defineUpGalTarget({
  id: "project-name",
  label: "Project name field",
  description: "Enter the human-readable name for the new project.",
  kind: "field",
});
const createProjectSubmitTarget = defineUpGalTarget({
  id: "create-project-submit",
  label: "Create Project button",
  description: "Submits the project form after you review the name.",
  kind: "button",
  action: "submit",
});

function ProjectCard({
  project,
  onDelete,
  onDuplicate,
}: {
  project: { id: string; name: string; createdAt: Date | string };
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { data: envs } = useQuery({
    ...trpc.environment.list.queryOptions({ projectId: project.id }),
    enabled: !!project.id,
  });

  const envCount = envs?.length ?? 0;
  const totalResources =
    envs?.reduce((acc: number, curr: any) => acc + curr.resourceCount, 0) ?? 0;

  return (
    <div className="group relative flex flex-col justify-between border border-border/40 bg-card/30 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-accent/5 hover:shadow-lg">
      <Link
        href={`/projects/${project.id}` as any}
        className="absolute inset-0"
        aria-label={`Open project ${project.name}`}
      />
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary/10">
            <HugeiconsIcon
              icon={Folder01Icon}
              className="size-4 text-primary"
            />
          </div>
          <h3 className="line-clamp-1 flex-1 font-semibold text-foreground transition-colors group-hover:text-primary">
            {project.name}
          </h3>
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-[10px] text-emerald-500 uppercase tracking-wider">
            Active
          </span>
        </div>
        <div className="mt-4 flex gap-4 text-muted-foreground text-xs">
          <div>
            <span className="font-semibold text-foreground">{envCount}</span>{" "}
            {envCount === 1 ? "environment" : "environments"}
          </div>
          <div>
            <span className="font-semibold text-foreground">
              {totalResources}
            </span>{" "}
            {totalResources === 1 ? "resource" : "resources"}
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between border-border/30 border-t pt-3">
        <span className="text-[11px] text-muted-foreground">
          Created{" "}
          {new Date(project.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <div className="relative z-10 flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDuplicate();
            }}
          >
            Duplicate
          </Button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete project ${project.name}`}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </button>
        </div>
      </div>
    </div>
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
          <DialogTitle>Duplicate project</DialogTitle>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="duplicate-project-name">New project name</Label>
            <Input
              id="duplicate-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
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
    <div className="flex flex-col items-center justify-center gap-4 border border-border/40 border-dashed bg-card/10 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <HugeiconsIcon icon={Folder01Icon} className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">No projects yet</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Create your first project to start deploying apps and services.
        </p>
      </div>
      <UpGalTarget definition={createProjectTarget}>
        <Button onClick={onNew} size="sm" className="mt-1 gap-2">
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          New Project
        </Button>
      </UpGalTarget>
    </div>
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
          <DialogTitle className="font-bold text-xl">New Project</DialogTitle>
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
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label htmlFor="proj-name">Project Name</Label>
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
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
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
          hasBusyEnvironments ? "border-amber-500/30" : "border-destructive/30",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-xl">
            {hasBusyEnvironments ? (
              <span className="flex items-center gap-2 text-amber-500">
                <HugeiconsIcon icon={Alert02Icon} className="size-5" />
                Cannot Delete Project
              </span>
            ) : (
              <span className="flex items-center gap-2 text-destructive">
                <HugeiconsIcon icon={Alert02Icon} className="size-5" />
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
          <div className="my-2 space-y-2 border border-amber-500/10 bg-amber-500/5 p-4">
            <h4 className="font-semibold text-amber-500 text-xs uppercase tracking-wider">
              Environments with Resources
            </h4>
            <ul className="space-y-1.5 text-sm">
              {envsWithResources.map((env) => (
                <li
                  key={env.id}
                  className="flex items-center justify-between text-muted-foreground"
                >
                  <span>{env.name}</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-500 text-xs">
                    {env.resourceCount}{" "}
                    {env.resourceCount === 1 ? "resource" : "resources"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
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
  const { data: activeOrg } = authClient.useActiveOrganization();

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [duplicateProjectOpen, setDuplicateProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const organizationId = activeOrg?.id ?? "";

  const {
    data: projects,
    isLoading: loadingProjects,
    refetch,
  } = useQuery({
    ...trpc.project.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  const filteredProjects =
    projects?.filter((proj: any) =>
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  // Calculate totals
  const _totalProjects = projects?.length ?? 0;

  return (
    <DashboardPage>
      {/* Header section */}
      <DashboardPageHeader
        title="Projects"
        description={
          <>
            Manage your apps, databases, and environments under{" "}
            <span className="font-semibold text-foreground">
              {activeOrg?.name || "your organization"}
            </span>
            .
          </>
        }
        icon={
          <HugeiconsIcon icon={Folder01Icon} className="size-6 text-primary" />
        }
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full min-w-0 border-border/40 bg-card/30 sm:w-64"
            />
            <UpGalTarget definition={createProjectTarget}>
              <Button
                onClick={() => setCreateProjectOpen(true)}
                className="gap-2 font-medium"
                disabled={!organizationId}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                New Project
              </Button>
            </UpGalTarget>
          </div>
        }
      />

      {/* Projects Grid */}
      {loadingProjects ? (
        <div className="flex min-h-60 items-center justify-center">
          <Spinner className="size-8" />
        </div>
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
