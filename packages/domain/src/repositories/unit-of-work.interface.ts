import type { IAuditLogRepository } from "./audit-log-repository.interface";
import type { IBackupRunRepository } from "./backup-run-repository.interface";
import type { IBackupScheduleRepository } from "./backup-schedule-repository.interface";
import type { IDeploymentRepository } from "./deployment-repository.interface";
import type { IDockerRegistryRepository } from "./docker-registry-repository.interface";
import type { IEnvironmentRepository } from "./environment-repository.interface";
import type { IGitProviderRepository } from "./git-provider-repository.interface";
import type { INotificationChannelRepository } from "./notification-channel-repository.interface";
import type { INotificationDeliveryRepository } from "./notification-delivery-repository.interface";
import type { IProjectRepository } from "./project-repository.interface";
import type { IResourceRepository } from "./resource-repository.interface";
import type { IS3DestinationRepository } from "./s3-destination-repository.interface";
import type { IServerBuildSettingsRepository } from "./server-build-settings-repository.interface";
import type { IServerRepository } from "./server-repository.interface";
import type { ISshKeyRepository } from "./ssh-key-repository.interface";
import type { IUserRepository } from "./user-repository.interface";
import type { IWebServerSettingsRepository } from "./web-server-settings-repository.interface";

export interface IUnitOfWork {
  readonly auditLogRepository: IAuditLogRepository;
  readonly backupScheduleRepository: IBackupScheduleRepository;
  readonly backupRunRepository: IBackupRunRepository;
  readonly userRepository: IUserRepository;
  readonly projectRepository: IProjectRepository;
  readonly environmentRepository: IEnvironmentRepository;
  readonly resourceRepository: IResourceRepository;
  readonly sshKeyRepository: ISshKeyRepository;
  readonly gitProviderRepository: IGitProviderRepository;
  readonly webServerSettingsRepository: IWebServerSettingsRepository;
  readonly s3DestinationRepository: IS3DestinationRepository;
  readonly serverBuildSettingsRepository: IServerBuildSettingsRepository;
  readonly deploymentRepository: IDeploymentRepository;
  readonly dockerRegistryRepository: IDockerRegistryRepository;
  readonly serverRepository: IServerRepository;
  readonly notificationChannelRepository: INotificationChannelRepository;
  readonly notificationDeliveryRepository: INotificationDeliveryRepository;
  transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;
}
