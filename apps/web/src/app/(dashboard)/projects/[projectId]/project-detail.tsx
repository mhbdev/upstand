"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  ComputerIcon,
  Delete02Icon,
  Folder01Icon,
  Home01Icon,
  PlusSignIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@upstand/ui/components/tabs";
import { cn } from "@upstand/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

// ─── Environment Card ──────────────────────────────────────────────────────────

function EnvironmentCard({
  projectId,
  environment,
  onDelete,
}: {
  projectId: string;
  environment: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isDefault: boolean;
    isProtected: boolean;
    resourceCount: number;
  };
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col justify-between border border-border/40 bg-card/30 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-accent/5 hover:shadow-lg">
      <Link
        href={`/projects/${projectId}/${environment.id}` as any}
        className="absolute inset-0"
        aria-label={`Open environment ${environment.name}`}
      />
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary/10 text-primary">
            <HugeiconsIcon icon={ComputerIcon} className="size-4" />
          </div>
          <h3 className="line-clamp-1 flex-1 font-semibold text-foreground transition-colors group-hover:text-primary">
            {environment.name}
          </h3>
          {environment.isDefault && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[10px] text-primary uppercase tracking-wider">
              Production
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">
          {environment.description || "No description provided."}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-border/30 border-t pt-3">
        <span className="font-medium text-muted-foreground text-xs">
          {environment.resourceCount}{" "}
          {environment.resourceCount === 1 ? "resource" : "resources"}
        </span>

        {!environment.isDefault && !environment.isProtected && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="relative z-10 p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            aria-label={`Delete environment ${environment.name}`}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Create Env Dialog ─────────────────────────────────────────────────────────

function CreateEnvDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    ...trpc.environment.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Environment created successfully");
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to create environment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border bg-card shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">
            New Environment
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Create an environment (e.g. Staging, Development) to isolate
            resources.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              mutation.mutate({
                projectId,
                name: name.trim(),
                description: description.trim() || undefined,
              });
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label htmlFor="env-name">Environment Name</Label>
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Staging"
              autoComplete="off"
              autoFocus
              className="border-border/40 focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="env-desc">Description (Optional)</Label>
            <Input
              id="env-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Temporary staging environment"
              autoComplete="off"
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
              Create Environment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Env Dialog ─────────────────────────────────────────────────────────

function DeleteEnvDialog({
  open,
  onOpenChange,
  environment,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  environment: { id: string; name: string; resourceCount: number } | null;
  onDeleted: () => void;
}) {
  const mutation = useMutation({
    ...trpc.environment.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Environment deleted successfully");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err) =>
      toast.error(err.message || "Failed to delete environment"),
  });

  const hasResources = (environment?.resourceCount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "rounded-2xl border bg-card shadow-2xl",
          hasResources ? "border-amber-500/30" : "border-destructive/30",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-xl">
            {hasResources ? (
              <span className="flex items-center gap-2 text-amber-500">
                <HugeiconsIcon icon={Alert02Icon} className="size-5" />
                Cannot Delete Environment
              </span>
            ) : (
              <span className="flex items-center gap-2 text-destructive">
                <HugeiconsIcon icon={Alert02Icon} className="size-5" />
                Delete Environment
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {hasResources ? (
              <span>
                Environment{" "}
                <span className="font-semibold text-foreground">
                  {environment?.name}
                </span>{" "}
                contains {environment?.resourceCount} active{" "}
                {environment?.resourceCount === 1 ? "resource" : "resources"}.
                You must delete all resources in this environment before you can
                delete it.
              </span>
            ) : (
              <span>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  {environment?.name}
                </span>
                ? This action is permanent and cannot be undone.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {hasResources ? "Close" : "Cancel"}
          </Button>
          {!hasResources && (
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              className="gap-2"
              onClick={() => {
                if (environment) {
                  mutation.mutate({ id: environment.id });
                }
              }}
            >
              {mutation.isPending && <Spinner className="size-4" />} Delete
              Environment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail ───────────────────────────────────────────────────────────────

export default function ProjectDetail({
  projectId,
  session,
}: {
  projectId: string;
  session: typeof authClient.$Infer.Session;
}) {
  const router = useRouter();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [createEnvOpen, setCreateEnvOpen] = useState(false);
  const [deleteEnvOpen, setDeleteEnvOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<{
    id: string;
    name: string;
    resourceCount: number;
  } | null>(null);

  // Fetch project details
  const { data: project, isPending: loadingProject } = useQuery({
    ...trpc.project.get.queryOptions({ id: projectId }),
  });

  // Fetch environments
  const {
    data: environments,
    isPending: loadingEnvs,
    refetch: refetchEnvs,
  } = useQuery({
    ...trpc.environment.list.queryOptions({ projectId }),
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    ...trpc.project.deleteProject.mutationOptions(),
    onSuccess: () => {
      toast.success("Project deleted successfully");
      router.push("/projects" as any);
    },
    onError: (err) => toast.error(err.message || "Failed to delete project"),
  });

  if (loadingProject) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Link href={"/projects" as any}>
          <Button variant="outline">Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const hasResources =
    environments?.some((env: any) => env.resourceCount > 0) ?? false;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-8">
      {/* Breadcrumbs / Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Link
            href={"/projects" as any}
            className="transition-colors hover:text-primary"
          >
            Projects
          </Link>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
          <span className="font-medium text-foreground">{project.name}</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-bold text-2xl text-foreground">
              {project.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              Project environments and configuration.
            </p>
          </div>
          <div>
            <Button
              onClick={() => setCreateEnvOpen(true)}
              className="gap-2 font-medium"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
              New Environment
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="environments" className="space-y-6">
        <TabsList className="border border-border/40 bg-card/45 p-1">
          <TabsTrigger value="environments">Environments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="environments" className="outline-none">
          {loadingEnvs ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : environments && environments.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {environments.map((env: any) => (
                <EnvironmentCard
                  key={env.id}
                  projectId={projectId}
                  environment={env}
                  onDelete={() => {
                    setSelectedEnv(env);
                    setDeleteEnvOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No environments found.
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="outline-none">
          <div className="max-w-2xl space-y-6">
            {/* Project deletion */}
            <Card className="border border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="font-semibold text-destructive">
                  Delete Project
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Permanently delete this project. This will delete all
                  environments and resources inside them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasResources ? (
                  <div className="flex items-start gap-3 border border-amber-500/20 bg-amber-500/5 p-4 text-amber-500 text-sm">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      className="mt-0.5 size-5 shrink-0"
                    />
                    <div>
                      <p className="font-semibold">
                        Project cannot be deleted yet
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        You must first delete all active resources in your
                        environments (e.g. Production, Development) to delete
                        the project.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    This project has no active resources and is safe to delete.
                  </p>
                )}
                <Button
                  variant="destructive"
                  disabled={hasResources || deleteProjectMutation.isPending}
                  className="gap-2"
                  onClick={() => {
                    if (
                      confirm(
                        "Are you absolutely sure you want to delete this project?",
                      )
                    ) {
                      deleteProjectMutation.mutate({
                        id: projectId,
                        organizationId: project.organizationId,
                      });
                    }
                  }}
                >
                  {deleteProjectMutation.isPending && (
                    <Spinner className="size-4" />
                  )}
                  Delete Project
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <CreateEnvDialog
        open={createEnvOpen}
        onOpenChange={setCreateEnvOpen}
        projectId={projectId}
        onCreated={refetchEnvs}
      />

      <DeleteEnvDialog
        open={deleteEnvOpen}
        onOpenChange={setDeleteEnvOpen}
        environment={selectedEnv}
        onDeleted={refetchEnvs}
      />
    </div>
  );
}
