import { randomUUID } from "node:crypto";
import {
  type BackupRun,
  type IUnitOfWork,
  ValidationError,
} from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";
import { z } from "zod";
import { acquireBackupRunLock, releaseBackupRunLock } from "./backup-run-lock";

export const BACKUP_RUN_QUEUE = "backup-run";

export const TriggerBackupRunInputSchema = z.object({
  scheduleId: z.string().min(1),
});
export type TriggerBackupRunInput = z.infer<typeof TriggerBackupRunInputSchema>;

export interface BackupRunQueue {
  add(
    name: string,
    data: { runId: string },
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: "exponential"; delay: number };
      removeOnComplete: number;
      removeOnFail: number;
    },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export type BackupRunQueueFactory = () => BackupRunQueue;
const createBackupRunQueue: BackupRunQueueFactory = () =>
  new Queue(BACKUP_RUN_QUEUE, { connection: redis as never });

export { backupRunLockKey } from "./backup-run-lock";

/**
 * Creates a durable run record before enqueueing. The Redis lock makes cron
 * execution safe when more than one API process is running.
 */
export class TriggerBackupRunUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly queueFactory: BackupRunQueueFactory = createBackupRunQueue,
  ) {}

  async execute(input: TriggerBackupRunInput): Promise<BackupRun | null> {
    const schedule = await this.uow.backupScheduleRepository.findById(
      input.scheduleId,
    );
    if (!schedule) throw new ValidationError("Backup schedule not found");

    const runId = randomUUID();
    if (!(await acquireBackupRunLock(schedule.id, runId))) return null;

    let run: BackupRun | null = null;
    try {
      run = await this.uow.transaction((tx) =>
        tx.backupRunRepository.create({
          id: runId,
          scheduleId: schedule.id,
          resourceId: schedule.resourceId,
          organizationId: schedule.organizationId,
          destinationId: schedule.destinationId,
          kind: schedule.kind,
          status: "queued",
        }),
      );

      const queue = this.queueFactory();
      try {
        await queue.add(
          "run",
          { runId: run.id },
          {
            jobId: run.id,
            attempts: 2,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        );
      } finally {
        await queue.close();
      }
      return run;
    } catch (error) {
      if (run) {
        const message = error instanceof Error ? error.message : String(error);
        await this.uow.backupRunRepository.updateById(run.id, {
          status: "failed",
          error: `Unable to enqueue backup: ${message}`.slice(0, 1_000),
          completedAt: new Date(),
        });
      }
      await releaseBackupRunLock(schedule.id, runId);
      throw error;
    }
  }
}
