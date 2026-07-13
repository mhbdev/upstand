"use client";

import { useListOrganizationMembers } from "@better-auth-ui/react";
import {
  Alert02Icon,
  ArrowRight01Icon,
  Building04Icon,
  Delete02Icon,
  Folder01Icon,
  PlusSignIcon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
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
import { Spinner } from "@upstand/ui/components/spinner";
import { cn } from "@upstand/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIsPersonal(metadata: string | null | undefined): boolean {
  if (!metadata) return false;
  try {
    return JSON.parse(metadata).isPersonal === true;
  } catch {
    return false;
  }
}

const ACCENT_MAP = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-500",
  violet: "bg-violet-500/10 text-violet-500",
  amber: "bg-amber-500/10 text-amber-500",
} as const;

function StatCard({
  label,
  value,
  icon,
  accent = "primary",
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: IconSvgElement;
  accent?: keyof typeof ACCENT_MAP;
  loading?: boolean;
}) {
  return (
    <Card className="border border-border/40 bg-card/45 p-5 backdrop-blur-md transition-all duration-300 hover:border-border/80">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {label}
          </p>
          <div className="font-bold text-2xl text-foreground">
            {loading ? <Spinner className="size-5" /> : value}
          </div>
        </div>
        <div className={cn("p-2.5", ACCENT_MAP[accent])}>
          <HugeiconsIcon icon={icon} className="size-5" />
        </div>
      </div>
    </Card>
  );
}

function ProjectCard({
  project,
  onDelete,
}: {
  project: { id: string; name: string; createdAt: Date | string };
  onDelete: () => void;
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
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="relative z-10 p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete project ${project.name}`}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
        </button>
      </div>
    </div>
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
      <Button onClick={onNew} size="sm" className="mt-1 gap-2">
        <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
        New Project
      </Button>
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
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Web App"
              autoComplete="off"
              autoFocus
              className="border-border/40 focus:border-primary"
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !name.trim()}
              className="gap-2"
            >
              {mutation.isPending && <Spinner className="size-4" />}
              Create Project
            </Button>
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
  const [checking, setChecking] = useState(false);

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

export default function Projects({
  session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const { data: activeOrg, isPending: loadingActiveOrg } =
    authClient.useActiveOrganization();
  const { data: orgs, isPending: loadingOrgs } =
    authClient.useListOrganizations();
  const { data: members, isPending: loadingMembers } =
    useListOrganizationMembers(authClient, {
      query: { organizationId: activeOrg?.id ?? "" },
    });

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
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
  const totalProjects = projects?.length ?? 0;

  return (
    <DashboardPage>
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-foreground">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Manage your apps, databases, and environments under{" "}
            {activeOrg?.name || "your organization"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects…"
            className="w-full border-border/40 bg-card/30 sm:w-64"
          />
          <Button
            onClick={() => setCreateProjectOpen(true)}
            className="gap-2 font-medium"
            disabled={!organizationId}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            New Project
          </Button>
        </div>
      </div>

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
    </DashboardPage>
  );
}
