"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { Switch } from "@upstand/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import {
  ArchiveRestore,
  CalendarClock,
  Database,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

type BackupKind = "database" | "volume";
type DatabaseEngine = "postgres" | "mysql" | "mariadb" | "mongodb";

type BackupSchedule = {
  id: string;
  destinationId: string;
  name: string;
  kind: BackupKind;
  cronExpression: string;
  timezone: string;
  prefix: string;
  retentionCount: number | null;
  enabled: boolean;
  databaseName: string | null;
  databaseEngine: DatabaseEngine | null;
  serviceName: string | null;
  volumeName: string | null;
  stopService: boolean;
};

type BackupRun = {
  id: string;
  scheduleId: string;
  kind: BackupKind;
  status: "queued" | "running" | "succeeded" | "failed";
  fileKey: string | null;
  error: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
};

type FormState = {
  name: string;
  destinationId: string;
  kind: BackupKind;
  cronExpression: string;
  timezone: string;
  prefix: string;
  retentionCount: string;
  databaseName: string;
  databaseEngine: DatabaseEngine;
  serviceName: string;
  volumeName: string;
  stopService: boolean;
  databaseUser: string;
  databasePassword: string;
};

const STATUS_VARIANT: Record<
  BackupRun["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
};

function defaultEngine(dbType?: string | null): DatabaseEngine {
  if (dbType === "mysql" || dbType === "mariadb" || dbType === "mongodb") {
    return dbType;
  }
  return "postgres";
}

function makeForm(
  resource: { name: string; dbType?: string | null },
  schedule?: BackupSchedule,
): FormState {
  return {
    name: schedule?.name ?? `${resource.name} backup`,
    destinationId: schedule?.destinationId ?? "",
    kind: schedule?.kind ?? "database",
    cronExpression: schedule?.cronExpression ?? "0 2 * * *",
    timezone:
      schedule?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC",
    prefix: schedule?.prefix ?? "",
    retentionCount: schedule?.retentionCount?.toString() ?? "7",
    databaseName: schedule?.databaseName ?? "",
    databaseEngine: schedule?.databaseEngine ?? defaultEngine(resource.dbType),
    serviceName: schedule?.serviceName ?? "",
    volumeName: schedule?.volumeName ?? "",
    stopService: schedule?.stopService ?? false,
    databaseUser: "",
    databasePassword: "",
  };
}

function showError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : "Backup action failed");
}

export function BackupPanel({
  resource,
  organizationId,
}: {
  resource: { id: string; name: string; type: string; dbType?: string | null };
  organizationId: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(() => makeForm(resource));
  const [scheduleToDelete, setScheduleToDelete] =
    useState<BackupSchedule | null>(null);
  const [runToRestore, setRunToRestore] = useState<BackupRun | null>(null);

  const { data: schedules = [], isPending: schedulesPending } = useQuery({
    ...trpc.backup.listSchedules.queryOptions({ resourceId: resource.id }),
    refetchInterval: 15_000,
  });
  const { data: runs = [], isPending: runsPending } = useQuery({
    ...trpc.backup.listRuns.queryOptions({
      resourceId: resource.id,
      limit: 100,
    }),
    refetchInterval: 5_000,
  });
  const { data: destinations = [] } = useQuery({
    ...trpc.s3Destination.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const volumeQuery = useQuery({
    ...trpc.backup.listVolumes.queryOptions({ resourceId: resource.id }),
    enabled: false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.backup.listSchedules.queryKey({
          resourceId: resource.id,
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.backup.listRuns.queryKey({
          resourceId: resource.id,
          limit: 100,
        }),
      }),
    ]);
  };

  const createSchedule = useMutation({
    ...trpc.backup.createSchedule.mutationOptions(),
    onSuccess: async () => {
      toast.success("Backup schedule created");
      setDialogOpen(false);
      await refresh();
    },
    onError: showError,
  });
  const updateSchedule = useMutation({
    ...trpc.backup.updateSchedule.mutationOptions(),
    onSuccess: async () => {
      toast.success("Backup schedule updated");
      setDialogOpen(false);
      await refresh();
    },
    onError: showError,
  });
  const deleteSchedule = useMutation({
    ...trpc.backup.deleteSchedule.mutationOptions(),
    onSuccess: async () => {
      toast.success("Backup schedule and its stored artifacts were deleted");
      setScheduleToDelete(null);
      await refresh();
    },
    onError: showError,
  });
  const runNow = useMutation({
    ...trpc.backup.runNow.mutationOptions(),
    onSuccess: async (run) => {
      toast.success(
        run ? "Backup queued" : "A backup for this schedule is already running",
      );
      await refresh();
    },
    onError: showError,
  });
  const restoreRun = useMutation({
    ...trpc.backup.restore.mutationOptions(),
    onSuccess: () => {
      toast.success("Backup restore completed");
      setRunToRestore(null);
    },
    onError: showError,
  });

  const selectedDestination = useMemo(
    () =>
      destinations.find((destination) => destination.id === form.destinationId),
    [destinations, form.destinationId],
  );

  const openCreate = () => {
    setEditingSchedule(null);
    setForm(makeForm(resource));
    setDialogOpen(true);
  };
  const openEdit = (schedule: BackupSchedule) => {
    setEditingSchedule(schedule);
    setForm(makeForm(resource, schedule));
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.destinationId) {
      toast.error("Choose an S3 backup destination");
      return;
    }
    if (form.kind === "database" && !form.databaseName.trim()) {
      toast.error("Database name is required");
      return;
    }
    if (form.kind === "volume" && !form.volumeName.trim()) {
      toast.error("Choose a Docker volume");
      return;
    }
    const sourceCredentials =
      form.databaseUser.trim() && form.databasePassword
        ? {
            databaseUser: form.databaseUser.trim(),
            databasePassword: form.databasePassword,
          }
        : undefined;
    const payload = {
      resourceId: resource.id,
      destinationId: form.destinationId,
      name: form.name.trim(),
      kind: form.kind,
      cronExpression: form.cronExpression.trim(),
      timezone: form.timezone.trim(),
      prefix: form.prefix.trim(),
      retentionCount: form.retentionCount ? Number(form.retentionCount) : null,
      enabled: true,
      databaseName:
        form.kind === "database" ? form.databaseName.trim() : undefined,
      databaseEngine:
        form.kind === "database" ? form.databaseEngine : undefined,
      serviceName: form.serviceName.trim() || undefined,
      volumeName: form.kind === "volume" ? form.volumeName.trim() : undefined,
      stopService: form.kind === "volume" && form.stopService,
      sourceCredentials,
    };
    if (editingSchedule) {
      updateSchedule.mutate({ ...payload, id: editingSchedule.id });
    } else {
      createSchedule.mutate(payload);
    }
  };

  const updating = createSchedule.isPending || updateSchedule.isPending;

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 bg-card/20">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="size-5 text-primary" /> Backup schedules
            </CardTitle>
            <CardDescription>
              Stream encrypted database dumps and volume archives to an
              S3-compatible destination. Schedules run in the selected timezone.
            </CardDescription>
          </div>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="size-4" /> Add backup
          </Button>
        </CardHeader>
        <CardContent>
          {schedulesPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : schedules.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No backup schedules. Create one to protect this resource.
            </p>
          ) : (
            <div className="space-y-3">
              {(schedules as BackupSchedule[]).map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => openEdit(schedule)}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {schedule.kind === "database" ? (
                        <Database className="size-4 text-primary" />
                      ) : (
                        <HardDrive className="size-4 text-primary" />
                      )}
                      {schedule.name}
                      <Badge variant={schedule.enabled ? "default" : "outline"}>
                        {schedule.enabled ? "Enabled" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {schedule.cronExpression} · {schedule.timezone} · keep{" "}
                      {schedule.retentionCount ?? "all"} backups
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={runNow.isPending}
                      onClick={() => runNow.mutate({ scheduleId: schedule.id })}
                    >
                      {runNow.isPending ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )}{" "}
                      Run now
                    </Button>
                    <div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
                      <Switch
                        checked={schedule.enabled}
                        aria-label={`Toggle ${schedule.name}`}
                        onCheckedChange={(enabled) =>
                          updateSchedule.mutate({ id: schedule.id, enabled })
                        }
                      />
                      {schedule.enabled ? "On" : "Off"}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${schedule.name}`}
                      onClick={() => setScheduleToDelete(schedule)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/40 bg-card/20">
        <CardHeader>
          <CardTitle className="text-lg">Backup history</CardTitle>
          <CardDescription>
            Every backup is recorded before execution, so queued, failed, and
            completed runs remain auditable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runsPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No backup runs yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Artifact / error</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runs as BackupRun[]).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="capitalize">{run.kind}</TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[run.status]}
                          className="capitalize"
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {new Date(run.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell
                        className="max-w-80 truncate font-mono text-xs"
                        title={run.error ?? run.fileKey ?? undefined}
                      >
                        {run.error ?? run.fileKey ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {run.status === "succeeded" && run.fileKey ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => setRunToRestore(run)}
                          >
                            <ArchiveRestore className="size-3" /> Restore
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule
                ? "Edit backup schedule"
                : "Create backup schedule"}
            </DialogTitle>
            <DialogDescription>
              Backup data is streamed directly to the selected destination.
              Stored destination and source credentials remain encrypted at
              rest.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="backup-name">Name</FieldLabel>
              <Input
                id="backup-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Backup type</FieldLabel>
                <Select
                  value={form.kind}
                  onValueChange={(value) =>
                    setForm({ ...form, kind: value as BackupKind })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="database">Database dump</SelectItem>
                    <SelectItem value="volume">
                      Docker volume archive
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Destination</FieldLabel>
                <Select
                  value={form.destinationId}
                  onValueChange={(value) =>
                    setForm({ ...form, destinationId: value ?? "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destination.name} ({destination.bucket})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {destinations.length === 0 && (
                  <p className="mt-1 text-muted-foreground text-xs">
                    Create an S3 destination in workspace settings first.
                  </p>
                )}
              </Field>
            </div>
            {selectedDestination && (
              <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
                Writing to {selectedDestination.bucket}/
                {form.prefix || "resource-id/"} via {selectedDestination.name}.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="backup-cron">Cron expression</FieldLabel>
                <Input
                  id="backup-cron"
                  value={form.cronExpression}
                  onChange={(event) =>
                    setForm({ ...form, cronExpression: event.target.value })
                  }
                  placeholder="0 2 * * *"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="backup-timezone">Timezone</FieldLabel>
                <Input
                  id="backup-timezone"
                  value={form.timezone}
                  onChange={(event) =>
                    setForm({ ...form, timezone: event.target.value })
                  }
                  placeholder="UTC"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="backup-retention">Keep latest</FieldLabel>
                <Input
                  id="backup-retention"
                  type="number"
                  min="1"
                  max="3650"
                  value={form.retentionCount}
                  onChange={(event) =>
                    setForm({ ...form, retentionCount: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="backup-prefix">
                Path prefix (optional)
              </FieldLabel>
              <Input
                id="backup-prefix"
                value={form.prefix}
                onChange={(event) =>
                  setForm({ ...form, prefix: event.target.value })
                }
                placeholder="production"
              />
            </Field>

            {form.kind === "database" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel>Engine</FieldLabel>
                    <Select
                      value={form.databaseEngine}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          databaseEngine: value as DatabaseEngine,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="postgres">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="mariadb">MariaDB</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="backup-database">
                      Database name
                    </FieldLabel>
                    <Input
                      id="backup-database"
                      value={form.databaseName}
                      onChange={(event) =>
                        setForm({ ...form, databaseName: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="backup-service">
                      Compose service (optional)
                    </FieldLabel>
                    <Input
                      id="backup-service"
                      value={form.serviceName}
                      onChange={(event) =>
                        setForm({ ...form, serviceName: event.target.value })
                      }
                      placeholder="postgres"
                    />
                  </Field>
                </div>
                {resource.type === "compose" && (
                  <div className="grid gap-4 rounded-lg border border-border/50 p-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="backup-user">
                        Database user
                      </FieldLabel>
                      <Input
                        id="backup-user"
                        value={form.databaseUser}
                        onChange={(event) =>
                          setForm({ ...form, databaseUser: event.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="backup-password">
                        Database password
                      </FieldLabel>
                      <Input
                        id="backup-password"
                        type="password"
                        value={form.databasePassword}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            databasePassword: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="text-muted-foreground text-xs sm:col-span-2">
                      Compose resources require source database credentials.
                      Leave these blank when editing to preserve the saved
                      encrypted credentials.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field>
                    <FieldLabel>Docker volume</FieldLabel>
                    <Select
                      value={form.volumeName}
                      onValueChange={(value) =>
                        setForm({ ...form, volumeName: value ?? "" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Discover or select a volume" />
                      </SelectTrigger>
                      <SelectContent>
                        {(volumeQuery.data ?? []).map((volume) => (
                          <SelectItem key={volume} value={volume}>
                            {volume}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={volumeQuery.isFetching}
                    onClick={() => void volumeQuery.refetch()}
                  >
                    {volumeQuery.isFetching ? <Spinner /> : "Discover volumes"}
                  </Button>
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
                  <Switch
                    checked={form.stopService}
                    onCheckedChange={(stopService) =>
                      setForm({ ...form, stopService })
                    }
                  />{" "}
                  Stop the service during archive and restore for a consistent
                  volume snapshot.
                </label>
              </>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={updating} onClick={submit}>
              {updating && <Spinner />}{" "}
              {editingSchedule ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(scheduleToDelete)}
        onOpenChange={(open) => !open && setScheduleToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete backup schedule?</DialogTitle>
            <DialogDescription>
              This permanently deletes every stored artifact recorded for{" "}
              {scheduleToDelete?.name}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSchedule.isPending}
              onClick={() =>
                scheduleToDelete &&
                deleteSchedule.mutate({ id: scheduleToDelete.id })
              }
            >
              {deleteSchedule.isPending && <Spinner />} Delete schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(runToRestore)}
        onOpenChange={(open) => !open && setRunToRestore(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              Restore overwrites the selected database or volume with this
              artifact. Stop application traffic first if the workload needs a
              coordinated restore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunToRestore(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={restoreRun.isPending}
              onClick={() =>
                runToRestore && restoreRun.mutate({ runId: runToRestore.id })
              }
            >
              {restoreRun.isPending && <Spinner />} Restore backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
