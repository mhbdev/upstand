import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import { BackupRuntimeService } from "./backup-runtime.service";

export const DeleteBackupScheduleInputSchema = z.object({
  id: z.string().min(1),
});
export type DeleteBackupScheduleInput = z.infer<
  typeof DeleteBackupScheduleInputSchema
>;

/** Removes retained objects before deleting the schedule, preventing orphaned backups. */
export class DeleteBackupScheduleUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly runtime = new BackupRuntimeService(),
  ) {}

  async execute(input: DeleteBackupScheduleInput): Promise<boolean> {
    const schedule = await this.uow.backupScheduleRepository.findById(input.id);
    if (!schedule) throw new ValidationError("Backup schedule not found");
    const destination = await this.uow.s3DestinationRepository.findById(
      schedule.destinationId,
    );
    if (!destination) throw new ValidationError("Backup destination not found");

    const runs = await this.uow.backupRunRepository.findByScheduleId(
      schedule.id,
      10_000,
    );
    for (const run of runs) {
      if (run.fileKey)
        await this.runtime.deleteBackup(destination, run.fileKey);
    }
    return this.uow.transaction((tx) =>
      tx.backupScheduleRepository.deleteById(schedule.id),
    );
  }
}
