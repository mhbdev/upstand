import { getServiceProvider } from "@upstand/api/di";
import { getDockerInstance } from "@upstand/infrastructure";
import { DeploymentWorker } from "@upstand/usecases";
import {
  CaddyServiceToken,
  DockerServiceToken,
  PublishNotificationUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";

export class DeploymentRuntime {
  private readonly workers = new Map<string, DeploymentWorker>();
  private refreshInFlight: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  isReady(): boolean {
    return (
      this.workers.size > 0 &&
      [...this.workers.values()].every((worker) => worker.isReady())
    );
  }

  async start(): Promise<void> {
    await this.refreshWorkers();
  }

  startMaintenance(): void {
    this.refreshTimer = setInterval(
      () =>
        void this.refreshWorkers().catch((error) => {
          log.error({
            message: "Failed to refresh deployment queue workers",
            err: error instanceof Error ? error.message : String(error),
          });
        }),
      60_000,
    );
    this.refreshTimer.unref?.();
  }

  async refreshWorkers(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const serverIds = await this.discoverServerIds();
      for (const serverId of serverIds) {
        if (this.workers.has(serverId)) continue;
        const worker = new DeploymentWorker(serverId, {
          getBuildSettings: async () => {
            const scope = getServiceProvider().createScope();
            try {
              const uow = scope.resolve(UnitOfWorkToken);
              const settings =
                await uow.serverBuildSettingsRepository.findById(serverId);
              if (settings) return settings;

              const concurrency = serverId === "local" ? 2 : 1;
              await uow.serverBuildSettingsRepository.create({
                id: serverId,
                hostname:
                  serverId === "local"
                    ? "Upstand Server"
                    : `Swarm Node ${serverId}`,
                ip: "127.0.0.1",
                concurrency,
              });
              return { concurrency };
            } finally {
              await scope.dispose();
            }
          },
          createScope: async () => {
            const scope = getServiceProvider().createScope();
            return {
              uow: scope.resolve(UnitOfWorkToken),
              dockerService: scope.resolve(DockerServiceToken),
              caddyService: scope.resolve(CaddyServiceToken),
              publisher: scope.resolve(PublishNotificationUseCaseToken),
              dispose: () => scope.dispose(),
            };
          },
        });
        await worker.start();
        this.workers.set(serverId, worker);
        log.info({
          message: "Deployment queue worker started",
          serverId,
          queueConsumers: this.workers.size,
        });
      }
    })();

    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  async shutdown(): Promise<PromiseSettledResult<void>[]> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;

    return Promise.allSettled(
      [...this.workers.values()].map((worker) => worker.stop()),
    );
  }

  private async discoverServerIds(): Promise<string[]> {
    if (process.env.SERVER_ID) return [process.env.SERVER_ID];

    const serverIds = new Set<string>();
    const scope = getServiceProvider().createScope();
    try {
      const uow = scope.resolve(UnitOfWorkToken);
      const servers = await uow.serverRepository.findMany();
      const serverById = new Map(servers.map((server) => [server.id, server]));
      const settings = await uow.serverBuildSettingsRepository.findMany();
      for (const setting of settings) {
        if (serverById.get(setting.id)?.serverType !== "database") {
          serverIds.add(setting.id);
        }
      }

      for (const server of servers) {
        if (server.status === "ready" && server.serverType !== "database") {
          serverIds.add(server.id);
        }
      }
    } finally {
      await scope.dispose();
    }

    const docker = getDockerInstance();
    try {
      const info = await docker.info();
      if (info.Swarm?.LocalNodeState === "active") {
        const nodes = await docker.listNodes();
        for (const node of nodes) {
          if (node.ID) serverIds.add(node.ID);
        }
      }
    } catch (error) {
      log.warn({
        message: "Unable to discover Docker nodes for deployment workers",
        err: error instanceof Error ? error.message : String(error),
      });
    }

    if (serverIds.size === 0) serverIds.add("local");
    return [...serverIds];
  }
}
