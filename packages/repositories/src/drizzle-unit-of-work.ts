import type { IUnitOfWork } from "@upstand/domain";
import { DrizzleAuditLogRepository } from "./audit-log/drizzle-audit-log.repository";
import { DrizzleBackupRunRepository } from "./backup/drizzle-backup-run.repository";
import { DrizzleBackupScheduleRepository } from "./backup/drizzle-backup-schedule.repository";
import { DrizzleDeploymentRepository } from "./deployment/drizzle-deployment.repository";
import { DrizzleDockerRegistryRepository } from "./docker-registry/drizzle-docker-registry.repository";
import { DrizzleEnvironmentRepository } from "./environment/drizzle-environment.repository";
import { DrizzleGitProviderRepository } from "./git-provider/drizzle-git-provider.repository";
import { DrizzleNotificationChannelRepository } from "./notification/drizzle-notification-channel.repository";
import { DrizzleNotificationDeliveryRepository } from "./notification/drizzle-notification-delivery.repository";
import { DrizzleProjectRepository } from "./project/drizzle-project.repository";
import { DrizzleResourceRepository } from "./resource/drizzle-resource.repository";
import { DrizzleS3DestinationRepository } from "./s3-destination/drizzle-s3-destination.repository";
import { DrizzleServerRepository } from "./server/drizzle-server.repository";
import { DrizzleServerBuildSettingsRepository } from "./server-build-settings/drizzle-server-build-settings.repository";
import type { Executor } from "./shared/types";
import { DrizzleSshKeyRepository } from "./ssh-key/drizzle-ssh-key.repository";
import { DrizzleUserRepository } from "./user/drizzle-user.repository";
import { DrizzleWebServerSettingsRepository } from "./web-server/drizzle-web-server-settings.repository";

export class DrizzleUnitOfWork implements IUnitOfWork {
  public readonly auditLogRepository: DrizzleAuditLogRepository;
  public readonly backupScheduleRepository: DrizzleBackupScheduleRepository;
  public readonly backupRunRepository: DrizzleBackupRunRepository;
  public readonly userRepository: DrizzleUserRepository;
  public readonly projectRepository: DrizzleProjectRepository;
  public readonly environmentRepository: DrizzleEnvironmentRepository;
  public readonly resourceRepository: DrizzleResourceRepository;
  public readonly sshKeyRepository: DrizzleSshKeyRepository;
  public readonly gitProviderRepository: DrizzleGitProviderRepository;
  public readonly webServerSettingsRepository: DrizzleWebServerSettingsRepository;
  public readonly s3DestinationRepository: DrizzleS3DestinationRepository;
  public readonly serverBuildSettingsRepository: DrizzleServerBuildSettingsRepository;
  public readonly deploymentRepository: DrizzleDeploymentRepository;
  public readonly dockerRegistryRepository: DrizzleDockerRegistryRepository;
  public readonly serverRepository: DrizzleServerRepository;
  public readonly notificationChannelRepository: DrizzleNotificationChannelRepository;
  public readonly notificationDeliveryRepository: DrizzleNotificationDeliveryRepository;

  constructor(private readonly executor: Executor) {
    this.auditLogRepository = new DrizzleAuditLogRepository(this.executor);
    this.backupScheduleRepository = new DrizzleBackupScheduleRepository(
      this.executor,
    );
    this.backupRunRepository = new DrizzleBackupRunRepository(this.executor);
    this.userRepository = new DrizzleUserRepository(this.executor);
    this.projectRepository = new DrizzleProjectRepository(this.executor);
    this.environmentRepository = new DrizzleEnvironmentRepository(
      this.executor,
    );
    this.resourceRepository = new DrizzleResourceRepository(this.executor);
    this.sshKeyRepository = new DrizzleSshKeyRepository(this.executor);
    this.gitProviderRepository = new DrizzleGitProviderRepository(
      this.executor,
    );
    this.webServerSettingsRepository = new DrizzleWebServerSettingsRepository(
      this.executor,
    );
    this.s3DestinationRepository = new DrizzleS3DestinationRepository(
      this.executor,
    );
    this.serverBuildSettingsRepository =
      new DrizzleServerBuildSettingsRepository(this.executor);
    this.deploymentRepository = new DrizzleDeploymentRepository(this.executor);
    this.dockerRegistryRepository = new DrizzleDockerRegistryRepository(
      this.executor,
    );
    this.serverRepository = new DrizzleServerRepository(this.executor);
    this.notificationChannelRepository =
      new DrizzleNotificationChannelRepository(this.executor);
    this.notificationDeliveryRepository =
      new DrizzleNotificationDeliveryRepository(this.executor);
  }

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return this.executor.transaction(async (tx) => {
      const txUow = new DrizzleUnitOfWork(tx);
      return work(txUow);
    });
  }
}
