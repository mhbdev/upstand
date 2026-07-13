"use client";

import { useListOrganizationMembers } from "@better-auth-ui/react";
import {
  Alert02Icon,
  ArrowRight01Icon,
  Building04Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Folder01Icon,
  PlusSignIcon,
  ServerStack01Icon,
  Settings01Icon,
  UserGroupIcon,
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
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIsPersonal(metadata: string | null | undefined): boolean {
  if (!metadata) return false;
  try {
    return JSON.parse(metadata).isPersonal === true;
  } catch {
    return false;
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

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
    <Card className="border-border bg-card p-5">
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

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onDelete,
}: {
  project: { id: string; name: string; createdAt: Date | string };
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col justify-between border border-border bg-card/60 p-5 transition-all hover:border-primary/40 hover:bg-accent/20 hover:shadow-sm">
      <Link
        href={`/dashboard/projects/${project.id}` as Route}
        className="absolute inset-0"
        aria-label={`Open project ${project.name}`}
      />
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary/10">
          <HugeiconsIcon icon={Folder01Icon} className="size-4 text-primary" />
        </div>
        <h3 className="line-clamp-1 flex-1 font-semibold text-foreground transition-colors group-hover:text-primary">
          {project.name}
        </h3>
        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-[10px] text-emerald-500 uppercase tracking-wider">
          Active
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
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

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyProjects({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 border border-border border-dashed px-8 py-16 text-center">
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

// ─── Dialogs ──────────────────────────────────────────────────────────────────

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
      toast.success("Project created");
      setName("");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message || "Failed to create project"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">New Project</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Projects group your apps, databases, and services.
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
            <Label htmlFor="proj-name">Project name</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Website"
              autoComplete="off"
              autoFocus
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

// Replaced by global CreateOrganizationDialog

// ─── Delete Project Dialog ────────────────────────────────────────────────────

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
  const mutation = useMutation({
    ...trpc.project.deleteProject.mutationOptions(),
    onSuccess: () => {
      toast.success("Project deleted");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err) => toast.error(err.message || "Failed to delete project"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-destructive/30 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-destructive text-xl">
            <HugeiconsIcon icon={Alert02Icon} className="size-5" />
            Delete Project
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {project?.name}
            </span>
            ? This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            className="gap-2"
            onClick={() => {
              if (project) mutation.mutate({ id: project.id, organizationId });
            }}
          >
            {mutation.isPending && <Spinner className="size-4" />} Delete
            Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOrgDialog({
  open,
  onOpenChange,
  orgName,
  orgId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgName: string;
  orgId: string;
}) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) setConfirm("");
  }, [open]);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm !== orgName) return;
    setDeleting(true);
    try {
      await authClient.organization.delete({ organizationId: orgId });
      toast.success("Organization deleted");
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete organization",
      );
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-destructive/30 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-destructive text-xl">
            <HugeiconsIcon icon={Alert02Icon} className="size-5" />
            Delete Organization
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            This is permanent. All projects and members under{" "}
            <span className="font-semibold text-foreground">{orgName}</span>{" "}
            will be removed and cannot be recovered.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleDelete} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="delete-confirm" className="text-sm">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {orgName}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
              className="border-destructive/40 focus:border-destructive"
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
              variant="destructive"
              disabled={deleting || confirm !== orgName}
              className="gap-2"
            >
              {deleting && <Spinner className="size-4" />} Delete Organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard({
  session: _session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const { data: activeOrg, isPending: loadingActiveOrg } =
    authClient.useActiveOrganization();
  const { isPending: loadingOrgs } = authClient.useListOrganizations();
  const { data: members, isPending: loadingMembers } =
    useListOrganizationMembers(authClient, {
      query: { organizationId: activeOrg?.id ?? "" },
    });

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const {
    data: projects,
    isLoading: loadingProjects,
    refetch: refetchProjects,
  } = useQuery({
    ...trpc.project.list.queryOptions({ organizationId: activeOrg?.id ?? "" }),
    enabled: !!activeOrg?.id,
  });

  const handleRenameOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || !activeOrg) return;
    setRenaming(true);
    try {
      await authClient.organization.update({
        data: { name: renameValue },
        organizationId: activeOrg.id,
      });
      toast.success("Organization renamed");
      setRenameValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenaming(false);
    }
  };

  const isPersonalOrg = parseIsPersonal(activeOrg?.metadata);

  if (loadingActiveOrg || loadingOrgs) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-7 text-primary" />
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <HugeiconsIcon
              icon={Building04Icon}
              className="size-8 text-primary"
            />
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-foreground text-lg">
              No organization selected
            </h2>
            <p className="text-muted-foreground text-sm">
              Select an organization from the sidebar or create a new one.
            </p>
          </div>
          <Button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-create-org-dialog"));
            }}
            className="mt-1 gap-2"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" /> Create
            Organization
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardPage className="gap-6">
      <h1 className="sr-only">Dashboard — {activeOrg.name}</h1>

      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={projects?.length ?? 0}
          icon={Folder01Icon}
          accent="primary"
          loading={loadingProjects}
        />
        <StatCard
          label="Members"
          value={members?.members?.length ?? 1}
          icon={UserGroupIcon}
          accent="violet"
          loading={loadingMembers}
        />
        <StatCard
          label="Workspace Type"
          value={isPersonalOrg ? "Personal" : "Team"}
          icon={Building04Icon}
          accent="amber"
        />
        <StatCard
          label="Server Status"
          value={
            <span className="flex items-center gap-1.5 text-emerald-500">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5" />
              Online
            </span>
          }
          icon={ServerStack01Icon}
          accent="emerald"
        />
      </div>

      {/* Projects — 2 cols */}
      <Card className="border-border bg-card/50 lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between border-border border-b pb-4">
          <div className="flex items-center gap-2">
            <CardTitle className="font-semibold text-base">Projects</CardTitle>
            {!loadingProjects && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary text-xs">
                {projects?.length ?? 0}
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setCreateProjectOpen(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" /> New Project
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingProjects ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Spinner className="size-5" />
              <span className="text-sm">Loading projects…</span>
            </div>
          ) : !projects?.length ? (
            <EmptyProjects onNew={() => setCreateProjectOpen(true)} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onDelete={() => {
                    setProjectToDelete({ id: p.id, name: p.name });
                    setDeleteProjectOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        organizationId={activeOrg.id}
        onCreated={refetchProjects}
      />
      <DeleteProjectDialog
        open={deleteProjectOpen}
        onOpenChange={(v) => {
          setDeleteProjectOpen(v);
          if (!v) setProjectToDelete(null);
        }}
        project={projectToDelete}
        organizationId={activeOrg.id}
        onDeleted={refetchProjects}
      />

      <DeleteOrgDialog
        open={deleteOrgOpen}
        onOpenChange={setDeleteOrgOpen}
        orgName={activeOrg.name}
        orgId={activeOrg.id}
      />
    </DashboardPage>
  );
}
