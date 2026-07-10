import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import { BackupRuntimeService } from "./backup-runtime.service";

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
    const [schedule, resource, destination] = await Promise.all([
      this.uow.backupScheduleRepository.findById(run.scheduleId),
      this.uow.resourceRepository.findById(run.resourceId),
      this.uow.s3DestinationRepository.findById(run.destinationId),
    ]);
    if (!schedule) throw new ValidationError("Backup schedule not found");
    if (!resource) throw new ValidationError("Resource not found");
    if (!destination) throw new ValidationError("Backup destination not found");

    await this.runtime.restoreBackup(
      schedule,
      resource,
      destination,
      run.fileKey,
    );
  }
}
