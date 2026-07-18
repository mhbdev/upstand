"use client";

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
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@upstand/ui/components/tabs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/dashboard/confirm-action-dialog";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  Activity,
  Clock,
  Copy,
  RefreshCw,
  Search,
  Server,
  Settings,
  Terminal,
  Trash2,
} from "@/components/huge-icons";
import { authClient } from "@/lib/auth-client";
import { copyText } from "@/lib/browser";
import { trpc } from "@/utils/trpc";

export default function DeploymentsPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const [activeTab, setActiveTab] = useState("history");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeployment, setSelectedDeployment] = useState<any>(null);
  const [concurrencyInputs, setConcurrencyInputs] = useState<
    Record<string, number>
  >({});
  const [dirtyConcurrency, setDirtyConcurrency] = useState<
    Record<string, boolean>
  >({});
  const [cancelTarget, setCancelTarget] = useState<{
    serverId: string;
    jobId: string;
    label: string;
  } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const {
    data: deployments = [],
    isPending: loadingDeployments,
    refetch: refetchDeployments,
  } = useQuery({
    ...trpc.deployment.getDeployments.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
    refetchInterval: activeTab === "history" ? 5000 : false,
  });

  const {
    data: queueJobs = [],
    isPending: loadingQueue,
    refetch: refetchQueue,
  } = useQuery({
    ...trpc.deployment.getQueue.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
    refetchInterval: activeTab === "queue" ? 3000 : false,
  });

  const {
    data: servers = [],
    isPending: loadingServers,
    refetch: refetchServers,
  } = useQuery({
    ...trpc.deployment.getServerSettings.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });

  // Sync concurrency inputs from DB settings
  useEffect(() => {
    if (servers.length > 0) {
      const inputs: Record<string, number> = {};
      for (const server of servers) {
        inputs[server.id] = server.concurrency;
      }
      setConcurrencyInputs((current) => {
        const next = { ...current };
        for (const [serverId, value] of Object.entries(inputs)) {
          if (!dirtyConcurrency[serverId]) next[serverId] = value;
        }
        return next;
      });
    }
  }, [servers, dirtyConcurrency]);

  // Auto-scroll logs modal to bottom
  useEffect(() => {
    if (selectedDeployment) {
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selectedDeployment]);

  // Live update log details if modal is open
  useEffect(() => {
    if (selectedDeployment) {
      const liveDep = deployments.find((d) => d.id === selectedDeployment.id);
      if (liveDep && liveDep.logs !== selectedDeployment.logs) {
        setSelectedDeployment(liveDep);
      }
    }
  }, [deployments, selectedDeployment]);

  // Mutations
  const updateConcurrencyMutation = useMutation({
    ...trpc.deployment.updateServerConcurrency.mutationOptions(),
    onSuccess: (data, variables) => {
      toast.success(`Concurrency updated for server ${data.hostname}`);
      setConcurrencyInputs((current) => ({
        ...current,
        [variables.serverId]: variables.concurrency,
      }));
      void refetchServers().then(() => {
        setDirtyConcurrency((current) => ({
          ...current,
          [variables.serverId]: false,
        }));
      });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update concurrency");
    },
  });

  const cancelJobMutation = useMutation({
    ...trpc.deployment.cancelDeploymentJob.mutationOptions(),
    onSuccess: () => {
      toast.success("Deployment cancelled successfully");
      setCancelTarget(null);
      refetchQueue();
      refetchDeployments();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to cancel deployment");
    },
  });

  const handleUpdateConcurrency = (serverId: string) => {
    const val = concurrencyInputs[serverId];
    if (!val || val < 1) {
      toast.error("Concurrency must be at least 1");
      return;
    }
    const serverObj = servers.find((s) => s.id === serverId);
    updateConcurrencyMutation.mutate({
      organizationId,
      serverId,
      concurrency: val,
      hostname: serverObj?.hostname,
      ip: serverObj?.ip,
    });
  };

  const handleCancelJob = (serverId: string, jobId: string, label: string) => {
    setCancelTarget({ serverId, jobId, label });
  };

  // Filter deployments
  const filteredDeployments = deployments.filter((dep) => {
    const query = searchQuery.toLowerCase();
    return (
      dep.resourceName.toLowerCase().includes(query) ||
      dep.title.toLowerCase().includes(query) ||
      dep.status.toLowerCase().includes(query) ||
      dep.serverName?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <StatusBadge label="Success" tone="success" />;
      case "running":
        return <StatusBadge label="Running" tone="info" />;
      case "queued":
        return <StatusBadge label="Queued" tone="warning" />;
      case "failed":
        return <StatusBadge label="Failed" tone="destructive" />;
      default:
        return <StatusBadge label={status} tone="outline" />;
    }
  };

  const getQueueStateBadge = (state: string) => {
    if (state === "active") return <StatusBadge label="Active" tone="info" />;
    if (state === "waiting") {
      return <StatusBadge label="Waiting" tone="warning" />;
    }
    return <StatusBadge label={state} tone="secondary" />;
  };

  return (
    <DashboardPage className="flex-1">
      <DashboardPageHeader
        title="Deployments & Queues"
        icon={<Activity className="size-6 text-primary" />}
        description="Observe build histories, monitor live queues, and manage server-level concurrency."
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              refetchDeployments();
              refetchQueue();
              refetchServers();
            }}
            aria-label="Refresh deployments"
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b pb-px">
          <TabsList className="mb-4">
            <TabsTrigger value="history" className="gap-2">
              <Activity className="size-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="size-4" />
              Queue ({queueJobs.length})
            </TabsTrigger>
            <TabsTrigger value="concurrency" className="gap-2">
              <Settings className="size-4" />
              Build Concurrency
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: History */}
        <TabsContent value="history" className="space-y-4">
          <Card className="border-muted/40 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="font-semibold text-lg">
                  Deployment History
                </CardTitle>
                <CardDescription>
                  All deployments executed across the server infrastructure.
                </CardDescription>
              </div>
              <div className="relative w-72">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Filter deployments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loadingDeployments ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner className="size-6 text-primary" />
                </div>
              ) : filteredDeployments.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                  <Activity className="mb-2 size-8 stroke-[1.5]" />
                  <p>No deployments found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Service</TableHead>
                        <TableHead>Environment</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Triggered</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeployments.map((dep) => (
                        <TableRow key={dep.id} className="hover:bg-muted/10">
                          <TableCell className="font-semibold text-foreground">
                            {dep.resourceName}
                            <span className="block font-normal text-muted-foreground text-xs capitalize">
                              {dep.resourceType}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {dep.projectName} /{" "}
                              <span className="text-muted-foreground">
                                {dep.environmentName}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {dep.serverName}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {dep.title}
                          </TableCell>
                          <TableCell>{getStatusBadge(dep.status)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(dep.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedDeployment(dep)}
                              className="h-8 gap-1.5"
                            >
                              <Terminal className="size-3.5" />
                              Logs
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Queue */}
        <TabsContent value="queue" className="space-y-4">
          <Card className="border-muted/40 shadow-sm">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Live Job Queue
              </CardTitle>
              <CardDescription>
                Currently active or waiting deployments in BullMQ.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingQueue ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner className="size-6 text-primary" />
                </div>
              ) : queueJobs.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                  <Clock className="mb-2 size-8 stroke-[1.5]" />
                  <p>Queue is empty.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Job ID</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Server Queue</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Queue State</TableHead>
                        <TableHead>Queued At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueJobs.map((job) => (
                        <TableRow key={job.id} className="hover:bg-muted/10">
                          <TableCell className="font-mono text-xs">
                            {job.id}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {job.resourceName}
                            <span className="block font-normal text-muted-foreground text-xs capitalize">
                              {job.type}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {job.serverName}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {job.label}
                          </TableCell>
                          <TableCell>{getQueueStateBadge(job.state)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(job.addedAt).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleCancelJob(job.serverId, job.id, job.label)
                              }
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={cancelJobMutation.isPending}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Concurrency */}
        <TabsContent value="concurrency" className="space-y-4">
          <Card className="border-muted/40 shadow-sm">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Build Concurrency Settings
              </CardTitle>
              <CardDescription>
                Configure the maximum number of parallel docker builds allowed
                on each Swarm node / server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingServers ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner className="size-6 text-primary" />
                </div>
              ) : servers.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                  <Server className="mb-2 size-8 stroke-[1.5]" />
                  <p>No active servers detected.</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {servers.map((server) => (
                    <Card
                      key={server.id}
                      className="border bg-card/50 transition-all hover:bg-card"
                    >
                      <CardContent className="space-y-4 pt-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-base text-foreground">
                              {server.hostname}
                            </h3>
                            <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                              {server.ip}
                            </p>
                            <span className="mt-2 inline-block rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                              ID: {server.id}
                            </span>
                          </div>
                          <Server className="size-5 text-muted-foreground/60" />
                        </div>

                        <div className="space-y-2 pt-2">
                          <Label
                            htmlFor={`concurrency-${server.id}`}
                            className="font-semibold text-xs"
                          >
                            Max Parallel Builds
                          </Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id={`concurrency-${server.id}`}
                              type="number"
                              min="1"
                              max="16"
                              value={concurrencyInputs[server.id] ?? 1}
                              onChange={(e) => {
                                setDirtyConcurrency((current) => ({
                                  ...current,
                                  [server.id]: true,
                                }));
                                setConcurrencyInputs({
                                  ...concurrencyInputs,
                                  [server.id]:
                                    Number.parseInt(e.target.value, 10) || 1,
                                });
                              }}
                              className="h-9 w-24"
                            />
                            <Button
                              onClick={() => handleUpdateConcurrency(server.id)}
                              disabled={updateConcurrencyMutation.isPending}
                              size="sm"
                              className="h-9 gap-1.5"
                            >
                              Save
                            </Button>
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Additional deployment triggers for this server will
                            queue up and wait.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Logs Modal */}
      <Dialog
        open={!!selectedDeployment}
        onOpenChange={(open) => !open && setSelectedDeployment(null)}
      >
        <DialogContent className="flex h-[min(88svh,900px)] w-[calc(100vw-1rem)] max-w-[min(96vw,64rem)] flex-col border-muted/40 p-4 sm:min-w-[min(42rem,calc(100vw-2rem))] sm:p-6">
          <DialogHeader className="border-b pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Terminal className="size-5 text-primary" />
                  Deployment Logs: {selectedDeployment?.resourceName}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  ID:{" "}
                  <span className="font-mono text-xs">
                    {selectedDeployment?.id}
                  </span>{" "}
                  | Title: {selectedDeployment?.title}
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void copyText(selectedDeployment?.logs || "")
                    .then(() => toast.success("Logs copied to clipboard"))
                    .catch(() => toast.error("Failed to copy logs"));
                }}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-3.5" />
                Copy Logs
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-muted/20 bg-[#0c0d12] p-4 font-mono text-xs text-zinc-300 leading-relaxed shadow-inner">
            <pre className="whitespace-pre-wrap">
              {selectedDeployment?.logs || "No logs available."}
            </pre>
            <div ref={logsEndRef} />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel deployment?"
        description={
          <>
            This will cancel <strong>{cancelTarget?.label}</strong> and remove
            it from the deployment queue. This action cannot be undone.
          </>
        }
        actionLabel="Cancel deployment"
        pending={cancelJobMutation.isPending}
        onConfirm={() => {
          if (!cancelTarget) return;
          cancelJobMutation.mutate({
            serverId: cancelTarget.serverId,
            jobId: cancelTarget.jobId,
          });
        }}
      />
    </DashboardPage>
  );
}
