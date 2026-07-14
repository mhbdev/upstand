import { ServiceCollection } from "@circulo-ai/di";
import { db } from "@upstand/db";
import {
  AIRepositoryToken,
  BackupRunRepositoryToken,
  BackupScheduleRepositoryToken,
  CertificateRepositoryToken,
  DbToken,
  DrizzleAIRepository,
  DrizzleBackupRunRepository,
  DrizzleBackupScheduleRepository,
  DrizzleCertificateRepository,
  DrizzleEnvironmentRepository,
  DrizzleGitProviderRepository,
  DrizzleMonitoringSettingsRepository,
  DrizzleNotificationChannelRepository,
  DrizzleNotificationDeliveryRepository,
  DrizzleProjectRepository,
  DrizzleResourceRepository,
  DrizzleS3DestinationRepository,
  DrizzleSshKeyRepository,
  DrizzleTagRepository,
  DrizzleTemplateRepository,
  DrizzleUnitOfWork,
  DrizzleUserRepository,
  DrizzleWebServerSettingsRepository,
  EnvironmentRepositoryToken,
  GitProviderRepositoryToken,
  MonitoringSettingsRepositoryToken,
  NotificationChannelRepositoryToken,
  NotificationDeliveryRepositoryToken,
  ProjectRepositoryToken,
  ResourceRepositoryToken,
  S3DestinationRepositoryToken,
  SshKeyRepositoryToken,
  TagRepositoryToken,
  TemplateRepositoryToken,
  UserRepositoryToken,
  WebServerSettingsRepositoryToken,
} from "@upstand/repositories";
import {
  AssignResourceTagUseCase,
  BackupScheduler,
  CaddyService,
  CaddyServiceToken,
  ControlContainerUseCase,
  ControlResourceUseCase,
  CreateAuditLogUseCase,
  CreateBackupScheduleUseCase,
  CreateCertificateUseCase,
  CreateDockerRegistryUseCase,
  CreateEnvironmentUseCase,
  CreateGitProviderUseCase,
  CreateNotificationChannelUseCase,
  CreateProjectUseCase,
  CreateResourceUseCase,
  CreateS3DestinationUseCase,
  CreateScheduleUseCase,
  CreateServerUseCase,
  CreateSshKeyUseCase,
  CreateTagUseCase,
  CreateTemplateUseCase,
  CreateUserUseCase,
  CreateWebServerBackupScheduleUseCase,
  DatabaseCommandUseCase,
  DeleteBackupScheduleUseCase,
  DeleteCertificateUseCase,
  DeleteDockerRegistryUseCase,
  DeleteEnvironmentUseCase,
  DeleteGitProviderUseCase,
  DeleteNotificationChannelUseCase,
  DeleteProjectUseCase,
  DeleteResourceUseCase,
  DeleteS3DestinationUseCase,
  DeleteScheduleUseCase,
  DeleteServerUseCase,
  DeleteSshKeyUseCase,
  DeleteTagUseCase,
  DeleteTemplateUseCase,
  DeliverNotificationUseCase,
  DeployResourceUseCase,
  DeployTemplateUseCase,
  DockerReadOnlyService,
  DockerService,
  DockerServiceToken,
  DuplicateProjectUseCase,
  ExecuteBackupRunUseCase,
  GeneralScheduler,
  GetAccountStatusUseCase,
  GetBackupRunsUseCase,
  GetBackupSchedulesUseCase,
  GetDeploymentsUseCase,
  GetDockerInventoryUseCase,
  GetDockerRegistriesUseCase,
  GetEnvironmentsUseCase,
  GetEnvironmentUseCase,
  GetGitProvidersUseCase,
  GetNotificationChannelsUseCase,
  GetProjectsUseCase,
  GetProjectUseCase,
  GetQueueUseCase,
  GetRequestsUseCase,
  GetResourceContainersUseCase,
  GetResourceLogsUseCase,
  GetResourcePreviewsUseCase,
  GetResourceRoutingTargetsUseCase,
  GetResourceStatsUseCase,
  GetResourcesUseCase,
  GetResourceUseCase,
  GetS3DestinationsUseCase,
  GetSchedulesUseCase,
  GetServerCountUseCase,
  GetServerHistoricalMetricsUseCase,
  GetServerRuntimeStatsUseCase,
  GetServersUseCase,
  GetServerUseCase,
  GetSshKeysUseCase,
  GetSwarmContainersUseCase,
  GetSwarmInfoUseCase,
  GetSwarmJoinCommandsUseCase,
  GetSwarmNodesUseCase,
  GetUpdateStatusUseCase,
  GetWebServerLogsUseCase,
  GetWebServerSettingsUseCase,
  GlobalSearchUseCase,
  InitSwarmUseCase,
  InspectComposeUseCase,
  ListAuditLogsUseCase,
  ListBackupVolumesUseCase,
  ListCertificatesUseCase,
  ListComposeServicesUseCase,
  ListGitBranchesUseCase,
  ListGitRepositoriesUseCase,
  ListResourceTagsUseCase,
  ListTagsUseCase,
  ListTemplatesUseCase,
  NotificationTransportRegistry,
  PublishNotificationUseCase,
  RandomizeComposeUseCase,
  RebuildDatabaseUseCase,
  ReloadWebServerUseCase,
  RemoveResourceTagUseCase,
  RemoveSwarmNodeUseCase,
  RestoreBackupRunUseCase,
  RetryNotificationDeliveryUseCase,
  RollbackResourceUseCase,
  RotateResourceWebhookTokenUseCase,
  RotateSwarmJoinTokenUseCase,
  SetupServerUseCase,
  TestDockerRegistryConnectionUseCase,
  TestNotificationChannelUseCase,
  TestS3DestinationConnectionUseCase,
  TriggerBackupRunUseCase,
  TriggerUpdateUseCase,
  UpdateBackupScheduleUseCase,
  UpdateCertificateUseCase,
  UpdateConcurrencyUseCase,
  UpdateDockerRegistryUseCase,
  UpdateGitProviderUseCase,
  UpdateNotificationChannelUseCase,
  UpdateResourceUseCase,
  UpdateS3DestinationUseCase,
  UpdateScheduleUseCase,
  UpdateServerUseCase,
  UpdateSshKeyUseCase,
  UpdateSwarmNodeUseCase,
  UpdateTagUseCase,
  UpdateTemplateUseCase,
  UpdateWebServerBackupScheduleUseCase,
  UpdateWebServerSettingsUseCase,
  ValidateDomainUseCase,
} from "@upstand/usecases";
import { GenerateSshKeyUseCase } from "@upstand/usecases/ssh-key/generate-ssh-key.usecase";
import {
  AssignResourceTagUseCaseToken,
  BackupSchedulerToken,
  ControlContainerUseCaseToken,
  ControlResourceUseCaseToken,
  CreateAuditLogUseCaseToken,
  CreateBackupScheduleUseCaseToken,
  CreateCertificateUseCaseToken,
  CreateDockerRegistryUseCaseToken,
  CreateEnvironmentUseCaseToken,
  CreateGitProviderUseCaseToken,
  CreateNotificationChannelUseCaseToken,
  CreateProjectUseCaseToken,
  CreateResourceUseCaseToken,
  CreateS3DestinationUseCaseToken,
  CreateScheduleUseCaseToken,
  CreateServerUseCaseToken,
  CreateSshKeyUseCaseToken,
  CreateTagUseCaseToken,
  CreateTemplateUseCaseToken,
  CreateUserUseCaseToken,
  CreateWebServerBackupScheduleUseCaseToken,
  DatabaseCommandUseCaseToken,
  DeleteBackupScheduleUseCaseToken,
  DeleteCertificateUseCaseToken,
  DeleteDockerRegistryUseCaseToken,
  DeleteEnvironmentUseCaseToken,
  DeleteGitProviderUseCaseToken,
  DeleteNotificationChannelUseCaseToken,
  DeleteProjectUseCaseToken,
  DeleteResourceUseCaseToken,
  DeleteS3DestinationUseCaseToken,
  DeleteScheduleUseCaseToken,
  DeleteServerUseCaseToken,
  DeleteSshKeyUseCaseToken,
  DeleteTagUseCaseToken,
  DeleteTemplateUseCaseToken,
  DeliverNotificationUseCaseToken,
  DeployResourceUseCaseToken,
  DeployTemplateUseCaseToken,
  DockerReadOnlyServiceToken,
  DuplicateProjectUseCaseToken,
  ExecuteBackupRunUseCaseToken,
  GeneralSchedulerToken,
  GenerateSshKeyUseCaseToken,
  GetAccountStatusUseCaseToken,
  GetBackupRunsUseCaseToken,
  GetBackupSchedulesUseCaseToken,
  GetDeploymentsUseCaseToken,
  GetDockerInventoryUseCaseToken,
  GetDockerRegistriesUseCaseToken,
  GetEnvironmentsUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetGitProvidersUseCaseToken,
  GetNotificationChannelsUseCaseToken,
  GetProjectsUseCaseToken,
  GetProjectUseCaseToken,
  GetQueueUseCaseToken,
  GetRequestsUseCaseToken,
  GetResourceContainersUseCaseToken,
  GetResourceLogsUseCaseToken,
  GetResourcePreviewsUseCaseToken,
  GetResourceRoutingTargetsUseCaseToken,
  GetResourceStatsUseCaseToken,
  GetResourcesUseCaseToken,
  GetResourceUseCaseToken,
  GetS3DestinationsUseCaseToken,
  GetSchedulesUseCaseToken,
  GetServerCountUseCaseToken,
  GetServerHistoricalMetricsUseCaseToken,
  GetServerRuntimeStatsUseCaseToken,
  GetServersUseCaseToken,
  GetServerUseCaseToken,
  GetSshKeysUseCaseToken,
  GetSwarmContainersUseCaseToken,
  GetSwarmInfoUseCaseToken,
  GetSwarmJoinCommandsUseCaseToken,
  GetSwarmNodesUseCaseToken,
  GetUpdateStatusUseCaseToken,
  GetWebServerLogsUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  GlobalSearchUseCaseToken,
  InitSwarmUseCaseToken,
  InspectComposeUseCaseToken,
  ListAuditLogsUseCaseToken,
  ListBackupVolumesUseCaseToken,
  ListCertificatesUseCaseToken,
  ListComposeServicesUseCaseToken,
  ListGitBranchesUseCaseToken,
  ListGitRepositoriesUseCaseToken,
  ListResourceTagsUseCaseToken,
  ListTagsUseCaseToken,
  ListTemplatesUseCaseToken,
  NotificationTransportToken,
  PublishNotificationUseCaseToken,
  RandomizeComposeUseCaseToken,
  RebuildDatabaseUseCaseToken,
  ReloadWebServerUseCaseToken,
  RemoveResourceTagUseCaseToken,
  RemoveSwarmNodeUseCaseToken,
  RestoreBackupRunUseCaseToken,
  RetryNotificationDeliveryUseCaseToken,
  RollbackResourceUseCaseToken,
  RotateResourceWebhookTokenUseCaseToken,
  RotateSwarmJoinTokenUseCaseToken,
  SetupServerUseCaseToken,
  TestDockerRegistryConnectionUseCaseToken,
  TestNotificationChannelUseCaseToken,
  TestS3DestinationConnectionUseCaseToken,
  TriggerBackupRunUseCaseToken,
  TriggerUpdateUseCaseToken,
  UnitOfWorkToken,
  UpdateBackupScheduleUseCaseToken,
  UpdateCertificateUseCaseToken,
  UpdateConcurrencyUseCaseToken,
  UpdateDockerRegistryUseCaseToken,
  UpdateGitProviderUseCaseToken,
  UpdateNotificationChannelUseCaseToken,
  UpdateResourceUseCaseToken,
  UpdateS3DestinationUseCaseToken,
  UpdateScheduleUseCaseToken,
  UpdateServerUseCaseToken,
  UpdateSshKeyUseCaseToken,
  UpdateSwarmNodeUseCaseToken,
  UpdateTagUseCaseToken,
  UpdateTemplateUseCaseToken,
  UpdateWebServerBackupScheduleUseCaseToken,
  UpdateWebServerSettingsUseCaseToken,
  ValidateDomainUseCaseToken,
} from "@upstand/usecases/tokens";

export * from "@upstand/repositories/tokens";
export * from "@upstand/usecases/tokens";
export { UnitOfWorkToken } from "@upstand/usecases/tokens";

export const services = new ServiceCollection();

// 1. Database Infrastructure
services.addSingleton(DbToken, () => db);
services.addScoped(
  AIRepositoryToken,
  (c) => new DrizzleAIRepository(c.resolve(DbToken)),
);
services.addSingleton(CaddyServiceToken, () => new CaddyService());
services.addSingleton(DockerServiceToken, () => new DockerService());
services.addSingleton(
  DockerReadOnlyServiceToken,
  () => new DockerReadOnlyService(),
);
services.addSingleton(
  NotificationTransportToken,
  () => new NotificationTransportRegistry(),
);

// 2. Repositories (scoped per request)
services.addScoped(UserRepositoryToken, (c) => {
  const executor = c.resolve(DbToken);
  return new DrizzleUserRepository(executor);
});
services.addScoped(
  ProjectRepositoryToken,
  (c) => new DrizzleProjectRepository(c.resolve(DbToken)),
);
services.addScoped(
  TagRepositoryToken,
  (c) => new DrizzleTagRepository(c.resolve(DbToken)),
);
services.addScoped(
  TemplateRepositoryToken,
  (c) => new DrizzleTemplateRepository(c.resolve(DbToken)),
);
services.addScoped(
  EnvironmentRepositoryToken,
  (c) => new DrizzleEnvironmentRepository(c.resolve(DbToken)),
);
services.addScoped(
  BackupScheduleRepositoryToken,
  (c) => new DrizzleBackupScheduleRepository(c.resolve(DbToken)),
);
services.addScoped(
  BackupRunRepositoryToken,
  (c) => new DrizzleBackupRunRepository(c.resolve(DbToken)),
);
services.addScoped(
  CertificateRepositoryToken,
  (c) => new DrizzleCertificateRepository(c.resolve(DbToken)),
);
services.addScoped(
  ResourceRepositoryToken,
  (c) => new DrizzleResourceRepository(c.resolve(DbToken)),
);
services.addScoped(
  SshKeyRepositoryToken,
  (c) => new DrizzleSshKeyRepository(c.resolve(DbToken)),
);
services.addScoped(
  GitProviderRepositoryToken,
  (c) => new DrizzleGitProviderRepository(c.resolve(DbToken)),
);
services.addScoped(
  S3DestinationRepositoryToken,
  (c) => new DrizzleS3DestinationRepository(c.resolve(DbToken)),
);
services.addScoped(
  WebServerSettingsRepositoryToken,
  (c) => new DrizzleWebServerSettingsRepository(c.resolve(DbToken)),
);
services.addScoped(
  NotificationChannelRepositoryToken,
  (c) => new DrizzleNotificationChannelRepository(c.resolve(DbToken)),
);
services.addScoped(
  NotificationDeliveryRepositoryToken,
  (c) => new DrizzleNotificationDeliveryRepository(c.resolve(DbToken)),
);
services.addScoped(
  MonitoringSettingsRepositoryToken,
  (c) => new DrizzleMonitoringSettingsRepository(c.resolve(DbToken)),
);

// 3. Unit of Work (scoped per request)
services.addScoped(UnitOfWorkToken, (c) => {
  const executor = c.resolve(DbToken);
  return new DrizzleUnitOfWork(executor);
});

services.addTransient(
  CreateAuditLogUseCaseToken,
  (c) => new CreateAuditLogUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListAuditLogsUseCaseToken,
  (c) => new ListAuditLogsUseCase(c.resolve(UnitOfWorkToken)),
);

// 4. Use Cases (transient)
services.addTransient(CreateUserUseCaseToken, (c) => {
  const uow = c.resolve(UnitOfWorkToken);
  return new CreateUserUseCase(uow);
});
services.addTransient(
  CreateProjectUseCaseToken,
  (c) => new CreateProjectUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetProjectsUseCaseToken,
  (c) => new GetProjectsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetProjectUseCaseToken,
  (c) => new GetProjectUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteProjectUseCaseToken,
  (c) => new DeleteProjectUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DuplicateProjectUseCaseToken,
  (c) => new DuplicateProjectUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListTagsUseCaseToken,
  (c) => new ListTagsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  CreateTagUseCaseToken,
  (c) => new CreateTagUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateTagUseCaseToken,
  (c) => new UpdateTagUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteTagUseCaseToken,
  (c) => new DeleteTagUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListResourceTagsUseCaseToken,
  (c) => new ListResourceTagsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  AssignResourceTagUseCaseToken,
  (c) => new AssignResourceTagUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  RemoveResourceTagUseCaseToken,
  (c) => new RemoveResourceTagUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListTemplatesUseCaseToken,
  (c) => new ListTemplatesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  CreateTemplateUseCaseToken,
  (c) => new CreateTemplateUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateTemplateUseCaseToken,
  (c) => new UpdateTemplateUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteTemplateUseCaseToken,
  (c) => new DeleteTemplateUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeployTemplateUseCaseToken,
  (c) =>
    new DeployTemplateUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CreateResourceUseCaseToken),
      c.resolve(DeployResourceUseCaseToken),
    ),
);

services.addTransient(
  CreateEnvironmentUseCaseToken,
  (c) => new CreateEnvironmentUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetEnvironmentsUseCaseToken,
  (c) => new GetEnvironmentsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetEnvironmentUseCaseToken,
  (c) => new GetEnvironmentUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteEnvironmentUseCaseToken,
  (c) => new DeleteEnvironmentUseCase(c.resolve(UnitOfWorkToken)),
);

services.addTransient(
  CreateResourceUseCaseToken,
  (c) => new CreateResourceUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetResourcesUseCaseToken,
  (c) => new GetResourcesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetResourceUseCaseToken,
  (c) => new GetResourceUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateResourceUseCaseToken,
  (c) =>
    new UpdateResourceUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CaddyServiceToken),
    ),
);
services.addTransient(
  RotateResourceWebhookTokenUseCaseToken,
  (c) => new RotateResourceWebhookTokenUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteResourceUseCaseToken,
  (c) =>
    new DeleteResourceUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CaddyServiceToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  RollbackResourceUseCaseToken,
  (c) =>
    new RollbackResourceUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  RebuildDatabaseUseCaseToken,
  (c) =>
    new RebuildDatabaseUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  DatabaseCommandUseCaseToken,
  (c) =>
    new DatabaseCommandUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  RandomizeComposeUseCaseToken,
  (c) => new RandomizeComposeUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  InspectComposeUseCaseToken,
  () => new InspectComposeUseCase(),
);
services.addTransient(
  ValidateDomainUseCaseToken,
  () => new ValidateDomainUseCase(),
);
services.addTransient(
  DeployResourceUseCaseToken,
  (c) => new DeployResourceUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ControlResourceUseCaseToken,
  (c) =>
    new ControlResourceUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  ControlContainerUseCaseToken,
  (c) =>
    new ControlContainerUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetResourceContainersUseCaseToken,
  (c) =>
    new GetResourceContainersUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetResourceLogsUseCaseToken,
  (c) =>
    new GetResourceLogsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetResourcePreviewsUseCaseToken,
  (c) => new GetResourcePreviewsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetResourceRoutingTargetsUseCaseToken,
  (c) =>
    new GetResourceRoutingTargetsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetResourceStatsUseCaseToken,
  (c) =>
    new GetResourceStatsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetServerRuntimeStatsUseCaseToken,
  (c) =>
    new GetServerRuntimeStatsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerServiceToken),
    ),
);
services.addTransient(
  GetAccountStatusUseCaseToken,
  (c) => new GetAccountStatusUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetDockerInventoryUseCaseToken,
  (c) =>
    new GetDockerInventoryUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(DockerReadOnlyServiceToken),
    ),
);

services.addTransient(
  CreateSshKeyUseCaseToken,
  (c) => new CreateSshKeyUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetSshKeysUseCaseToken,
  (c) => new GetSshKeysUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GenerateSshKeyUseCaseToken,
  (c) => new GenerateSshKeyUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteSshKeyUseCaseToken,
  (c) => new DeleteSshKeyUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateSshKeyUseCaseToken,
  (c) => new UpdateSshKeyUseCase(c.resolve(UnitOfWorkToken)),
);

services.addTransient(
  CreateGitProviderUseCaseToken,
  (c) => new CreateGitProviderUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetGitProvidersUseCaseToken,
  (c) => new GetGitProvidersUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteGitProviderUseCaseToken,
  (c) => new DeleteGitProviderUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateGitProviderUseCaseToken,
  (c) => new UpdateGitProviderUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListGitRepositoriesUseCaseToken,
  (c) => new ListGitRepositoriesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListGitBranchesUseCaseToken,
  (c) => new ListGitBranchesUseCase(c.resolve(UnitOfWorkToken)),
);

services.addTransient(
  CreateCertificateUseCaseToken,
  (c) => new CreateCertificateUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListCertificatesUseCaseToken,
  (c) => new ListCertificatesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateCertificateUseCaseToken,
  (c) => new UpdateCertificateUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteCertificateUseCaseToken,
  (c) => new DeleteCertificateUseCase(c.resolve(UnitOfWorkToken)),
);

services.addTransient(
  CreateS3DestinationUseCaseToken,
  (c) => new CreateS3DestinationUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetS3DestinationsUseCaseToken,
  (c) => new GetS3DestinationsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateS3DestinationUseCaseToken,
  (c) => new UpdateS3DestinationUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteS3DestinationUseCaseToken,
  (c) => new DeleteS3DestinationUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  TestS3DestinationConnectionUseCaseToken,
  () => new TestS3DestinationConnectionUseCase(),
);
services.addTransient(
  ListComposeServicesUseCaseToken,
  (c) =>
    new ListComposeServicesUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(InspectComposeUseCaseToken),
    ),
);

// Backups
services.addSingleton(
  BackupSchedulerToken,
  () => new BackupScheduler(() => serviceProvider),
);
services.addSingleton(
  GeneralSchedulerToken,
  (c) =>
    new GeneralScheduler(() => serviceProvider, c.resolve(DockerServiceToken)),
);
services.addTransient(
  GetSchedulesUseCaseToken,
  (c) => new GetSchedulesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  CreateScheduleUseCaseToken,
  (c) => new CreateScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateScheduleUseCaseToken,
  (c) => new UpdateScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteScheduleUseCaseToken,
  (c) => new DeleteScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  CreateBackupScheduleUseCaseToken,
  (c) => new CreateBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  CreateWebServerBackupScheduleUseCaseToken,
  (c) => new CreateWebServerBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetBackupSchedulesUseCaseToken,
  (c) => new GetBackupSchedulesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateBackupScheduleUseCaseToken,
  (c) => new UpdateBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateWebServerBackupScheduleUseCaseToken,
  (c) => new UpdateWebServerBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteBackupScheduleUseCaseToken,
  (c) => new DeleteBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetBackupRunsUseCaseToken,
  (c) => new GetBackupRunsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  TriggerBackupRunUseCaseToken,
  (c) => new TriggerBackupRunUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  RestoreBackupRunUseCaseToken,
  (c) => new RestoreBackupRunUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ExecuteBackupRunUseCaseToken,
  (c) =>
    new ExecuteBackupRunUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(PublishNotificationUseCaseToken),
    ),
);
services.addTransient(
  ListBackupVolumesUseCaseToken,
  (c) => new ListBackupVolumesUseCase(c.resolve(UnitOfWorkToken)),
);

// Caddy Web Server Use Cases
services.addTransient(
  GetWebServerSettingsUseCaseToken,
  (c) =>
    new GetWebServerSettingsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CaddyServiceToken),
    ),
);
services.addTransient(
  UpdateWebServerSettingsUseCaseToken,
  (c) =>
    new UpdateWebServerSettingsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CaddyServiceToken),
    ),
);
services.addTransient(
  GetWebServerLogsUseCaseToken,
  (c) => new GetWebServerLogsUseCase(c.resolve(CaddyServiceToken)),
);
services.addTransient(
  ReloadWebServerUseCaseToken,
  (c) => new ReloadWebServerUseCase(c.resolve(CaddyServiceToken)),
);
services.addTransient(
  GetUpdateStatusUseCaseToken,
  () => new GetUpdateStatusUseCase(),
);
services.addTransient(
  TriggerUpdateUseCaseToken,
  (c) => new TriggerUpdateUseCase(c.resolve(PublishNotificationUseCaseToken)),
);

// Swarm registrations
services.addTransient(InitSwarmUseCaseToken, () => new InitSwarmUseCase());
services.addTransient(
  GetSwarmInfoUseCaseToken,
  () => new GetSwarmInfoUseCase(),
);
services.addTransient(
  GetSwarmNodesUseCaseToken,
  () => new GetSwarmNodesUseCase(),
);
services.addTransient(
  UpdateSwarmNodeUseCaseToken,
  () => new UpdateSwarmNodeUseCase(),
);
services.addTransient(
  RemoveSwarmNodeUseCaseToken,
  () => new RemoveSwarmNodeUseCase(),
);
services.addTransient(
  GetSwarmJoinCommandsUseCaseToken,
  () => new GetSwarmJoinCommandsUseCase(),
);
services.addTransient(
  RotateSwarmJoinTokenUseCaseToken,
  () => new RotateSwarmJoinTokenUseCase(),
);

services.addTransient(
  GetDeploymentsUseCaseToken,
  (c) => new GetDeploymentsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetQueueUseCaseToken,
  (c) => new GetQueueUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetRequestsUseCaseToken,
  (c) =>
    new GetRequestsUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(GetDeploymentsUseCaseToken),
      c.resolve(GetQueueUseCaseToken),
    ),
);
services.addTransient(
  GlobalSearchUseCaseToken,
  (c) => new GlobalSearchUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateConcurrencyUseCaseToken,
  (c) => new UpdateConcurrencyUseCase(c.resolve(UnitOfWorkToken)),
);

// Docker Registry registrations
services.addTransient(
  CreateDockerRegistryUseCaseToken,
  (c) => new CreateDockerRegistryUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteDockerRegistryUseCaseToken,
  (c) => new DeleteDockerRegistryUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetDockerRegistriesUseCaseToken,
  (c) => new GetDockerRegistriesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  TestDockerRegistryConnectionUseCaseToken,
  () => new TestDockerRegistryConnectionUseCase(),
);
services.addTransient(
  UpdateDockerRegistryUseCaseToken,
  (c) => new UpdateDockerRegistryUseCase(c.resolve(UnitOfWorkToken)),
);

// Server registrations
services.addTransient(
  CreateServerUseCaseToken,
  (c) => new CreateServerUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteServerUseCaseToken,
  (c) => new DeleteServerUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetServersUseCaseToken,
  (c) => new GetServersUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  SetupServerUseCaseToken,
  (c) => new SetupServerUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetServerHistoricalMetricsUseCaseToken,
  (c) => new GetServerHistoricalMetricsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetServerCountUseCaseToken,
  (c) => new GetServerCountUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetServerUseCaseToken,
  (c) => new GetServerUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateServerUseCaseToken,
  (c) => new UpdateServerUseCase(c.resolve(UnitOfWorkToken)),
);

// Swarm Containers registration
services.addTransient(
  GetSwarmContainersUseCaseToken,
  () => new GetSwarmContainersUseCase(),
);

// Notifications
services.addTransient(
  CreateNotificationChannelUseCaseToken,
  (c) => new CreateNotificationChannelUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  GetNotificationChannelsUseCaseToken,
  (c) => new GetNotificationChannelsUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  UpdateNotificationChannelUseCaseToken,
  (c) => new UpdateNotificationChannelUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeleteNotificationChannelUseCaseToken,
  (c) => new DeleteNotificationChannelUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  TestNotificationChannelUseCaseToken,
  (c) =>
    new TestNotificationChannelUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(NotificationTransportToken),
    ),
);
services.addTransient(
  PublishNotificationUseCaseToken,
  (c) => new PublishNotificationUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  DeliverNotificationUseCaseToken,
  (c) =>
    new DeliverNotificationUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(NotificationTransportToken),
    ),
);
services.addTransient(
  RetryNotificationDeliveryUseCaseToken,
  (c) => new RetryNotificationDeliveryUseCase(c.resolve(UnitOfWorkToken)),
);

export const serviceProvider = services.build();
export type ServiceProvider = typeof serviceProvider;
