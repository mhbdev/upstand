import type { IUnitOfWork } from "@upstand/domain";
import { closeRedis, createRedis, type Redis } from "@upstand/redis";
import { type Job, Worker } from "bullmq";
import { log } from "evlog";
import { ExecuteBackupRunUseCaseToken, UnitOfWorkToken } from "../tokens";
import { releaseBackupRunLock, renewBackupRunLock } from "./backup-run-lock";
import type { ExecuteBackupRunUseCase } from "./execute-backup-run.usecase";
import { BACKUP_RUN_QUEUE } from "./trigger-backup-run.usecase";

interface ScopedServiceProvider {
  createScope(): {
    resolve<T>(token: unknown): T;
    dispose(): Promise<void>;
  };
}

export class BackupRunWorker {
  private worker: Worker | null = null;
  private workerRedis: Redis | null = null;

  constructor(
    private readonly getServiceProvider: () => ScopedServiceProvider,
  ) {}

  async start(): Promise<void> {
    if (this.worker) return;
    const connection = createRedis({
      maxRetriesPerRequest: null,
      loggerName: "backup-worker",
    });
    this.workerRedis = connection;

    try {
      this.worker = new Worker(BACKUP_RUN_QUEUE, (job) => this.process(job), {
        connection: connection as never,
        concurrency: 2,
        maxStalledCount: 1,
        stalledInterval: 30_000,
      });
      this.worker.on("failed", (job, error) => {
        log.error({
          message: "Backup run job failed",
          runId: job?.data?.runId,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          err: error.message,
        });
      });
      this.worker.on("error", (error) => {
        log.error({
          message: "Backup worker connection error",
          err: error.message,
        });
      });
      await this.worker.waitUntilReady();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  isReady(): boolean {
    return Boolean(this.worker?.isRunning());
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.workerRedis) {
      await closeRedis(this.workerRedis);
      this.workerRedis = null;
    }
  }

  private async process(job: Job<{ runId?: string }>): Promise<void> {
    const runId = job.data.runId;
    if (!runId) throw new Error("Backup job is missing runId");

    const scope = this.getServiceProvider().createScope();
    const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
    let scheduleId: string | null = null;
    let renewalTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const run = await uow.backupRunRepository.findById(runId);
      if (!run) throw new Error("Backup run record not found");
      scheduleId = run.scheduleId;
      if (run.status === "succeeded") {
        await releaseBackupRunLock(scheduleId, runId);
        return;
      }

      renewalTimer = setInterval(
        () =>
          void renewBackupRunLock(run.scheduleId, runId)
            .then((renewed) => {
              if (!renewed) {
                log.error({
                  message: "Backup run no longer owns its schedule lock",
                  scheduleId: run.scheduleId,
                  runId,
                });
              }
            })
            .catch((error) => {
              log.warn({
                message: "Unable to renew backup run lock",
                scheduleId: run.scheduleId,
                runId,
                err: error instanceof Error ? error.message : String(error),
              });
            }),
        60_000,
      );
      renewalTimer.unref?.();

      const execute = scope.resolve<ExecuteBackupRunUseCase>(
        ExecuteBackupRunUseCaseToken,
      );
      await execute.execute(runId);
      await releaseBackupRunLock(run.scheduleId, runId);
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      if (finalAttempt && scheduleId) {
        await releaseBackupRunLock(scheduleId, runId);
      }
      throw error;
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
      await scope.dispose();
    }
  }
}
