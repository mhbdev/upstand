import type { IUnitOfWork } from "@upstand/domain";
import { Cron } from "croner";
import { log } from "evlog";
import { TriggerBackupRunUseCase } from "../backup/trigger-backup-run.usecase";
import { QueueDeploymentUseCase } from "../deployment/queue-deployment.usecase";
import type { DockerService } from "../resource/docker.service";
import { resolveDockerServiceForServer } from "../resource/docker-client";
import { UnitOfWorkToken } from "../tokens";

interface ScheduledJob {
  cron: Cron;
  signature: string;
}

interface ScopedServiceProvider {
  createScope(): {
    resolve<T>(token: unknown): T;
    dispose(): Promise<void>;
  };
}

export class GeneralScheduler {
  private readonly jobs = new Map<string, ScheduledJob>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly getServiceProvider: () => ScopedServiceProvider,
    private readonly dockerService: DockerService,
  ) {}

  async start(): Promise<void> {
    if (this.refreshTimer) return;
    await this.refresh();
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch((error) => {
          log.error({
            message: "Failed to refresh custom schedules",
            err: error instanceof Error ? error.message : String(error),
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
    const scope = this.getServiceProvider().createScope();
    let schedules: any[] = [];
    try {
      const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
      schedules = await uow.scheduleRepository.findEnabled();
    } finally {
      await scope.dispose();
    }

    const activeIds = new Set(schedules.map((schedule) => schedule.id));
    for (const [id, job] of this.jobs) {
      if (!activeIds.has(id)) {
        job.cron.stop();
        this.jobs.delete(id);
      }
    }

    for (const schedule of schedules) {
      const signature = `${schedule.cronExpression}\0${schedule.jobType ?? "command"}\0${schedule.backupScheduleId ?? ""}\0${schedule.command}`;
      const existing = this.jobs.get(schedule.id);
      if (existing?.signature === signature) continue;
      existing?.cron.stop();

      try {
        const cron = new Cron(
          schedule.cronExpression,
          {
            protect: true,
          },
          () => void this.trigger(schedule.id),
        );
        this.jobs.set(schedule.id, { cron, signature });
      } catch (error) {
        log.error({
          message: "Ignoring invalid persisted custom schedule",
          scheduleId: schedule.id,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async trigger(scheduleId: string, manual = false): Promise<void> {
    const scope = this.getServiceProvider().createScope();
    try {
      const uow = scope.resolve<IUnitOfWork>(UnitOfWorkToken);
      const schedule = await uow.scheduleRepository.findById(scheduleId);
      if ((!schedule?.enabled && !manual) || !schedule?.resourceId) return;

      const resource = await uow.resourceRepository.findById(
        schedule.resourceId,
      );
      if (!resource) return;

      const jobType = schedule.jobType ?? "command";
      if (jobType === "deployment") {
        await new QueueDeploymentUseCase(uow).execute({
          resourceId: resource.id,
          title: `Scheduled deployment: ${schedule.name}`,
        });
        log.info({
          message: `Scheduled deployment queued for resource ${resource.name}.`,
          scheduleId,
        });
        return;
      }
      if (jobType === "backup") {
        if (!schedule.backupScheduleId) {
          log.warn({
            message: "Skipping backup schedule without a backup schedule ID",
            scheduleId,
          });
          return;
        }
        await new TriggerBackupRunUseCase(uow).execute({
          scheduleId: schedule.backupScheduleId,
        });
        log.info({
          message: `Scheduled backup queued for resource ${resource.name}.`,
          scheduleId,
          backupScheduleId: schedule.backupScheduleId,
        });
        return;
      }

      log.info({
        message: `Executing custom scheduled command inside resource ${resource.name}...`,
        command: schedule.command,
      });

      const { dockerService, cleanup } = await resolveDockerServiceForServer(
        resource.serverId,
        uow,
        this.dockerService,
      );

      try {
        const output = await dockerService.runCommandInResourceContainer(
          resource,
          schedule.command,
        );
        log.info({
          message: `Custom scheduled command finished successfully inside resource ${resource.name}.`,
          output: output.slice(0, 1000),
        });
      } finally {
        cleanup();
      }
    } catch (error) {
      log.error({
        message: "Failed to execute custom scheduled command",
        scheduleId,
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await scope.dispose();
    }
  }
}
