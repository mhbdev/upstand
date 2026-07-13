import { createToken } from "@circulo-ai/di";
import type * as UseCases from "./index";
import type { NotificationTransportRegistry } from "./notification/notification-transport";

export const NotificationTransportToken =
  createToken<NotificationTransportRegistry>("NotificationTransport");
export const CaddyServiceToken =
  createToken<UseCases.CaddyService>("CaddyService");
export const DockerServiceToken =
  createToken<UseCases.DockerService>("DockerService");
export const DockerReadOnlyServiceToken =
  createToken<UseCases.DockerReadOnlyService>("DockerReadOnlyService");
export const PublishNotificationUseCaseToken =
  createToken<UseCases.PublishNotificationUseCase>(
    "PublishNotificationUseCase",
  );

export const CreateUserUseCaseToken =
  createToken<UseCases.CreateUserUseCase>("CreateUserUseCase");
export const CreateProjectUseCaseToken =
  createToken<UseCases.CreateProjectUseCase>("CreateProjectUseCase");
export const GetProjectsUseCaseToken =
  createToken<UseCases.GetProjectsUseCase>("GetProjectsUseCase");
export const GetProjectUseCaseToken =
  createToken<UseCases.GetProjectUseCase>("GetProjectUseCase");
export const DeleteProjectUseCaseToken =
  createToken<UseCases.DeleteProjectUseCase>("DeleteProjectUseCase");
export const CreateEnvironmentUseCaseToken =
  createToken<UseCases.CreateEnvironmentUseCase>("CreateEnvironmentUseCase");
export const GetEnvironmentsUseCaseToken =
  createToken<UseCases.GetEnvironmentsUseCase>("GetEnvironmentsUseCase");
export const GetEnvironmentUseCaseToken =
  createToken<UseCases.GetEnvironmentUseCase>("GetEnvironmentUseCase");
export const DeleteEnvironmentUseCaseToken =
  createToken<UseCases.DeleteEnvironmentUseCase>("DeleteEnvironmentUseCase");
export const CreateResourceUseCaseToken =
  createToken<UseCases.CreateResourceUseCase>("CreateResourceUseCase");
export const GetResourcesUseCaseToken =
  createToken<UseCases.GetResourcesUseCase>("GetResourcesUseCase");
export const GetResourceUseCaseToken =
  createToken<UseCases.GetResourceUseCase>("GetResourceUseCase");
export const UpdateResourceUseCaseToken =
  createToken<UseCases.UpdateResourceUseCase>("UpdateResourceUseCase");
export const DeleteResourceUseCaseToken =
  createToken<UseCases.DeleteResourceUseCase>("DeleteResourceUseCase");
export const DeployResourceUseCaseToken =
  createToken<UseCases.DeployResourceUseCase>("DeployResourceUseCase");
export const ControlResourceUseCaseToken =
  createToken<UseCases.ControlResourceUseCase>("ControlResourceUseCase");
export const GetResourceContainersUseCaseToken =
  createToken<UseCases.GetResourceContainersUseCase>(
    "GetResourceContainersUseCase",
  );
export const GetResourceLogsUseCaseToken =
  createToken<UseCases.GetResourceLogsUseCase>("GetResourceLogsUseCase");
export const GetResourceRoutingTargetsUseCaseToken =
  createToken<UseCases.GetResourceRoutingTargetsUseCase>(
    "GetResourceRoutingTargetsUseCase",
  );
export const GetResourceStatsUseCaseToken =
  createToken<UseCases.GetResourceStatsUseCase>("GetResourceStatsUseCase");
export const GetServerRuntimeStatsUseCaseToken =
  createToken<UseCases.GetServerRuntimeStatsUseCase>(
    "GetServerRuntimeStatsUseCase",
  );
export const GetAccountStatusUseCaseToken =
  createToken<UseCases.GetAccountStatusUseCase>("GetAccountStatusUseCase");
export const GetDockerInventoryUseCaseToken =
  createToken<UseCases.GetDockerInventoryUseCase>("GetDockerInventoryUseCase");
export const CreateSshKeyUseCaseToken =
  createToken<UseCases.CreateSshKeyUseCase>("CreateSshKeyUseCase");
export const GetSshKeysUseCaseToken =
  createToken<UseCases.GetSshKeysUseCase>("GetSshKeysUseCase");
export const DeleteSshKeyUseCaseToken =
  createToken<UseCases.DeleteSshKeyUseCase>("DeleteSshKeyUseCase");
export const GenerateSshKeyUseCaseToken =
  createToken<UseCases.GenerateSshKeyUseCase>("GenerateSshKeyUseCase");
export const CreateGitProviderUseCaseToken =
  createToken<UseCases.CreateGitProviderUseCase>("CreateGitProviderUseCase");
export const GetGitProvidersUseCaseToken =
  createToken<UseCases.GetGitProvidersUseCase>("GetGitProvidersUseCase");
export const DeleteGitProviderUseCaseToken =
  createToken<UseCases.DeleteGitProviderUseCase>("DeleteGitProviderUseCase");
export const ListGitRepositoriesUseCaseToken =
  createToken<UseCases.ListGitRepositoriesUseCase>(
    "ListGitRepositoriesUseCase",
  );
export const ListGitBranchesUseCaseToken =
  createToken<UseCases.ListGitBranchesUseCase>("ListGitBranchesUseCase");
export const CreateS3DestinationUseCaseToken =
  createToken<UseCases.CreateS3DestinationUseCase>(
    "CreateS3DestinationUseCase",
  );
export const GetS3DestinationsUseCaseToken =
  createToken<UseCases.GetS3DestinationsUseCase>("GetS3DestinationsUseCase");
export const UpdateS3DestinationUseCaseToken =
  createToken<UseCases.UpdateS3DestinationUseCase>(
    "UpdateS3DestinationUseCase",
  );
export const DeleteS3DestinationUseCaseToken =
  createToken<UseCases.DeleteS3DestinationUseCase>(
    "DeleteS3DestinationUseCase",
  );
export const TestS3DestinationConnectionUseCaseToken =
  createToken<UseCases.TestS3DestinationConnectionUseCase>(
    "TestS3DestinationConnectionUseCase",
  );
export const BackupSchedulerToken =
  createToken<UseCases.BackupScheduler>("BackupScheduler");
export const CreateBackupScheduleUseCaseToken =
  createToken<UseCases.CreateBackupScheduleUseCase>(
    "CreateBackupScheduleUseCase",
  );
export const GetBackupSchedulesUseCaseToken =
  createToken<UseCases.GetBackupSchedulesUseCase>("GetBackupSchedulesUseCase");
export const UpdateBackupScheduleUseCaseToken =
  createToken<UseCases.UpdateBackupScheduleUseCase>(
    "UpdateBackupScheduleUseCase",
  );
export const DeleteBackupScheduleUseCaseToken =
  createToken<UseCases.DeleteBackupScheduleUseCase>(
    "DeleteBackupScheduleUseCase",
  );
export const GetBackupRunsUseCaseToken =
  createToken<UseCases.GetBackupRunsUseCase>("GetBackupRunsUseCase");
export const TriggerBackupRunUseCaseToken =
  createToken<UseCases.TriggerBackupRunUseCase>("TriggerBackupRunUseCase");
export const RestoreBackupRunUseCaseToken =
  createToken<UseCases.RestoreBackupRunUseCase>("RestoreBackupRunUseCase");
export const ExecuteBackupRunUseCaseToken =
  createToken<UseCases.ExecuteBackupRunUseCase>("ExecuteBackupRunUseCase");
export const ListBackupVolumesUseCaseToken =
  createToken<UseCases.ListBackupVolumesUseCase>("ListBackupVolumesUseCase");
export const GetWebServerSettingsUseCaseToken =
  createToken<UseCases.GetWebServerSettingsUseCase>(
    "GetWebServerSettingsUseCase",
  );
export const UpdateWebServerSettingsUseCaseToken =
  createToken<UseCases.UpdateWebServerSettingsUseCase>(
    "UpdateWebServerSettingsUseCase",
  );
export const GetWebServerLogsUseCaseToken =
  createToken<UseCases.GetWebServerLogsUseCase>("GetWebServerLogsUseCase");
export const ReloadWebServerUseCaseToken =
  createToken<UseCases.ReloadWebServerUseCase>("ReloadWebServerUseCase");
export const GetUpdateStatusUseCaseToken =
  createToken<UseCases.GetUpdateStatusUseCase>("GetUpdateStatusUseCase");
export const TriggerUpdateUseCaseToken =
  createToken<UseCases.TriggerUpdateUseCase>("TriggerUpdateUseCase");
export const InitSwarmUseCaseToken =
  createToken<UseCases.InitSwarmUseCase>("InitSwarmUseCase");
export const GetSwarmInfoUseCaseToken =
  createToken<UseCases.GetSwarmInfoUseCase>("GetSwarmInfoUseCase");
export const GetSwarmNodesUseCaseToken =
  createToken<UseCases.GetSwarmNodesUseCase>("GetSwarmNodesUseCase");
export const UpdateSwarmNodeUseCaseToken =
  createToken<UseCases.UpdateSwarmNodeUseCase>("UpdateSwarmNodeUseCase");
export const RemoveSwarmNodeUseCaseToken =
  createToken<UseCases.RemoveSwarmNodeUseCase>("RemoveSwarmNodeUseCase");
export const GetSwarmJoinCommandsUseCaseToken =
  createToken<UseCases.GetSwarmJoinCommandsUseCase>(
    "GetSwarmJoinCommandsUseCase",
  );
export const RotateSwarmJoinTokenUseCaseToken =
  createToken<UseCases.RotateSwarmJoinTokenUseCase>(
    "RotateSwarmJoinTokenUseCase",
  );
export const GetDeploymentsUseCaseToken =
  createToken<UseCases.GetDeploymentsUseCase>("GetDeploymentsUseCase");
export const GetQueueUseCaseToken =
  createToken<UseCases.GetQueueUseCase>("GetQueueUseCase");
export const UpdateConcurrencyUseCaseToken =
  createToken<UseCases.UpdateConcurrencyUseCase>("UpdateConcurrencyUseCase");
export const CreateDockerRegistryUseCaseToken =
  createToken<UseCases.CreateDockerRegistryUseCase>(
    "CreateDockerRegistryUseCase",
  );
export const DeleteDockerRegistryUseCaseToken =
  createToken<UseCases.DeleteDockerRegistryUseCase>(
    "DeleteDockerRegistryUseCase",
  );
export const GetDockerRegistriesUseCaseToken =
  createToken<UseCases.GetDockerRegistriesUseCase>(
    "GetDockerRegistriesUseCase",
  );
export const TestDockerRegistryConnectionUseCaseToken =
  createToken<UseCases.TestDockerRegistryConnectionUseCase>(
    "TestDockerRegistryConnectionUseCase",
  );
export const CreateServerUseCaseToken =
  createToken<UseCases.CreateServerUseCase>("CreateServerUseCase");
export const DeleteServerUseCaseToken =
  createToken<UseCases.DeleteServerUseCase>("DeleteServerUseCase");
export const GetServersUseCaseToken =
  createToken<UseCases.GetServersUseCase>("GetServersUseCase");
export const SetupServerUseCaseToken =
  createToken<UseCases.SetupServerUseCase>("SetupServerUseCase");
export const GetSwarmContainersUseCaseToken =
  createToken<UseCases.GetSwarmContainersUseCase>("GetSwarmContainersUseCase");
export const CreateNotificationChannelUseCaseToken =
  createToken<UseCases.CreateNotificationChannelUseCase>(
    "CreateNotificationChannelUseCase",
  );
export const GetNotificationChannelsUseCaseToken =
  createToken<UseCases.GetNotificationChannelsUseCase>(
    "GetNotificationChannelsUseCase",
  );
export const UpdateNotificationChannelUseCaseToken =
  createToken<UseCases.UpdateNotificationChannelUseCase>(
    "UpdateNotificationChannelUseCase",
  );
export const DeleteNotificationChannelUseCaseToken =
  createToken<UseCases.DeleteNotificationChannelUseCase>(
    "DeleteNotificationChannelUseCase",
  );
export const TestNotificationChannelUseCaseToken =
  createToken<UseCases.TestNotificationChannelUseCase>(
    "TestNotificationChannelUseCase",
  );
export const DeliverNotificationUseCaseToken =
  createToken<UseCases.DeliverNotificationUseCase>(
    "DeliverNotificationUseCase",
  );
