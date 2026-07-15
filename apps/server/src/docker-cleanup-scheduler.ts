import { serviceProvider } from "@upstand/api/di";
import {
  DockerCleanupService,
  resolveDockerCliEnvironmentForServer,
} from "@upstand/usecases";
import {
  PublishNotificationUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";

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

    const scope = serviceProvider.createScope();
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
            title: "Daily Docker cleanup completed",
            message:
              "Upstand completed the scheduled cleanup of unused local Docker resources.",
          })
          .catch((notificationError) => {
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
        (candidate) => candidate.enableDockerCleanup,
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
            .catch((notificationError) => {
              log.error({
                message: "Unable to queue remote Docker cleanup notification",
                serverId: server.id,
                err:
                  notificationError instanceof Error
                    ? notificationError.message
                    : notificationError,
              });
            });
        } catch (error) {
          log.error({
            message: "Failed to run scheduled remote Docker cleanup",
            serverId: server.id,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      log.error({
        message: "Failed to run scheduled Docker cleanup",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await scope.dispose();
    }
  }
}
