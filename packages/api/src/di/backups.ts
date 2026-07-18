import { TriggerBackupRunUseCase } from "@upstand/usecases/backup/trigger-backup-run.usecase";
import { QueueDeploymentUseCase } from "@upstand/usecases/deployment/queue-deployment.usecase";
import { resolveDockerServiceForServer } from "@upstand/usecases/resource/docker-client";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import * as dependencies from "./dependencies";

type ServiceCollection = InstanceType<typeof dependencies.ServiceCollection>;
type ServiceProviderFactory = () => ReturnType<ServiceCollection["build"]>;

export function registerBackups(
  services: ServiceCollection,
  getServiceProvider: ServiceProviderFactory,
) {
  const withScope = async <T>(operation: (uow: any) => Promise<T>) => {
    const scope = getServiceProvider().createScope();
    try {
      return await operation(scope.resolve(UnitOfWorkToken));
    } finally {
      await scope.dispose();
    }
  };

  // Backups
  services.addSingleton(
    dependencies.BackupSchedulerToken,
    () =>
      new dependencies.BackupScheduler({
        loadSchedules: () =>
          withScope((uow) => uow.backupScheduleRepository.findEnabled()),
        trigger: (scheduleId) =>
          withScope((uow) =>
            new TriggerBackupRunUseCase(uow).execute({ scheduleId }),
          ),
      }),
  );
  services.addSingleton(
    dependencies.GeneralSchedulerToken,
    (c) =>
      new dependencies.GeneralScheduler({
        loadSchedules: () =>
          withScope((uow) => uow.scheduleRepository.findEnabled()),
        execute: (scheduleId, manual) =>
          withScope(async (uow) => {
            const schedule = await uow.scheduleRepository.findById(scheduleId);
            if ((!schedule?.enabled && !manual) || !schedule?.resourceId)
              return;

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
              return;
            }
            if (jobType === "backup") {
              if (!schedule.backupScheduleId) return;
              await new TriggerBackupRunUseCase(uow).execute({
                scheduleId: schedule.backupScheduleId,
              });
              return;
            }

            const { dockerService, cleanup } =
              await resolveDockerServiceForServer(
                resource.serverId,
                uow,
                c.resolve(dependencies.DockerServiceToken),
              );
            try {
              await dockerService.runCommandInResourceContainer(
                resource,
                schedule.command,
              );
            } finally {
              cleanup();
            }
          }),
      }),
  );
  services.addTransient(
    dependencies.GetSchedulesUseCaseToken,
    (c) =>
      new dependencies.GetSchedulesUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.CreateScheduleUseCaseToken,
    (c) =>
      new dependencies.CreateScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.UpdateScheduleUseCaseToken,
    (c) =>
      new dependencies.UpdateScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.DeleteScheduleUseCaseToken,
    (c) =>
      new dependencies.DeleteScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.CreateBackupScheduleUseCaseToken,
    (c) =>
      new dependencies.CreateBackupScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.CreateWebServerBackupScheduleUseCaseToken,
    (c) =>
      new dependencies.CreateWebServerBackupScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.GetBackupSchedulesUseCaseToken,
    (c) =>
      new dependencies.GetBackupSchedulesUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.UpdateBackupScheduleUseCaseToken,
    (c) =>
      new dependencies.UpdateBackupScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.UpdateWebServerBackupScheduleUseCaseToken,
    (c) =>
      new dependencies.UpdateWebServerBackupScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.DeleteBackupScheduleUseCaseToken,
    (c) =>
      new dependencies.DeleteBackupScheduleUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.GetBackupRunsUseCaseToken,
    (c) =>
      new dependencies.GetBackupRunsUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.TriggerBackupRunUseCaseToken,
    (c) =>
      new dependencies.TriggerBackupRunUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.RestoreBackupRunUseCaseToken,
    (c) =>
      new dependencies.RestoreBackupRunUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
  services.addTransient(
    dependencies.ExecuteBackupRunUseCaseToken,
    (c) =>
      new dependencies.ExecuteBackupRunUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
        c.resolve(dependencies.PublishNotificationUseCaseToken),
      ),
  );
  services.addTransient(
    dependencies.ListBackupVolumesUseCaseToken,
    (c) =>
      new dependencies.ListBackupVolumesUseCase(
        c.resolve(dependencies.UnitOfWorkToken),
      ),
  );
}
