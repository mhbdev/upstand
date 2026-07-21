import type { IUnitOfWork } from "@upstand/domain";
import type { BackupRunJob } from "@upstand/usecases";
import {
  releaseBackupRunLock,
  renewBackupRunLock,
} from "@upstand/usecases/backup/backup-run-lock";
import type { ExecuteBackupRunUseCase } from "@upstand/usecases/backup/execute-backup-run.usecase";
import {
  ExecuteBackupRunUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";

interface ScopedServiceProvider {
  createScope(): {
    resolve<T>(token: unknown): T;
    dispose(): Promise<void>;
  };
}

export function createBackupRunHandler(
  getServiceProvider: () => ScopedServiceProvider,
) {
  return async (job: BackupRunJob): Promise<void> => {
    const runId = job.data.runId;
    if (!runId) throw new Error("Backup job is missing runId");

    const scope = getServiceProvider().createScope();
    const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
    let scheduleId: string | null = null;
    let renewalTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const run = await uow.backupRunRepository.findById(runId);
      if (!run) throw new Error("Backup run record not found");
      scheduleId = run.scheduleId;
      if (run.status === "succeeded") return;

      const claimedRun = await uow.backupRunRepository.claimForExecution(
        runId,
        new Date(),
      );
      // Another worker owns the run. Do not release the original trigger
      // lock from this duplicate worker.
      if (!claimedRun) return;

      renewalTimer = setInterval(
        () =>
          void renewBackupRunLock(claimedRun.scheduleId, runId)
            .then((renewed) => {
              if (!renewed) {
                log.error({
                  message: "Backup run no longer owns its schedule lock",
                  scheduleId: claimedRun.scheduleId,
                  runId,
                });
              }
            })
            .catch((error) => {
              log.warn({
                message: "Unable to renew backup run lock",
                scheduleId: claimedRun.scheduleId,
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
      await execute.execute(runId, claimedRun);
      await releaseBackupRunLock(claimedRun.scheduleId, runId);
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
  };
}
