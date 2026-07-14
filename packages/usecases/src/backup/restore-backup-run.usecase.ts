import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import {
  BackupRuntimeService,
  withBackupRuntime,
} from "./backup-runtime.service";

export const RestoreBackupRunInputSchema = z.object({
  runId: z.string().min(1),
});
export type RestoreBackupRunInput = z.infer<typeof RestoreBackupRunInputSchema>;

/** Restores only completed artifacts. The user confirms this destructive action in the UI. */
export class RestoreBackupRunUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly runtime = new BackupRuntimeService(),
  ) {}

  async execute(input: RestoreBackupRunInput): Promise<void> {
    const run = await this.uow.backupRunRepository.findById(input.runId);
    if (run?.status !== "succeeded" || !run.fileKey) {
      throw new ValidationError("Completed backup artifact not found");
    }
    const fileKey = run.fileKey;
    const [schedule, resource, destination] = await Promise.all([
      this.uow.backupScheduleRepository.findById(run.scheduleId),
      run.resourceId
        ? this.uow.resourceRepository.findById(run.resourceId)
        : Promise.resolve(null),
      this.uow.s3DestinationRepository.findById(run.destinationId),
    ]);
    if (!schedule) throw new ValidationError("Backup schedule not found");
    if (schedule.kind !== "web-server" && !resource) {
      throw new ValidationError("Resource not found");
    }
    if (!destination) throw new ValidationError("Backup destination not found");

    if (schedule.kind === "web-server") {
      await this.runtime.restoreWebServerBackup(destination, fileKey);
      return;
    }
    await withBackupRuntime(
      this.uow,
      resource as NonNullable<typeof resource>,
      this.runtime,
      (runtime) =>
        runtime.restoreBackup(
          schedule,
          resource as NonNullable<typeof resource>,
          destination,
          fileKey,
        ),
    );
  }
}
