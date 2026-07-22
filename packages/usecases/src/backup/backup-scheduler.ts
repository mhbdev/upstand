import { Cron } from "croner";
import { log } from "evlog";

interface ScheduledBackup {
  cron: Cron;
  signature: string;
}

export interface BackupSchedulerDependencies {
  loadSchedules: () => Promise<
    Array<{
      id: string;
      cronExpression: string;
      timezone: string;
    }>
  >;
  trigger: (scheduleId: string) => Promise<{ id: string } | null>;
}

export class BackupScheduler {
  private readonly jobs = new Map<string, ScheduledBackup>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly dependencies: BackupSchedulerDependencies) {}

  async start(): Promise<void> {
    if (this.refreshTimer) return;
    await this.refresh();
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) => {
          log.error({
            message: "Failed to refresh backup schedules",
            err: error,
          });
        }),
      60_000,
    );
    this.refreshTimer.unref?.();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async stop(): Promise<void> {
    this.ready = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const job of this.jobs.values()) job.cron.stop();
    this.jobs.clear();
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
    const schedules = await this.dependencies.loadSchedules();
    const activeIds = new Set(schedules.map((schedule) => schedule.id));
    for (const [id, job] of this.jobs) {
      if (!activeIds.has(id)) {
        job.cron.stop();
        this.jobs.delete(id);
      }
    }

    for (const schedule of schedules) {
      const signature = `${schedule.cronExpression}\0${schedule.timezone}`;
      const existing = this.jobs.get(schedule.id);
      if (existing?.signature === signature) continue;
      existing?.cron.stop();

      try {
        const cron = new Cron(
          schedule.cronExpression,
          {
            timezone: schedule.timezone,
            mode: "5-part",
            protect: true,
          },
          () => void this.trigger(schedule.id),
        );
        this.jobs.set(schedule.id, { cron, signature });
      } catch (error) {
        log.error({
          message: "Ignoring invalid persisted backup schedule",
          scheduleId: schedule.id,
          err: error,
        });
      }
    }
  }

  private async trigger(scheduleId: string): Promise<void> {
    try {
      const run = await this.dependencies.trigger(scheduleId);
      if (run) {
        log.info({
          message: "Scheduled backup queued",
          scheduleId,
          runId: run.id,
        });
      }
    } catch (error) {
      log.error({
        message: "Failed to queue scheduled backup",
        scheduleId,
        err: error,
      });
    }
  }
}
