import {
  type BackupRun,
  type IUnitOfWork,
  type S3Destination,
  ValidationError,
} from "@upstand/domain";
import { log } from "evlog";
import type { PublishNotificationUseCase } from "../notification/publish-notification.usecase";
import { BackupRuntimeService } from "./backup-runtime.service";
import { resolveBackupOrganizationId } from "./backup-schedule.service";

export class ExecuteBackupRunUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly publisher: Pick<PublishNotificationUseCase, "execute">,
    private readonly runtime = new BackupRuntimeService(),
  ) {}

  async execute(runId: string): Promise<BackupRun> {
    const run = await this.uow.backupRunRepository.findById(runId);
    if (!run) throw new ValidationError("Backup run not found");
    if (run.status === "succeeded") return run;

    const schedule = await this.uow.backupScheduleRepository.findById(
      run.scheduleId,
    );
    if (!schedule) throw new ValidationError("Backup schedule not found");
    const resource = await this.uow.resourceRepository.findById(run.resourceId);
    if (!resource) throw new ValidationError("Resource not found");
    const destination = await this.uow.s3DestinationRepository.findById(
      run.destinationId,
    );
    if (!destination) throw new ValidationError("Backup destination not found");

    const organizationId = await resolveBackupOrganizationId(
      this.uow,
      resource,
    );
    if (destination.organizationId !== organizationId) {
      throw new ValidationError(
        "Backup destination belongs to another organization",
      );
    }

    await this.uow.backupRunRepository.updateById(run.id, {
      status: "running",
      error: null,
      startedAt: new Date(),
      completedAt: null,
    });

    try {
      const fileKey = await this.runtime.createBackup(
        schedule,
        resource,
        destination,
      );
      const completed = await this.uow.backupRunRepository.updateById(run.id, {
        status: "succeeded",
        fileKey,
        error: null,
        completedAt: new Date(),
      });
      if (!completed)
        throw new Error("Backup run disappeared during execution");

      await this.enforceRetention(
        schedule.id,
        schedule.retentionCount,
        destination,
      );
      await this.publishOutcome({
        organizationId,
        run: completed,
        resourceName: resource.name,
        succeeded: true,
      });
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.uow.backupRunRepository.updateById(run.id, {
        status: "failed",
        error: message.slice(0, 1_000),
        completedAt: new Date(),
      });
      await this.publishOutcome({
        organizationId,
        run: failed ?? run,
        resourceName: resource.name,
        succeeded: false,
      });
      throw error;
    }
  }

  private async enforceRetention(
    scheduleId: string,
    retentionCount: number | null,
    destination: S3Destination,
  ): Promise<void> {
    if (!retentionCount || !destination) return;
    const runs = await this.uow.backupRunRepository.findByScheduleId(
      scheduleId,
      10_000,
    );
    const staleRuns = runs
      .filter(
        (candidate) => candidate.status === "succeeded" && candidate.fileKey,
      )
      .slice(retentionCount);

    for (const stale of staleRuns) {
      try {
        await this.runtime.deleteBackup(destination, stale.fileKey as string);
        await this.uow.backupRunRepository.deleteById(stale.id);
      } catch (error) {
        log.error({
          message: "Unable to delete expired backup",
          scheduleId,
          runId: stale.id,
          fileKey: stale.fileKey,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async publishOutcome(input: {
    organizationId: string;
    run: BackupRun;
    resourceName: string;
    succeeded: boolean;
  }): Promise<void> {
    const label = input.run.kind === "database" ? "Database" : "Volume";
    const event =
      input.run.kind === "database"
        ? "database_backup_completed"
        : "volume_backup_completed";
    await this.publisher
      .execute({
        organizationId: input.organizationId,
        event,
        idempotencyKey: `backup:${input.run.id}:${input.run.status}`,
        title: `${label} backup ${input.succeeded ? "completed" : "failed"}`,
        message: input.succeeded
          ? `${label} backup for ${input.resourceName} completed successfully.`
          : `${label} backup for ${input.resourceName} failed: ${input.run.error ?? "unknown error"}`,
        metadata: {
          backupRunId: input.run.id,
          resourceId: input.run.resourceId,
          fileKey: input.run.fileKey,
          status: input.run.status,
        },
      })
      .catch((error) => {
        log.error({
          message: "Unable to queue backup notification",
          backupRunId: input.run.id,
          err: error instanceof Error ? error.message : String(error),
        });
      });
  }
}
