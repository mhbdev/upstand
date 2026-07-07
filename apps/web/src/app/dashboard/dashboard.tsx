"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import { Card } from "@upstand/ui/components/card";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function Dashboard({
  session: _session,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  // 1. Better Auth Org hooks
  const { data: activeOrg, isPending: loadingActiveOrg } =
    authClient.useActiveOrganization();
  const { data: orgs, isPending: loadingOrgs } =
    authClient.useListOrganizations();

  // State for creating organization
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // State for renaming organization
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // State for creating project
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // 2. tRPC Queries & Mutations for projects
  const {
    data: projects,
    isLoading: loadingProjects,
    refetch: refetchProjects,
  } = useQuery({
    ...trpc.project.list.queryOptions({ organizationId: activeOrg?.id ?? "" }),
    enabled: !!activeOrg?.id,
  });

  const createProjectMutation = useMutation({
    ...trpc.project.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Project created successfully");
      setNewProjectName("");
      refetchProjects();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create project");
    },
    onSettled: () => {
      setCreatingProject(false);
    },
  });

  if (loadingActiveOrg || loadingOrgs) {
    return <Loader />;
  }

  // Handlers
  const handleSwitchOrg = async (orgId: string) => {
    try {
      await authClient.organization.setActive({ organizationId: orgId });
      toast.success("Switched organization");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Failed to switch organization");
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await authClient.organization.create({
        name: newOrgName,
        slug,
      });
      toast.success("Organization created successfully");
      setNewOrgName("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleRenameOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || !activeOrg) return;
    setRenaming(true);
    try {
      await authClient.organization.update({
        data: {
          name: renameValue,
        },
        organizationId: activeOrg.id,
      });
      toast.success("Organization renamed successfully");
      setRenameValue("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Failed to rename organization");
    } finally {
      setRenaming(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !activeOrg) return;
    setCreatingProject(true);
    createProjectMutation.mutate({
      name: newProjectName,
      organizationId: activeOrg.id,
    });
  };

  const isPersonalOrg = activeOrg?.metadata
    ? (() => {
        try {
          return JSON.parse(activeOrg.metadata).isPersonal === true;
        } catch (_) {
          return false;
        }
      })()
    : false;

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Section */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text font-extrabold text-3xl text-transparent tracking-tight">
              {activeOrg ? activeOrg.name : "Select an Organization"}
            </h1>
            <p className="text-slate-400 text-sm">
              Manage your organizations and projects.
            </p>
          </div>

          {/* Org Selector */}
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-400 text-sm">
              Active Org:
            </span>
            <select
              value={activeOrg?.id ?? ""}
              onChange={(e) => handleSwitchOrg(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-200 text-sm transition-all focus:border-indigo-500 focus:outline-none"
            >
              {orgs?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Sidebar / Org Management */}
          <div className="space-y-8 md:col-span-1">
            {/* Create Org Card */}
            <Card className="border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
              <h2 className="mb-4 font-bold text-lg text-slate-100">
                Create Organization
              </h2>
              <form onSubmit={handleCreateOrg} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Name</Label>
                  <Input
                    id="org-name"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="E.g. Acme Corp"
                    className="border-slate-800 bg-slate-950/60 text-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={creatingOrg}
                  className="w-full bg-indigo-600 font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all hover:bg-indigo-700"
                >
                  {creatingOrg ? "Creating..." : "Create Organization"}
                </Button>
              </form>
            </Card>

            {/* Rename Org Card */}
            {activeOrg && (
              <Card className="border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
                <h2 className="mb-2 font-bold text-lg text-slate-100">
                  Rename Organization
                </h2>
                <p className="mb-4 text-slate-500 text-xs">
                  {isPersonalOrg
                    ? "This is your Personal Organization."
                    : "Update this organization's display name."}
                </p>
                <form onSubmit={handleRenameOrg} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rename-org">New Name</Label>
                    <Input
                      id="rename-org"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder={activeOrg.name}
                      className="border-slate-800 bg-slate-950/60 text-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={renaming}
                    className="w-full border border-slate-700/50 bg-slate-800 font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white"
                  >
                    {renaming ? "Updating..." : "Save Name"}
                  </Button>
                </form>
              </Card>
            )}
          </div>

          {/* Main Area / Projects Management */}
          <div className="space-y-8 md:col-span-2">
            {activeOrg ? (
              <>
                {/* Create Project Card */}
                <Card className="border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
                  <h2 className="mb-4 font-bold text-lg text-slate-100">
                    Create Project
                  </h2>
                  <form onSubmit={handleCreateProject} className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project Name (e.g. My Website)"
                        className="border-slate-800 bg-slate-950/60 py-6 text-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={creatingProject}
                      className="bg-indigo-600 px-6 font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all hover:bg-indigo-700"
                    >
                      {creatingProject ? "Creating..." : "Add Project"}
                    </Button>
                  </form>
                </Card>

                {/* Projects List Card */}
                <Card className="border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
                  <h2 className="mb-6 font-bold text-lg text-slate-100">
                    Projects
                  </h2>

                  {loadingProjects ? (
                    <div className="py-8 text-center text-slate-400">
                      Loading projects...
                    </div>
                  ) : !projects || projects.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 border-dashed p-8 text-center text-slate-500">
                      No projects created yet in this organization.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {projects.map((p) => (
                        <div
                          key={p.id}
                          className="group relative rounded-xl border border-slate-800 bg-slate-950/40 p-5 transition-all hover:border-slate-700 hover:bg-slate-900/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.05)]"
                        >
                          <h3 className="font-semibold text-slate-200 transition-colors group-hover:text-white">
                            {p.name}
                          </h3>
                          <p className="mt-1 text-slate-500 text-xs">
                            Created:{" "}
                            {new Date(p.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            ) : (
              <Card className="border-slate-800/80 bg-slate-900/40 p-12 text-center text-slate-400 backdrop-blur-md">
                Please switch to or create an organization to manage projects.
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
