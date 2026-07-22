import { closeRedis, createRedis, type Redis } from "@upstand/redis";
import { Worker } from "bullmq";
import { log } from "evlog";
import { BACKUP_RUN_QUEUE } from "./trigger-backup-run.usecase";

export interface BackupRunJob {
  data: { runId?: string };
  opts: { attempts?: number };
  attemptsMade: number;
}

export type BackupRunHandler = (job: BackupRunJob) => Promise<void>;

export class BackupRunWorker {
  private worker: Worker | null = null;
  private workerRedis: Redis | null = null;

  constructor(private readonly handleBackupRun: BackupRunHandler) {}

  async start(): Promise<void> {
    if (this.worker) return;
    const connection = createRedis({
      maxRetriesPerRequest: null,
      loggerName: "backup-worker",
    });
    this.workerRedis = connection;

    try {
      this.worker = new Worker(
        BACKUP_RUN_QUEUE,
        (job) => this.handleBackupRun(job),
        {
          connection: connection as never,
          concurrency: 2,
          maxStalledCount: 1,
          stalledInterval: 30_000,
        },
      );
      this.worker.on("failed", (job, error) => {
        log.error({
          message: "Backup run job failed",
          runId: job?.data?.runId,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          err: error,
        });
      });
      this.worker.on("error", (error) => {
        log.error({
          message: "Backup worker connection error",
          err: error,
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
}
