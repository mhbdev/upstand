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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { cn } from "@upstand/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, History, Play, RefreshCw, Trash2 } from "@/components/huge-icons";
import { trpc } from "@/utils/trpc";

type DeploymentItem = {
  id: string;
  status: string;
  title: string;
  logs: string;
  createdAt: string;
  sourceRevision?: string | null;
};

interface DeploymentsTabProps {
  resource: any;
  deployments: DeploymentItem[];
  refetchDeployments: () => Promise<unknown>;
  deployResource: any;
  isDeployingResource: boolean;
}

export function DeploymentsTab({
  resource,
  deployments,
  refetchDeployments,
  deployResource,
  isDeployingResource,
}: DeploymentsTabProps) {
  const [deployList, setDeployList] = useState<DeploymentItem[]>([]);
  const [selectedDeployment, setSelectedDeployment] =
    useState<DeploymentItem | null>(null);
  const [viewDeploymentLogsOpen, setViewDeploymentLogsOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleCron, setScheduleCron] = useState("0 2 * * *");
  const [scheduleCommand, setScheduleCommand] = useState("");
  const [scheduleJobType, setScheduleJobType] = useState<
    "command" | "deployment" | "backup"
  >("command");
  const [backupScheduleId, setBackupScheduleId] = useState("");

  const schedulesQuery = useQuery({
    ...trpc.schedule.list.queryOptions({ resourceId: resource.id }),
    enabled: Boolean(resource?.id),
  });
  const backupSchedulesQuery = useQuery({
    ...trpc.backup.listSchedules.queryOptions({ resourceId: resource.id }),
    enabled: Boolean(resource?.id),
  });
  const createScheduleMutation = useMutation({
    ...trpc.schedule.create.mutationOptions(),
    onSuccess: () => {
      setScheduleName("");
      setScheduleCommand("");
      setScheduleJobType("command");
      setBackupScheduleId("");
      void schedulesQuery.refetch();
      toast.success("Deployment schedule created");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateScheduleMutation = useMutation({
    ...trpc.schedule.update.mutationOptions(),
    onSuccess: () => {
      void schedulesQuery.refetch();
      toast.success("Schedule updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteScheduleMutation = useMutation({
    ...trpc.schedule.delete.mutationOptions(),
    onSuccess: () => {
      void schedulesQuery.refetch();
      toast.success("Schedule deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const runScheduleMutation = useMutation({
    ...trpc.schedule.runNow.mutationOptions(),
    onSuccess: () => toast.success("Schedule started"),
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    setDeployList(deployments);
  }, [deployments]);

  const isBuilding = deployList.some((d) => d.status === "running");
  const isGitBackedApplication =
    resource.type === "application" &&
    ["github", "gitlab", "bitbucket", "gitea", "git"].includes(
      resource.provider,
    );
  const supportsHistoricalRollback =
    (resource.type === "compose" && resource.provider !== "raw") ||
    isGitBackedApplication;
  const canRollback =
    resource.type !== "compose" || resource.provider !== "raw";
  const queuedDeployment = deployList.find((deployment) =>
    ["queued", "waiting"].includes(deployment.status),
  );
  const cancelDeploymentMutation = useMutation({
    ...trpc.deployment.cancelDeploymentJob.mutationOptions(),
    onSuccess: () => {
      void refetchDeployments();
      toast.success("Queued deployment cancelled");
    },
    onError: (error) => toast.error(error.message),
  });
  const killBuildMutation = useMutation({
    ...trpc.deployment.killBuild.mutationOptions(),
    onSuccess: () => {
      toast.success("Build cancellation requested");
    },
    onError: (error) => toast.error(error.message),
  });
  const removeDeploymentMutation = useMutation({
    ...trpc.deployment.removeDeployment.mutationOptions(),
    onSuccess: (_, variables) => {
      void variables;
      void refetchDeployments();
      toast.success("Deployment removed from history");
    },
    onError: (error) => toast.error(error.message),
  });
  const clearHistoryMutation = useMutation({
    ...trpc.deployment.clearHistory.mutationOptions(),
    onSuccess: () => {
      void refetchDeployments();
      toast.success("Completed deployment history cleared");
    },
    onError: (error) => toast.error(error.message),
  });

  const rollbackMutation = useMutation({
    ...trpc.resource.rollback.mutationOptions(),
    onSuccess: () => {
      void refetchDeployments();
      toast.success(
        supportsHistoricalRollback
          ? "Historical revision queued for redeployment"
          : "Swarm service rolled back",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const triggerDeployment = () => {
    toast.info("Building and deploying resource...");
    deployResource({ id: resource.id });
  };

  const clearDeployments = () => {
    clearHistoryMutation.mutate({ resourceId: resource.id });
  };

  return (
    <>
      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            Deployment Triggers
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Manually build or setup external CI trigger pipelines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 border-border/20 border-t pt-4">
          <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-muted-foreground text-xs">
            External webhook tokens are managed in the General tab. Rotate a
            token there and copy its one-time URL; the stored token prefix (
            {resource.webhookTokenPrefix ?? "not configured"}) is not itself
            accepted for deployments.
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={triggerDeployment}
              disabled={isBuilding || isDeployingResource}
              className="gap-2 font-medium"
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  (isBuilding || isDeployingResource) && "animate-spin",
                )}
              />
              Deploy Now
            </Button>
            <Button
              onClick={clearDeployments}
              variant="outline"
              className="gap-2 border-border/40"
            >
              <Trash2 className="size-4" /> Clear Deployments
            </Button>
            <Button
              onClick={() => {
                if (!queuedDeployment) return;
                cancelDeploymentMutation.mutate({
                  serverId: resource.serverId ?? "local",
                  jobId: queuedDeployment.id,
                });
              }}
              variant="outline"
              className="gap-2 border-border/40"
              disabled={!queuedDeployment || cancelDeploymentMutation.isPending}
            >
              {cancelDeploymentMutation.isPending
                ? "Cancelling..."
                : "Cancel Queued Deployment"}
            </Button>
            <Button
              onClick={() => {
                const active = deployList.find(
                  (deployment) => deployment.status === "running",
                );
                if (
                  active &&
                  window.confirm("Stop the active build and deployment?")
                ) {
                  killBuildMutation.mutate({ deploymentId: active.id });
                }
              }}
              variant="outline"
              className="gap-2 border-destructive/40 text-destructive"
              disabled={!isBuilding || killBuildMutation.isPending}
            >
              {killBuildMutation.isPending
                ? "Stopping build..."
                : "Kill Active Build"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            Scheduled resource jobs
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Run commands, deployments, or existing backup schedules on a cron.
            Jobs refresh automatically when they are changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 border-border/20 border-t pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={scheduleName}
                onChange={(event) => setScheduleName(event.target.value)}
                placeholder="Nightly maintenance"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-cron">Cron expression</Label>
              <Input
                id="schedule-cron"
                value={scheduleCron}
                onChange={(event) => setScheduleCron(event.target.value)}
                placeholder="0 2 * * *"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-job-type">Job type</Label>
              <Select
                items={[
                  { value: "command", label: "Container command" },
                  { value: "deployment", label: "Deployment" },
                  { value: "backup", label: "Backup schedule" },
                ]}
                value={scheduleJobType}
                onValueChange={(value) => {
                  if (
                    value === "command" ||
                    value === "deployment" ||
                    value === "backup"
                  ) {
                    setScheduleJobType(value);
                  }
                }}
              >
                <SelectTrigger id="schedule-job-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="command">Container command</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                  <SelectItem value="backup">Backup schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleJobType === "backup" ? (
              <div className="space-y-1">
                <Label htmlFor="schedule-backup">Backup schedule</Label>
                <Select
                  items={(backupSchedulesQuery.data ?? []).map((backup) => ({
                    value: backup.id,
                    label: backup.name,
                  }))}
                  value={backupScheduleId}
                  onValueChange={(value) => setBackupScheduleId(value ?? "")}
                >
                  <SelectTrigger id="schedule-backup">
                    <SelectValue placeholder="Choose backup" />
                  </SelectTrigger>
                  <SelectContent>
                    {(backupSchedulesQuery.data ?? []).map((backup) => (
                      <SelectItem key={backup.id} value={backup.id}>
                        {backup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="schedule-command">Container command</Label>
                <Input
                  id="schedule-command"
                  value={scheduleCommand}
                  onChange={(event) => setScheduleCommand(event.target.value)}
                  placeholder="php artisan schedule:run"
                  className="font-mono"
                  disabled={scheduleJobType !== "command"}
                />
              </div>
            )}
          </div>
          <Button
            onClick={() =>
              createScheduleMutation.mutate({
                resourceId: resource.id,
                name: scheduleName,
                cronExpression: scheduleCron,
                jobType: scheduleJobType,
                backupScheduleId:
                  scheduleJobType === "backup" ? backupScheduleId : null,
                command: scheduleJobType === "command" ? scheduleCommand : "",
                enabled: true,
              })
            }
            disabled={
              createScheduleMutation.isPending ||
              !scheduleName.trim() ||
              (scheduleJobType === "command" && !scheduleCommand.trim()) ||
              (scheduleJobType === "backup" && !backupScheduleId)
            }
            className="gap-2"
          >
            <RefreshCw className="size-4" /> Add schedule
          </Button>
          {schedulesQuery.data && schedulesQuery.data.length > 0 ? (
            <div className="divide-y divide-border/20 rounded-lg border border-border/30">
              {schedulesQuery.data.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-3 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{schedule.name}</div>
                    <div className="truncate font-mono text-muted-foreground text-xs">
                      {schedule.cronExpression} ·{" "}
                      {schedule.jobType ?? "command"}
                      {schedule.command ? ` · ${schedule.command}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        runScheduleMutation.mutate({ id: schedule.id })
                      }
                      disabled={runScheduleMutation.isPending}
                    >
                      <Play className="size-3" /> Run now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateScheduleMutation.mutate({
                          id: schedule.id,
                          enabled: !schedule.enabled,
                        })
                      }
                      disabled={updateScheduleMutation.isPending}
                    >
                      {schedule.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(`Delete schedule '${schedule.name}'?`)
                        ) {
                          deleteScheduleMutation.mutate({ id: schedule.id });
                        }
                      }}
                      disabled={deleteScheduleMutation.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              No resource schedules configured.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="font-semibold text-lg">
            Deployment History (Max 10)
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Audit trail of recent project builds.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-border/20 border-t pt-4">
          {deployList.length > 0 ? (
            <div className="overflow-hidden border border-border/20 bg-card/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                    <th className="p-3">Deployment ID</th>
                    <th className="p-3">Source revision</th>
                    <th className="p-3">Pipeline Status</th>
                    <th className="p-3">Trigger Time</th>
                    <th className="p-3 text-center">Action</th>
                    <th className="p-3 text-center">Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {deployList.map((dep) => (
                    <tr
                      key={dep.id}
                      className="border-border/10 border-b hover:bg-muted/5"
                    >
                      <td className="p-3 font-mono font-semibold text-foreground text-xs">
                        {dep.id}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground text-xs">
                        {dep.sourceRevision?.slice(0, 12) || "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 font-semibold text-xs",
                            dep.status === "success"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {dep.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(dep.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        {dep.status === "success" && canRollback ? (
                          <Button
                            onClick={() => {
                              if (
                                window.confirm(
                                  supportsHistoricalRollback
                                    ? `Redeploy this Git-backed ${resource.type === "compose" ? "Compose resource" : "application"} from the selected historical commit?`
                                    : "Roll back this Swarm service to its previous service specification?",
                                )
                              ) {
                                rollbackMutation.mutate({
                                  id: resource.id,
                                  deploymentId: dep.id,
                                });
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={rollbackMutation.isPending}
                          >
                            <History className="size-3.5" />
                            {supportsHistoricalRollback
                              ? "Redeploy revision"
                              : "Rollback"}
                          </Button>
                        ) : dep.status === "failed" ||
                          dep.status === "success" ? (
                          <Button
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Remove this deployment from history?",
                                )
                              ) {
                                removeDeploymentMutation.mutate({
                                  deploymentId: dep.id,
                                });
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-destructive text-xs"
                            disabled={removeDeploymentMutation.isPending}
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          onClick={() => {
                            setSelectedDeployment(dep);
                            setViewDeploymentLogsOpen(true);
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 font-medium text-xs hover:bg-accent"
                        >
                          <Eye className="size-3.5" /> Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No deployment history found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deployment build logs modal */}
      <Dialog
        open={viewDeploymentLogsOpen}
        onOpenChange={setViewDeploymentLogsOpen}
      >
        <DialogContent className="max-h-[90svh] w-[calc(100vw-1rem)] max-w-[min(96vw,56rem)] rounded-2xl border border-border bg-card font-mono shadow-2xl sm:min-w-[min(42rem,calc(100vw-2rem))]">
          <DialogHeader className="border-border border-b pb-3">
            <DialogTitle className="font-semibold text-foreground">
              Build & Deploy Logs: {selectedDeployment?.id}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Generated on{" "}
              {selectedDeployment &&
                new Date(selectedDeployment.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 select-text overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 p-4 font-mono text-foreground text-xs leading-relaxed">
            {selectedDeployment?.logs || "No logs available."}
          </div>
          <DialogFooter className="border-border border-t pt-3">
            <Button
              onClick={() => setViewDeploymentLogsOpen(false)}
              variant="outline"
            >
              Close Logs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
