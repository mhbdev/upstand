import { useMutation, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

export function useResourceDetail({
  projectId,
  environmentId,
  resourceId,
  selectedLogContainerId,
  selectedContainerId,
  containerModalOpen,
  statsIntervalEnabled,
}: {
  projectId: string;
  environmentId: string;
  resourceId: string;
  selectedLogContainerId?: string;
  selectedContainerId?: string;
  containerModalOpen?: boolean;
  statsIntervalEnabled?: boolean;
}) {
  const router = useRouter();

  const projectQuery = useQuery({
    ...trpc.project.get.queryOptions({ id: projectId }),
  });

  const envQuery = useQuery({
    ...trpc.environment.get.queryOptions({ id: environmentId }),
  });

  const sshKeysQuery = useQuery({
    ...trpc.sshKey.list.queryOptions({
      organizationId: projectQuery.data?.organizationId || "",
    }),
    enabled: !!projectQuery.data?.organizationId,
  });

  const gitProvidersQuery = useQuery({
    ...trpc.gitProvider.list.queryOptions({
      organizationId: projectQuery.data?.organizationId || "",
    }),
    enabled: !!projectQuery.data?.organizationId,
  });

  const resourceQuery = useQuery({
    ...trpc.resource.get.queryOptions({ id: resourceId }),
    refetchInterval: 3000,
  });

  const routingTargetsQuery = useQuery({
    ...trpc.resource.getRoutingTargets.queryOptions({ id: resourceId }),
    enabled: !!resourceId,
    staleTime: 15_000,
  });

  const liveContainersQuery = useQuery({
    ...trpc.resource.getContainers.queryOptions({ id: resourceId }),
    refetchInterval: 5000,
  });

  const logsQuery = useQuery({
    ...trpc.resource.getLogs.queryOptions({
      id: resourceId,
      containerId:
        selectedLogContainerId === "all" ? undefined : selectedLogContainerId,
    }),
    refetchInterval: 4000,
  });

  const statsQuery = useQuery({
    ...trpc.resource.getStats.queryOptions({ id: resourceId }),
    refetchInterval: statsIntervalEnabled ? 5000 : false,
    enabled: !!resourceId && statsIntervalEnabled,
  });

  const containerLogsQuery = useQuery({
    ...trpc.resource.getLogs.queryOptions({
      id: resourceId,
      containerId: selectedContainerId || undefined,
    }),
    enabled: containerModalOpen && !!selectedContainerId,
    refetchInterval: containerModalOpen ? 3000 : false,
  });

  // Mutations
  const updateResourceMutation = useMutation({
    ...trpc.resource.update.mutationOptions(),
    onSuccess: () => {
      void resourceQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to update resource"),
  });

  const deployResourceMutation = useMutation({
    ...trpc.resource.deploy.mutationOptions(),
    onSuccess: () => {
      toast.success("Deployment triggered successfully");
      void resourceQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to trigger deployment");
    },
  });

  const controlResourceMutation = useMutation({
    ...trpc.resource.control.mutationOptions(),
    onSuccess: () => {
      toast.success("Command dispatched successfully");
      void resourceQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to control resource");
    },
  });

  const controlContainerMutation = useMutation({
    ...trpc.resource.controlContainer.mutationOptions(),
    onSuccess: () => {
      toast.success("Container command dispatched successfully");
      void resourceQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to control container");
    },
  });

  const deleteResourceMutation = useMutation({
    ...trpc.resource.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Resource deleted successfully");
      router.push(`/projects/${projectId}/${environmentId}` as Route);
    },
    onError: (err) => toast.error(err.message || "Failed to delete resource"),
  });

  return {
    project: projectQuery.data,
    env: envQuery.data,
    sshKeys: sshKeysQuery.data ?? [],
    gitProviders: gitProvidersQuery.data ?? [],
    resource: resourceQuery.data,
    loadingResource: resourceQuery.isPending,
    refetchResource: resourceQuery.refetch,
    routingTargets: routingTargetsQuery.data ?? [],
    liveContainers: liveContainersQuery.data,
    logsData: logsQuery.data,
    statsData: statsQuery.data,
    containerLogsData: containerLogsQuery.data,
    updateResource: updateResourceMutation.mutate,
    isUpdatingResource: updateResourceMutation.isPending,
    deployResource: deployResourceMutation.mutate,
    isDeployingResource: deployResourceMutation.isPending,
    controlResource: controlResourceMutation.mutate,
    isControllingResource: controlResourceMutation.isPending,
    controlContainer: controlContainerMutation.mutate,
    isControllingContainer: controlContainerMutation.isPending,
    deleteResource: deleteResourceMutation.mutate,
    isDeletingResource: deleteResourceMutation.isPending,
  };
}
