import type { IUnitOfWork } from "@upstand/domain";
import { Cron } from "croner";
import { log } from "evlog";
import { CaddyServiceToken, UnitOfWorkToken } from "../tokens";

interface ScheduledCleanup {
  cron: Cron;
  signature: string;
}

interface ScopedServiceProvider {
  createScope(): {
    resolve<T>(token: unknown): T;
    dispose(): Promise<void>;
  };
}

export class AccessLogCleanupScheduler {
  private job: ScheduledCleanup | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly getServiceProvider: () => ScopedServiceProvider,
  ) {}

  async start(): Promise<void> {
    if (this.refreshTimer) return;
    await this.refresh();
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) => {
          log.error({
            message: "Failed to refresh Caddy access-log cleanup schedule",
            err: error instanceof Error ? error.message : String(error),
          });
        }),
      60_000,
    );
    this.refreshTimer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.job?.cron.stop();
    this.job = null;
    if (this.refreshInFlight) await this.refreshInFlight;
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.performRefresh();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async performRefresh(): Promise<void> {
    const scope = this.getServiceProvider().createScope();
    let enabled = false;
    let cronExpression = "0 3 * * *";
    try {
      const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
      const settings = await uow.webServerSettingsRepository.findGlobal();
      enabled = settings?.accessLogsEnabled ?? false;
      cronExpression = settings?.accessLogCleanupCron ?? cronExpression;
    } finally {
      await scope.dispose();
    }

    const signature = enabled ? cronExpression : "disabled";
    if (this.job?.signature === signature) return;
    this.job?.cron.stop();
    this.job = null;
    if (!enabled) return;

    try {
      const cron = new Cron(
        cronExpression,
        { protect: true },
        () => void this.runCleanup(),
      );
      this.job = { cron, signature };
    } catch (error) {
      log.error({
        message: "Ignoring invalid Caddy access-log cleanup schedule",
        cronExpression,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runCleanup(): Promise<void> {
    const scope = this.getServiceProvider().createScope();
    try {
      const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
      const settings = await uow.webServerSettingsRepository.findGlobal();
      if (!settings?.accessLogsEnabled) return;
      await scope
        .resolve<{ cleanupAccessLogs(): Promise<void> }>(CaddyServiceToken)
        .cleanupAccessLogs();
      log.info({ message: "Caddy access-log cleanup completed" });
    } catch (error) {
      log.error({
        message: "Caddy access-log cleanup failed",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await scope.dispose();
    }
  }
}
