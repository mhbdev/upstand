import { createToken, ServiceCollection } from "@circulo-ai/di";
import { type DatabaseExecutor, db } from "@upstand/db";
import {
  BackupRunRepositoryToken,
  AIRepositoryToken,
  BackupScheduleRepositoryToken,
  EnvironmentRepositoryToken,
  GitProviderRepositoryToken,
  NotificationChannelRepositoryToken,
  NotificationDeliveryRepositoryToken,
  ProjectRepositoryToken,
  ResourceRepositoryToken,
  S3DestinationRepositoryToken,
  SshKeyRepositoryToken,
  UnitOfWorkToken,
  UserRepositoryToken,
  WebServerSettingsRepositoryToken,
} from "@upstand/domain";
import {
  DrizzleBackupRunRepository,
  DrizzleAIRepository,
  DrizzleBackupScheduleRepository,
  DrizzleEnvironmentRepository,
  DrizzleGitProviderRepository,
  DrizzleNotificationChannelRepository,
  DrizzleNotificationDeliveryRepository,
  DrizzleProjectRepository,
  DrizzleResourceRepository,
  DrizzleS3DestinationRepository,
  DrizzleSshKeyRepository,
  DrizzleUnitOfWork,
  DrizzleUserRepository,
  DrizzleWebServerSettingsRepository,
} from "@upstand/repositories";
import {
  BackupScheduler,
  CaddyService,
  CaddyServiceToken,
  ControlResourceUseCase,
  CreateBackupScheduleUseCase,
  CreateDockerRegistryUseCase,
  CreateEnvironmentUseCase,
  CreateGitProviderUseCase,
  CreateNotificationChannelUseCase,
  CreateProjectUseCase,
  CreateResourceUseCase,
  CreateS3DestinationUseCase,
  CreateServerUseCase,
  CreateSshKeyUseCase,
  CreateUserUseCase,
  DeleteBackupScheduleUseCase,
  DeleteDockerRegistryUseCase,
  DeleteEnvironmentUseCase,
  DeleteGitProviderUseCase,
  DeleteNotificationChannelUseCase,
  DeleteProjectUseCase,
  DeleteResourceUseCase,
  DeleteS3DestinationUseCase,
  DeleteServerUseCase,
  DeleteSshKeyUseCase,
  DeliverNotificationUseCase,
  DeployResourceUseCase,
  DockerService,
  DockerServiceToken,
  ExecuteBackupRunUseCase,
  GetBackupRunsUseCase,
  GetBackupSchedulesUseCase,
  GetDeploymentsUseCase,
  GetDockerRegistriesUseCase,
  GetEnvironmentsUseCase,
  GetEnvironmentUseCase,
  GetGitProvidersUseCase,
  GetNotificationChannelsUseCase,
  GetProjectsUseCase,
  GetProjectUseCase,
  GetQueueUseCase,
  GetResourceContainersUseCase,
  GetResourceLogsUseCase,
  GetResourceRoutingTargetsUseCase,
  GetResourceStatsUseCase,
  GetResourcesUseCase,
  GetResourceUseCase,
  GetS3DestinationsUseCase,
  GetServerRuntimeStatsUseCase,
  GetServersUseCase,
  GetSshKeysUseCase,
  GetSwarmContainersUseCase,
  GetSwarmInfoUseCase,
  GetSwarmJoinCommandsUseCase,
  GetSwarmNodesUseCase,
  GetUpdateStatusUseCase,
  GetWebServerLogsUseCase,
  GetWebServerSettingsUseCase,
  InitSwarmUseCase,
  ListBackupVolumesUseCase,
  ListGitBranchesUseCase,
  ListGitRepositoriesUseCase,
  NotificationTransportRegistry,
  PublishNotificationUseCase,
  PublishNotificationUseCaseToken,
  ReloadWebServerUseCase,
  RemoveSwarmNodeUseCase,
  RestoreBackupRunUseCase,
  RotateSwarmJoinTokenUseCase,
  SetupServerUseCase,
  TestDockerRegistryConnectionUseCase,
  TestNotificationChannelUseCase,
  TestS3DestinationConnectionUseCase,
  TriggerBackupRunUseCase,
  TriggerUpdateUseCase,
  UpdateBackupScheduleUseCase,
  UpdateConcurrencyUseCase,
  UpdateNotificationChannelUseCase,
  UpdateResourceUseCase,
  UpdateS3DestinationUseCase,
  UpdateSwarmNodeUseCase,
  UpdateWebServerSettingsUseCase,
} from "@upstand/usecases";
import { GenerateSshKeyUseCase } from "@upstand/usecases/ssh-key/generate-ssh-key.usecase";

export const DbToken = createToken<DatabaseExecutor>("DatabaseExecutor");
export const NotificationTransportToken =
  createToken<NotificationTransportRegistry>("NotificationTransport");

// Use Case Tokens
export const CreateUserUseCaseToken =
  createToken<CreateUserUseCase>("CreateUserUseCase");
export const CreateProjectUseCaseToken = createToken<CreateProjectUseCase>(
  "CreateProjectUseCase",
);
export const GetProjectsUseCaseToken =
  createToken<GetProjectsUseCase>("GetProjectsUseCase");
export const GetProjectUseCaseToken =
  createToken<GetProjectUseCase>("GetProjectUseCase");
export const DeleteProjectUseCaseToken = createToken<DeleteProjectUseCase>(
  "DeleteProjectUseCase",
);

export const CreateEnvironmentUseCaseToken =
  createToken<CreateEnvironmentUseCase>("CreateEnvironmentUseCase");
export const GetEnvironmentsUseCaseToken = createToken<GetEnvironmentsUseCase>(
  "GetEnvironmentsUseCase",
);
export const GetEnvironmentUseCaseToken = createToken<GetEnvironmentUseCase>(
  "GetEnvironmentUseCase",
);
export const DeleteEnvironmentUseCaseToken =
  createToken<DeleteEnvironmentUseCase>("DeleteEnvironmentUseCase");

export const CreateResourceUseCaseToken = createToken<CreateResourceUseCase>(
  "CreateResourceUseCase",
);
export const GetResourcesUseCaseToken = createToken<GetResourcesUseCase>(
  "GetResourcesUseCase",
);
export const GetResourceUseCaseToken =
  createToken<GetResourceUseCase>("GetResourceUseCase");
export const UpdateResourceUseCaseToken = createToken<UpdateResourceUseCase>(
  "UpdateResourceUseCase",
);
export const DeleteResourceUseCaseToken = createToken<DeleteResourceUseCase>(
  "DeleteResourceUseCase",
);
export const DeployResourceUseCaseToken = createToken<DeployResourceUseCase>(
  "DeployResourceUseCase",
);
export const ControlResourceUseCaseToken = createToken<ControlResourceUseCase>(
  "ControlResourceUseCase",
);
export const GetResourceContainersUseCaseToken =
  createToken<GetResourceContainersUseCase>("GetResourceContainersUseCase");
export const GetResourceLogsUseCaseToken = createToken<GetResourceLogsUseCase>(
  "GetResourceLogsUseCase",
);
export const GetResourceRoutingTargetsUseCaseToken =
  createToken<GetResourceRoutingTargetsUseCase>(
    "GetResourceRoutingTargetsUseCase",
  );
export const GetResourceStatsUseCaseToken =
  createToken<GetResourceStatsUseCase>("GetResourceStatsUseCase");
export const GetServerRuntimeStatsUseCaseToken =
  createToken<GetServerRuntimeStatsUseCase>("GetServerRuntimeStatsUseCase");

export const CreateSshKeyUseCaseToken = createToken<CreateSshKeyUseCase>(
  "CreateSshKeyUseCase",
);
export const GetSshKeysUseCaseToken =
  createToken<GetSshKeysUseCase>("GetSshKeysUseCase");
export const DeleteSshKeyUseCaseToken = createToken<DeleteSshKeyUseCase>(
  "DeleteSshKeyUseCase",
);
export const GenerateSshKeyUseCaseToken = createToken<GenerateSshKeyUseCase>(
  "GenerateSshKeyUseCase",
);

export const CreateGitProviderUseCaseToken =
  createToken<CreateGitProviderUseCase>("CreateGitProviderUseCase");
export const GetGitProvidersUseCaseToken = createToken<GetGitProvidersUseCase>(
  "GetGitProvidersUseCase",
);
export const DeleteGitProviderUseCaseToken =
  createToken<DeleteGitProviderUseCase>("DeleteGitProviderUseCase");
export const ListGitRepositoriesUseCaseToken =
  createToken<ListGitRepositoriesUseCase>("ListGitRepositoriesUseCase");
export const ListGitBranchesUseCaseToken = createToken<ListGitBranchesUseCase>(
  "ListGitBranchesUseCase",
);

export const CreateS3DestinationUseCaseToken =
  createToken<CreateS3DestinationUseCase>("CreateS3DestinationUseCase");
export const GetS3DestinationsUseCaseToken =
  createToken<GetS3DestinationsUseCase>("GetS3DestinationsUseCase");
export const UpdateS3DestinationUseCaseToken =
  createToken<UpdateS3DestinationUseCase>("UpdateS3DestinationUseCase");
export const DeleteS3DestinationUseCaseToken =
  createToken<DeleteS3DestinationUseCase>("DeleteS3DestinationUseCase");
export const TestS3DestinationConnectionUseCaseToken =
  createToken<TestS3DestinationConnectionUseCase>(
    "TestS3DestinationConnectionUseCase",
  );

export const BackupSchedulerToken =
  createToken<BackupScheduler>("BackupScheduler");
export const CreateBackupScheduleUseCaseToken =
  createToken<CreateBackupScheduleUseCase>("CreateBackupScheduleUseCase");
export const GetBackupSchedulesUseCaseToken =
  createToken<GetBackupSchedulesUseCase>("GetBackupSchedulesUseCase");
export const UpdateBackupScheduleUseCaseToken =
  createToken<UpdateBackupScheduleUseCase>("UpdateBackupScheduleUseCase");
export const DeleteBackupScheduleUseCaseToken =
  createToken<DeleteBackupScheduleUseCase>("DeleteBackupScheduleUseCase");
export const GetBackupRunsUseCaseToken = createToken<GetBackupRunsUseCase>(
  "GetBackupRunsUseCase",
);
export const TriggerBackupRunUseCaseToken =
  createToken<TriggerBackupRunUseCase>("TriggerBackupRunUseCase");
export const RestoreBackupRunUseCaseToken =
  createToken<RestoreBackupRunUseCase>("RestoreBackupRunUseCase");
export const ExecuteBackupRunUseCaseToken =
  createToken<ExecuteBackupRunUseCase>("ExecuteBackupRunUseCase");
export const ListBackupVolumesUseCaseToken =
  createToken<ListBackupVolumesUseCase>("ListBackupVolumesUseCase");

// Caddy Web Server Tokens
export const GetWebServerSettingsUseCaseToken =
  createToken<GetWebServerSettingsUseCase>("GetWebServerSettingsUseCase");
export const UpdateWebServerSettingsUseCaseToken =
  createToken<UpdateWebServerSettingsUseCase>("UpdateWebServerSettingsUseCase");
export const GetWebServerLogsUseCaseToken =
  createToken<GetWebServerLogsUseCase>("GetWebServerLogsUseCase");
export const ReloadWebServerUseCaseToken = createToken<ReloadWebServerUseCase>(
  "ReloadWebServerUseCase",
);
export const GetUpdateStatusUseCaseToken = createToken<GetUpdateStatusUseCase>(
  "GetUpdateStatusUseCase",
);
export const TriggerUpdateUseCaseToken = createToken<TriggerUpdateUseCase>(
  "TriggerUpdateUseCase",
);

// Swarm Use Case Tokens
export const InitSwarmUseCaseToken =
  createToken<InitSwarmUseCase>("InitSwarmUseCase");
export const GetSwarmInfoUseCaseToken = createToken<GetSwarmInfoUseCase>(
  "GetSwarmInfoUseCase",
);
export const GetSwarmNodesUseCaseToken = createToken<GetSwarmNodesUseCase>(
  "GetSwarmNodesUseCase",
);
export const UpdateSwarmNodeUseCaseToken = createToken<UpdateSwarmNodeUseCase>(
  "UpdateSwarmNodeUseCase",
);
export const RemoveSwarmNodeUseCaseToken = createToken<RemoveSwarmNodeUseCase>(
  "RemoveSwarmNodeUseCase",
);
export const GetSwarmJoinCommandsUseCaseToken =
  createToken<GetSwarmJoinCommandsUseCase>("GetSwarmJoinCommandsUseCase");
export const RotateSwarmJoinTokenUseCaseToken =
  createToken<RotateSwarmJoinTokenUseCase>("RotateSwarmJoinTokenUseCase");

export const GetDeploymentsUseCaseToken = createToken<GetDeploymentsUseCase>(
  "GetDeploymentsUseCase",
);
export const GetQueueUseCaseToken =
  createToken<GetQueueUseCase>("GetQueueUseCase");
export const UpdateConcurrencyUseCaseToken =
  createToken<UpdateConcurrencyUseCase>("UpdateConcurrencyUseCase");

export const CreateDockerRegistryUseCaseToken =
  createToken<CreateDockerRegistryUseCase>("CreateDockerRegistryUseCase");
export const DeleteDockerRegistryUseCaseToken =
  createToken<DeleteDockerRegistryUseCase>("DeleteDockerRegistryUseCase");
export const GetDockerRegistriesUseCaseToken =
  createToken<GetDockerRegistriesUseCase>("GetDockerRegistriesUseCase");
export const TestDockerRegistryConnectionUseCaseToken =
  createToken<TestDockerRegistryConnectionUseCase>(
    "TestDockerRegistryConnectionUseCase",
  );

export const CreateServerUseCaseToken = createToken<CreateServerUseCase>(
  "CreateServerUseCase",
);
export const DeleteServerUseCaseToken = createToken<DeleteServerUseCase>(
  "DeleteServerUseCase",
);
export const GetServersUseCaseToken =
  createToken<GetServersUseCase>("GetServersUseCase");
export const SetupServerUseCaseToken =
  createToken<SetupServerUseCase>("SetupServerUseCase");

export const GetSwarmContainersUseCaseToken =
  createToken<GetSwarmContainersUseCase>("GetSwarmContainersUseCase");
export const CreateNotificationChannelUseCaseToken =
  createToken<CreateNotificationChannelUseCase>(
    "CreateNotificationChannelUseCase",
  );
export const GetNotificationChannelsUseCaseToken =
  createToken<GetNotificationChannelsUseCase>("GetNotificationChannelsUseCase");
export const UpdateNotificationChannelUseCaseToken =
  createToken<UpdateNotificationChannelUseCase>(
    "UpdateNotificationChannelUseCase",
  );
export const DeleteNotificationChannelUseCaseToken =
  createToken<DeleteNotificationChannelUseCase>(
    "DeleteNotificationChannelUseCase",
  );
export const TestNotificationChannelUseCaseToken =
  createToken<TestNotificationChannelUseCase>("TestNotificationChannelUseCase");
export const DeliverNotificationUseCaseToken =
  createToken<DeliverNotificationUseCase>("DeliverNotificationUseCase");

export const services = new ServiceCollection();

// 1. Database Infrastructure
services.addSingleton(DbToken, () => db);
services.addScoped(AIRepositoryToken, (c) => new DrizzleAIRepository(c.resolve(DbToken)));
services.addSingleton(CaddyServiceToken, () => new CaddyService());
services.addSingleton(DockerServiceToken, () => new DockerService());
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

// 3. Unit of Work (scoped per request)
services.addScoped(UnitOfWorkToken, (c) => {
  const executor = c.resolve(DbToken);
  return new DrizzleUnitOfWork(executor);
});

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
  DeleteResourceUseCaseToken,
  (c) =>
    new DeleteResourceUseCase(
      c.resolve(UnitOfWorkToken),
      c.resolve(CaddyServiceToken),
      c.resolve(DockerServiceToken),
    ),
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
  (c) => new GetServerRuntimeStatsUseCase(c.resolve(DockerServiceToken)),
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
  ListGitRepositoriesUseCaseToken,
  (c) => new ListGitRepositoriesUseCase(c.resolve(UnitOfWorkToken)),
);
services.addTransient(
  ListGitBranchesUseCaseToken,
  (c) => new ListGitBranchesUseCase(c.resolve(UnitOfWorkToken)),
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

// Backups
services.addSingleton(
  BackupSchedulerToken,
  () => new BackupScheduler(() => serviceProvider),
);
services.addTransient(
  CreateBackupScheduleUseCaseToken,
  (c) => new CreateBackupScheduleUseCase(c.resolve(UnitOfWorkToken)),
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

export const serviceProvider = services.build();
export type ServiceProvider = typeof serviceProvider;
