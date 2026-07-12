import { createToken } from "@circulo-ai/di";
import type { IBackupRunRepository } from "./repositories/backup-run-repository.interface";
import type { IBackupScheduleRepository } from "./repositories/backup-schedule-repository.interface";
import type { IEnvironmentRepository } from "./repositories/environment-repository.interface";
import type { IGitProviderRepository } from "./repositories/git-provider-repository.interface";
import type { INotificationChannelRepository } from "./repositories/notification-channel-repository.interface";
import type { INotificationDeliveryRepository } from "./repositories/notification-delivery-repository.interface";
import type { IProjectRepository } from "./repositories/project-repository.interface";
import type { IResourceRepository } from "./repositories/resource-repository.interface";
import type { IS3DestinationRepository } from "./repositories/s3-destination-repository.interface";
import type { ISshKeyRepository } from "./repositories/ssh-key-repository.interface";
import type { IUnitOfWork } from "./repositories/unit-of-work.interface";
import type { IAIRepository } from "./ai";
import type { IUserRepository } from "./repositories/user-repository.interface";
import type { IWebServerSettingsRepository } from "./repositories/web-server-settings-repository.interface";

export const UserRepositoryToken =
  createToken<IUserRepository>("IUserRepository");
export const BackupScheduleRepositoryToken =
  createToken<IBackupScheduleRepository>("IBackupScheduleRepository");
export const BackupRunRepositoryToken = createToken<IBackupRunRepository>(
  "IBackupRunRepository",
);
export const UnitOfWorkToken = createToken<IUnitOfWork>("IUnitOfWork");
export const AIRepositoryToken = createToken<IAIRepository>("IAIRepository");
export const ProjectRepositoryToken =
  createToken<IProjectRepository>("IProjectRepository");
export const EnvironmentRepositoryToken = createToken<IEnvironmentRepository>(
  "IEnvironmentRepository",
);
export const ResourceRepositoryToken = createToken<IResourceRepository>(
  "IResourceRepository",
);
export const SshKeyRepositoryToken =
  createToken<ISshKeyRepository>("ISshKeyRepository");
export const GitProviderRepositoryToken = createToken<IGitProviderRepository>(
  "IGitProviderRepository",
);
export const WebServerSettingsRepositoryToken =
  createToken<IWebServerSettingsRepository>("IWebServerSettingsRepository");
export const S3DestinationRepositoryToken =
  createToken<IS3DestinationRepository>("IS3DestinationRepository");
export const NotificationChannelRepositoryToken =
  createToken<INotificationChannelRepository>("INotificationChannelRepository");
export const NotificationDeliveryRepositoryToken =
  createToken<INotificationDeliveryRepository>(
    "INotificationDeliveryRepository",
  );
