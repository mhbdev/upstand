import type { Server } from "@upstand/domain";
import { DockerCleanupService } from "@upstand/infrastructure";
import {
  AccessLogCleanupScheduler,
  AutoscalingService,
  resolveDockerCliEnvironmentForServer,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CaddyServiceToken,
  DockerServiceToken,
  GeneralSchedulerToken,
  PublishNotificationUseCaseToken,
  RunDueSecretRotationsUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";
import { getServiceProvider } from "./di";

export class ScheduledDockerCleanup {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRunDate: string | null = null;

  constructor(
    private readonly dockerCleanupService = new DockerCleanupService(),
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.run(), 60 * 60 * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<void> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    if (now.getHours() !== 3 || this.lastRunDate === date) return;
    this.lastRunDate = date;

    const scope = getServiceProvider().createScope();
    try {
      const uow = scope.resolve(UnitOfWorkToken);
      const settings = await uow.webServerSettingsRepository.findGlobal();
      const publisher = scope.resolve(PublishNotificationUseCaseToken);

      if (settings?.dailyDockerCleanup) {
        log.info({ message: "Running scheduled local Docker cleanup... 🧹" });
        await this.dockerCleanupService.run("all");
        await publisher
          .execute({
            event: "docker_cleanup_completed",
            idempotencyKey: `docker-cleanup:local:${date}`,
            title: "🧹 Docker Cleanup Completed",
            message:
              "Upstand successfully executed the scheduled daily cleanup of unused Docker images, stopped containers, and dangling build caches.",
            metadata: {
              event: "docker_cleanup_completed",
              date,
              scope: "local",
            },
          })
          .catch((notificationError: unknown) => {
            log.error({
              message: "Unable to queue local Docker cleanup notification",
              err:
                notificationError instanceof Error
                  ? notificationError.message
                  : notificationError,
            });
          });
      }

      const servers = await uow.serverRepository.findMany();
      for (const server of servers.filter(
        (candidate: Server) => candidate.enableDockerCleanup,
      )) {
        try {
          const remote = await resolveDockerCliEnvironmentForServer(
            server.id,
            uow,
          );
          try {
            log.info({
              message: `Running scheduled Docker cleanup on remote server '${server.name}'... 🧹`,
              serverId: server.id,
            });
            await this.dockerCleanupService.run("all", remote.environment);
          } finally {
            remote.cleanup();
          }
          await publisher
            .execute({
              event: "docker_cleanup_completed",
              idempotencyKey: `docker-cleanup:${server.id}:${date}`,
              title: `Docker cleanup completed on ${server.name}`,
              message: `Upstand completed the scheduled cleanup of unused Docker resources on ${server.name}.`,
            })
            .catch((notificationError: unknown) => {
              log.error({
                message: "Unable to queue remote Docker cleanup notification",
                serverId: server.id,
                err:
                  notificationError instanceof Error
                    ? notificationError.message
                    : notificationError,
              });
            });
        } catch (error: unknown) {
          log.error({
            message: "Failed to run scheduled remote Docker cleanup",
            serverId: server.id,
            err: error,
          });
        }
      }
    } catch (error: unknown) {
      log.error({
        message: "Failed to run scheduled Docker cleanup",
        err: error,
      });
    } finally {
      await scope.dispose();
    }
  }
}

export class AutoscalingRuntime {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly lastScaledAt = new Map<string, number>();

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const scope = getServiceProvider().createScope();
    try {
      const decisions = await new AutoscalingService(
        scope.resolve(UnitOfWorkToken),
        scope.resolve(DockerServiceToken),
        this.lastScaledAt,
        scope.resolve(CaddyServiceToken),
      ).reconcileAll();
      for (const decision of decisions)
        log.info({
          message: "Autoscaling changed resource replicas",
          ...decision,
        });
    } catch (error: unknown) {
      log.warn({
        message: "Autoscaling reconciliation failed",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
      await scope.dispose();
    }
  }

  start(): void {
    this.timer = setInterval(() => void this.runOnce(), 30_000);
    this.timer.unref?.();
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

export class SchedulerManager {
  private secretRotationTimer: ReturnType<typeof setInterval> | null = null;
  private readonly scheduledDockerCleanup = new ScheduledDockerCleanup();
  private readonly autoscalingRuntime = new AutoscalingRuntime();
  private accessLogCleanupScheduler: AccessLogCleanupScheduler | null = null;

  async start(): Promise<void> {
    log.info({ message: "Starting standalone cron schedulers..." });

    const backupScheduler = getServiceProvider().resolve(BackupSchedulerToken);
    const generalScheduler = getServiceProvider().resolve(
      GeneralSchedulerToken,
    );

    this.accessLogCleanupScheduler = new AccessLogCleanupScheduler(
      async () => {
        const scope = getServiceProvider().createScope();
        try {
          const settings = await scope
            .resolve(UnitOfWorkToken)
            .webServerSettingsRepository.findGlobal();
          return {
            enabled: settings?.accessLogsEnabled ?? false,
            cronExpression: settings?.accessLogCleanupCron ?? "0 3 * * *",
          };
        } finally {
          await scope.dispose();
        }
      },
      async () => {
        const scope = getServiceProvider().createScope();
        try {
          await scope.resolve(CaddyServiceToken).cleanupAccessLogs();
        } finally {
          await scope.dispose();
        }
      },
    );

    await backupScheduler.start();
    await generalScheduler.start();
    await this.accessLogCleanupScheduler.start();
    this.autoscalingRuntime.start();
    this.scheduledDockerCleanup.start();

    this.secretRotationTimer = setInterval(() => {
      const scope = getServiceProvider().createScope();
      void scope
        .resolve(RunDueSecretRotationsUseCaseToken)
        .execute()
        .catch((error: unknown) => {
          log.warn({
            message: "Secret rotation reconciliation failed",
            err: error,
          });
        })
        .finally(() => scope.dispose());
    }, 60_000);
    this.secretRotationTimer.unref?.();

    log.info({ message: "Standalone cron schedulers started successfully ⏱️" });
  }

  async stop(): Promise<void> {
    log.info({ message: "Stopping standalone cron schedulers..." });

    const backupScheduler = getServiceProvider().resolve(BackupSchedulerToken);
    const generalScheduler = getServiceProvider().resolve(
      GeneralSchedulerToken,
    );

    this.scheduledDockerCleanup.stop();
    this.autoscalingRuntime.stop();
    if (this.secretRotationTimer) {
      clearInterval(this.secretRotationTimer);
      this.secretRotationTimer = null;
    }

    await Promise.allSettled([
      backupScheduler.stop(),
      generalScheduler.stop(),
      this.accessLogCleanupScheduler?.stop(),
    ]);

    log.info({ message: "Standalone cron schedulers stopped" });
  }
}
