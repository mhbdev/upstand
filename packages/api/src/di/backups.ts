import * as dependencies from "./dependencies";

type ServiceCollection = InstanceType<typeof dependencies.ServiceCollection>;
type ServiceProviderFactory = () => ReturnType<ServiceCollection["build"]>;

export function registerBackups(
  services: ServiceCollection,
  getServiceProvider: ServiceProviderFactory,
) {
  // Backups
  services.addSingleton(
    dependencies.BackupSchedulerToken,
    () => new dependencies.BackupScheduler(() => getServiceProvider()),
  );
  services.addSingleton(
    dependencies.GeneralSchedulerToken,
    (c) =>
      new dependencies.GeneralScheduler(
        () => getServiceProvider(),
        c.resolve(dependencies.DockerServiceToken),
      ),
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
