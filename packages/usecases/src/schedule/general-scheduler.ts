import { Cron } from "croner";
import { log } from "evlog";

interface ScheduledJob {
  cron: Cron;
  signature: string;
}

export interface GeneralSchedulerDependencies {
  loadSchedules: () => Promise<
    Array<{
      id: string;
      cronExpression: string;
      timezone?: string | null;
      jobType?: string | null;
      serviceName?: string | null;
      shellType?: string | null;
      backupScheduleId?: string | null;
      command: string;
    }>
  >;
  execute: (scheduleId: string, manual: boolean) => Promise<void>;
}

export class GeneralScheduler {
  private readonly jobs = new Map<string, ScheduledJob>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly dependencies: GeneralSchedulerDependencies) {}

  async start(): Promise<void> {
    if (this.refreshTimer) return;
    await this.refresh();
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) => {
          log.error({
            message: "Failed to refresh custom schedules",
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

  /** Execute a persisted schedule immediately, even when it is disabled. */
  async executeNow(scheduleId: string): Promise<void> {
    await this.trigger(scheduleId, true);
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
      const timezone = schedule.timezone || "UTC";
      const signature = `${schedule.cronExpression}\0${timezone}\0${schedule.jobType ?? "command"}\0${schedule.serviceName ?? ""}\0${schedule.shellType ?? "bash"}\0${schedule.backupScheduleId ?? ""}\0${schedule.command}`;
      const existing = this.jobs.get(schedule.id);
      if (existing?.signature === signature) continue;
      existing?.cron.stop();

      try {
        const cron = new Cron(
          schedule.cronExpression,
          { timezone, protect: true },
          () => void this.trigger(schedule.id),
        );
        this.jobs.set(schedule.id, { cron, signature });
      } catch (error) {
        log.error({
          message: "Ignoring invalid persisted custom schedule",
          scheduleId: schedule.id,
          err: error,
        });
      }
    }
  }

  private async trigger(scheduleId: string, manual = false): Promise<void> {
    try {
      await this.dependencies.execute(scheduleId, manual);
    } catch (error) {
      log.error({
        message: "Failed to execute scheduled job",
        scheduleId,
        err: error,
      });
    }
  }
}
