import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ServiceScope, TokenLike } from "@circulo-ai/di";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  type AIProvider,
  type IAIRepository,
  type IUnitOfWork,
  type JsonValue,
  toJsonValue,
  UnitOfWorkToken,
} from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { AIRepositoryToken } from "@upstand/repositories";
import type {
  ControlResourceUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  DeleteProjectUseCase,
  DeleteResourceUseCase,
  DeployResourceUseCase,
  GetAccountStatusUseCase,
  GetDeploymentsUseCase,
  GetDockerInventoryUseCase,
  GetEnvironmentsUseCase,
  GetProjectsUseCase,
  GetResourceLogsUseCase,
  GetResourceStatsUseCase,
  GetResourcesUseCase,
  GetServersUseCase,
} from "@upstand/usecases";
import {
  createAgentUIStreamResponse,
  type FlexibleSchema,
  generateText,
  type InferUITools,
  stepCountIs,
  type Tool,
  type ToolExecutionOptions,
  ToolLoopAgent,
  type UIMessage,
} from "ai";
import { log } from "evlog";
import { z } from "zod";
import {
  ControlResourceUseCaseToken,
  CreateEnvironmentUseCaseToken,
  CreateProjectUseCaseToken,
  DeleteProjectUseCaseToken,
  DeleteResourceUseCaseToken,
  DeployResourceUseCaseToken,
  GetAccountStatusUseCaseToken,
  GetDeploymentsUseCaseToken,
  GetDockerInventoryUseCaseToken,
  GetEnvironmentsUseCaseToken,
  GetProjectsUseCaseToken,
  GetResourceLogsUseCaseToken,
  GetResourceStatsUseCaseToken,
  GetResourcesUseCaseToken,
  GetServersUseCaseToken,
} from "../di";

export type UpGalContext = {
  organizationId: string;
  userId: string;
  conversationId: string;
  runId: string;
  scope: ServiceScope;
};

export const UPGAL_TOOL_METADATA = [
  [
    "get_account_status",
    "Read counts of projects, environments, resources, servers, and recent deployments in the active organization.",
    false,
  ],
  [
    "list_projects",
    "Read every project in the active organization, including its stable ID and name.",
    false,
  ],
  [
    "list_environments",
    "Read all environments belonging to a project. Use the project ID, not the project name.",
    false,
  ],
  [
    "list_resources",
    "Read all deployable resources belonging to an environment. Use the environment ID.",
    false,
  ],
  [
    "get_resource_logs",
    "Read recent logs for a resource. Use the resource ID and optionally limit the number of lines returned.",
    false,
  ],
  [
    "get_resource_stats",
    "Read live CPU, memory, network, and container statistics for a resource.",
    false,
  ],
  [
    "list_servers",
    "Read all servers configured for the active organization.",
    false,
  ],
  [
    "list_deployments",
    "Read the recent deployment history with project, environment, resource, status, and logs.",
    false,
  ],
  [
    "get_docker_info",
    "Read Docker engine status for the local engine or a configured remote server.",
    false,
  ],
  [
    "list_docker_containers",
    "Read all Docker containers, including stopped containers, without changing them.",
    false,
  ],
  [
    "list_docker_images",
    "Read all Docker images on the local engine or selected remote server.",
    false,
  ],
  [
    "list_docker_volumes",
    "Read all Docker volumes on the local engine or selected remote server.",
    false,
  ],
  [
    "list_docker_services",
    "Read Docker Swarm services without changing them.",
    false,
  ],
  [
    "get_docker_logs",
    "Read recent Docker container or Swarm service logs from the selected target.",
    false,
  ],
  [
    "create_project",
    "Create a project and its default production environment after approval.",
    true,
  ],
  [
    "create_environment",
    "Create an environment inside a project after approval.",
    true,
  ],
  [
    "deploy_resource",
    "Queue a deployment for a resource after approval; this changes infrastructure state.",
    true,
  ],
  [
    "control_resource",
    "Start, stop, or restart a resource after approval.",
    true,
  ],
  [
    "delete_resource",
    "Permanently delete a resource after approval. This cannot be undone.",
    true,
  ],
  [
    "delete_project",
    "Permanently delete a project and its environments after approval. This cannot be undone.",
    true,
  ],
] as const;

export type UpGalTools = {
  get_account_status: UpGalExecutableTool<
    z.infer<typeof emptySchema>,
    Awaited<ReturnType<GetAccountStatusUseCase["execute"]>>
  >;
  list_projects: UpGalExecutableTool<
    z.infer<typeof emptySchema>,
    Awaited<ReturnType<GetProjectsUseCase["execute"]>>
  >;
  list_environments: UpGalExecutableTool<
    z.infer<typeof projectIdSchema>,
    Awaited<ReturnType<GetEnvironmentsUseCase["execute"]>>
  >;
  list_resources: UpGalExecutableTool<
    z.infer<typeof environmentIdSchema>,
    Awaited<ReturnType<GetResourcesUseCase["execute"]>>
  >;
  get_resource_logs: UpGalExecutableTool<
    z.infer<typeof resourceLogsSchema>,
    Awaited<ReturnType<GetResourceLogsUseCase["execute"]>>
  >;
  get_resource_stats: UpGalExecutableTool<
    z.infer<typeof idSchema>,
    Awaited<ReturnType<GetResourceStatsUseCase["execute"]>>
  >;
  list_servers: UpGalExecutableTool<
    z.infer<typeof emptySchema>,
    Awaited<ReturnType<GetServersUseCase["execute"]>>
  >;
  list_deployments: UpGalExecutableTool<
    Record<string, never>,
    Awaited<ReturnType<GetDeploymentsUseCase["execute"]>>
  >;
  get_docker_info: UpGalExecutableTool<
    z.infer<typeof dockerTargetSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  list_docker_containers: UpGalExecutableTool<
    z.infer<typeof dockerTargetSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  list_docker_images: UpGalExecutableTool<
    z.infer<typeof dockerTargetSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  list_docker_volumes: UpGalExecutableTool<
    z.infer<typeof dockerTargetSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  list_docker_services: UpGalExecutableTool<
    z.infer<typeof dockerTargetSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  get_docker_logs: UpGalExecutableTool<
    z.infer<typeof dockerLogsSchema>,
    Awaited<ReturnType<GetDockerInventoryUseCase["execute"]>>
  >;
  create_project: UpGalExecutableTool<
    z.infer<typeof createProjectSchema>,
    Awaited<ReturnType<CreateProjectUseCase["execute"]>>
  >;
  create_environment: UpGalExecutableTool<
    z.infer<typeof createEnvironmentSchema>,
    Awaited<ReturnType<CreateEnvironmentUseCase["execute"]>>
  >;
  deploy_resource: UpGalExecutableTool<
    z.infer<typeof idSchema>,
    Awaited<ReturnType<DeployResourceUseCase["execute"]>>
  >;
  control_resource: UpGalExecutableTool<
    z.infer<typeof controlResourceSchema>,
    Awaited<ReturnType<ControlResourceUseCase["execute"]>>
  >;
  delete_resource: UpGalExecutableTool<
    z.infer<typeof idSchema>,
    Awaited<ReturnType<DeleteResourceUseCase["execute"]>>
  >;
  delete_project: UpGalExecutableTool<
    z.infer<typeof idSchema>,
    Awaited<ReturnType<DeleteProjectUseCase["execute"]>>
  >;
};
export type UpGalUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<UpGalTools>
>;
export type UpGalToolName = keyof UpGalTools & string;
type UpGalToolContext = { organizationId: string };

export type UpGalExecutableTool<Input, Output> = Tool<
  Input,
  Output,
  UpGalToolContext
> & {
  execute: (
    input: Input,
    options: ToolExecutionOptions<UpGalToolContext>,
  ) => Promise<Output>;
};

const emptySchema = z
  .object({})
  .describe("This tool does not require any input.");
const idSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "Stable ID of the resource, project, or other entity to inspect.",
    ),
});
const projectIdSchema = z.object({
  projectId: z.string().min(1).describe("Stable ID of the project."),
});
const environmentIdSchema = z.object({
  environmentId: z.string().min(1).describe("Stable ID of the environment."),
});
const resourceLogsSchema = z.object({
  id: z.string().min(1).describe("Stable ID of the resource."),
  tail: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Maximum number of recent log lines to return. Defaults to 100."),
});
const createProjectSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("Human-readable project name to create."),
});
const createEnvironmentSchema = z.object({
  projectId: z.string().min(1).describe("Stable ID of the parent project."),
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("Human-readable environment name to create."),
  description: z
    .string()
    .max(500)
    .optional()
    .describe("Optional explanation of the environment's purpose."),
});
const controlResourceSchema = z.object({
  id: z.string().min(1).describe("Stable ID of the resource to control."),
  command: z
    .enum(["start", "stop", "restart"])
    .describe("Lifecycle action to perform on the resource."),
});
const dockerTargetSchema = z.object({
  serverId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Server ID to inspect; omit or use 'local' for the local engine.",
    ),
});
const dockerLogsSchema = dockerTargetSchema.extend({
  containerId: z
    .string()
    .min(1)
    .optional()
    .describe("Docker container ID when reading container logs."),
  serviceName: z
    .string()
    .min(1)
    .optional()
    .describe("Docker Swarm service name when reading service logs."),
  tail: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Maximum number of recent log lines to return. Defaults to 150."),
});
const toolContextSchema = z.object({
  organizationId: z
    .string()
    .min(1)
    .describe("Active organization ID used to scope every tool operation."),
});

const projectOutputSchema = z
  .object({
    id: z.string().describe("Stable project ID."),
    name: z.string().describe("Human-readable project name."),
    organizationId: z.string().describe("Owning organization ID."),
    createdAt: z.any().describe("Project creation timestamp."),
    updatedAt: z.any().describe("Most recent project update timestamp."),
  })
  .describe("A project record.");
const projectsOutputSchema = z
  .array(projectOutputSchema)
  .describe("Project records.");

const environmentOutputSchema = z
  .object({
    id: z.string().describe("Stable environment ID."),
    projectId: z.string().describe("Parent project ID."),
    name: z.string().describe("Human-readable environment name."),
    slug: z.string().describe("URL-safe environment slug."),
    description: z
      .any()
      .optional()
      .describe("Optional explanation of the environment."),
    isDefault: z
      .boolean()
      .describe("Whether this is the project's default environment."),
    isProtected: z
      .boolean()
      .describe("Whether destructive operations are protected."),
    resourceCount: z
      .number()
      .describe("Number of resources in the environment."),
    createdAt: z.any().describe("Environment creation timestamp."),
    updatedAt: z.any().describe("Most recent environment update timestamp."),
  })
  .describe("An environment record.");
const environmentsOutputSchema = z
  .array(environmentOutputSchema)
  .describe("Environment records.");

const resourceOutputSchema = z
  .object({
    id: z.string().describe("Stable resource ID."),
    environmentId: z.string().describe("Parent environment ID."),
    name: z.string().describe("Human-readable resource name."),
    type: z
      .string()
      .describe("Resource type, such as application or database."),
    status: z.string().describe("Current resource lifecycle status."),
    provider: z.string().describe("Deployment or source provider."),
    appName: z.any().optional().describe("Optional deployed application name."),
    description: z.any().optional().describe("Optional resource description."),
    dbType: z.any().optional().describe("Optional database engine type."),
    composeType: z.any().optional().describe("Optional Compose resource type."),
    dockerImage: z
      .any()
      .optional()
      .describe("Optional Docker image reference."),
    credentials: z
      .any()
      .optional()
      .describe("Stored resource credentials, if present."),
    buildConfig: z.string().describe("Serialized build configuration."),
    advancedConfig: z
      .any()
      .optional()
      .describe("Serialized advanced configuration."),
    envVars: z.string().describe("Serialized environment variables."),
    domains: z.string().describe("Serialized domain mappings."),
    deployments: z.string().describe("Serialized recent deployment entries."),
    containers: z.string().describe("Serialized known container entries."),
    serverId: z
      .any()
      .optional()
      .describe("Assigned server ID, or null for local."),
    createdAt: z.any().describe("Resource creation timestamp."),
    updatedAt: z.any().describe("Most recent resource update timestamp."),
  })
  .describe("A deployable resource record.");
const resourcesOutputSchema = z
  .array(resourceOutputSchema)
  .describe("Resource records.");
const nullableResourceOutputSchema = resourceOutputSchema
  .nullable()
  .describe("The updated resource, or null if it no longer exists.");

const serverOutputSchema = z
  .object({
    id: z.string().describe("Stable server ID."),
    organizationId: z.string().describe("Owning organization ID."),
    name: z.string().describe("Human-readable server name."),
    description: z.any().optional().describe("Optional server description."),
    serverType: z.string().describe("Server role, such as deploy or database."),
    sshKeyId: z.any().optional().describe("Configured SSH key ID, if present."),
    ipAddress: z.string().describe("Server IP address."),
    port: z.number().describe("SSH port."),
    username: z.string().describe("SSH username."),
    enableDockerCleanup: z
      .boolean()
      .describe("Whether automatic Docker cleanup is enabled."),
    status: z.string().describe("Current server setup status."),
    createdAt: z.any().describe("Server creation timestamp."),
    updatedAt: z.any().describe("Most recent server update timestamp."),
  })
  .describe("A configured server record.");
const serversOutputSchema = z
  .array(serverOutputSchema)
  .describe("Server records.");

const accountStatusOutputSchema = z
  .object({
    organizationId: z.string().describe("Active organization ID."),
    projectCount: z.number().describe("Number of projects."),
    environmentCount: z.number().describe("Number of environments."),
    resourceCount: z.number().describe("Number of resources."),
    serverCount: z.number().describe("Number of configured servers."),
    recentDeploymentCount: z.number().describe("Number of recent deployments."),
    checkedAt: z.string().describe("Timestamp when the counts were collected."),
  })
  .describe("Organization inventory summary.");

const deploymentOutputSchema = z
  .object({
    id: z.string().describe("Deployment ID."),
    resourceId: z.string().describe("Resource ID being deployed."),
    resourceName: z.string().describe("Resource name."),
    resourceType: z.string().describe("Resource type."),
    environmentName: z.string().describe("Environment name."),
    projectName: z.string().describe("Project name."),
    serverId: z.any().describe("Target server ID, if assigned."),
    serverName: z.any().describe("Target server name, if assigned."),
    title: z.string().describe("Deployment title."),
    status: z.string().describe("Deployment status."),
    logs: z.string().describe("Deployment log output."),
    createdAt: z.string().describe("Deployment creation timestamp."),
  })
  .describe("Enriched deployment history record.");
const deploymentsOutputSchema = z
  .array(deploymentOutputSchema)
  .describe("Enriched deployment history records.");

const resourceStatsOutputSchema = z
  .object({
    cpu: z.number().describe("Aggregated CPU usage percentage."),
    ram: z.number().describe("Aggregated memory usage percentage."),
    ramUsage: z.number().describe("Memory usage in megabytes."),
    ramLimit: z.number().describe("Memory limit in megabytes."),
    networkRxBytes: z.number().describe("Received network bytes."),
    networkTxBytes: z.number().describe("Transmitted network bytes."),
    containerCount: z
      .number()
      .describe("Number of containers contributing to the stats."),
    collectedAt: z
      .string()
      .describe("Timestamp when the stats were collected."),
  })
  .describe("Live resource runtime statistics.");

const dockerInfoOutputSchema = z
  .object({
    name: z.string().describe("Docker target name."),
    serverVersion: z.string().describe("Docker engine version."),
    operatingSystem: z.string().describe("Docker host operating system."),
    architecture: z.string().describe("Docker host architecture."),
    containers: z.number().describe("Total Docker container count."),
    images: z.number().describe("Total Docker image count."),
    memoryBytes: z.number().describe("Host memory in bytes."),
    swarmState: z.string().describe("Docker Swarm node state."),
  })
  .describe("Docker engine status.");
const dockerContainersOutputSchema = z
  .array(
    z.object({
      id: z.string().describe("Container ID."),
      name: z.string().describe("Container name."),
      image: z.string().describe("Container image."),
      state: z.string().describe("Container state."),
      status: z.string().describe("Human-readable container status."),
      ports: z.string().describe("Published container ports."),
      createdAt: z
        .any()
        .describe("Container creation timestamp, if available."),
    }),
  )
  .describe("Docker container records.");
const dockerImagesOutputSchema = z
  .array(
    z.object({
      id: z.string().describe("Image ID."),
      tags: z.array(z.string()).describe("Image repository tags."),
      sizeBytes: z.number().describe("Image size in bytes."),
      createdAt: z.any().describe("Image creation timestamp, if available."),
    }),
  )
  .describe("Docker image records.");
const dockerVolumesOutputSchema = z
  .array(
    z.object({
      name: z.string().describe("Volume name."),
      driver: z.string().describe("Volume driver."),
      mountpoint: z.string().describe("Volume mount point."),
    }),
  )
  .describe("Docker volume records.");
const dockerServicesOutputSchema = z
  .array(
    z.object({
      id: z.string().describe("Swarm service ID."),
      name: z.string().describe("Swarm service name."),
      mode: z.string().describe("Swarm service mode."),
      replicas: z.string().describe("Desired or active replica count."),
      image: z.string().describe("Service image."),
      ports: z.string().describe("Published service ports."),
    }),
  )
  .describe("Docker Swarm service records.");
const dockerOutputSchema = z
  .union([
    dockerInfoOutputSchema,
    dockerContainersOutputSchema,
    dockerImagesOutputSchema,
    dockerVolumesOutputSchema,
    dockerServicesOutputSchema,
    z.string().describe("Plain-text Docker log output."),
  ])
  .describe("Docker inventory or log output.");
const logsOutputSchema = z.string().describe("Plain-text log output.");
const deletionOutputSchema = z
  .boolean()
  .describe("Whether the resource was deleted.");

function resolve<T>(scope: ServiceScope, token: TokenLike<T>): T {
  return scope.resolve(token);
}

function repository(context: UpGalContext): IAIRepository {
  return resolve(context.scope, AIRepositoryToken);
}

async function assertProject(context: UpGalContext, projectId: string) {
  const uow = resolve<IUnitOfWork>(context.scope, UnitOfWorkToken);
  const project = await uow.projectRepository.findById(projectId);
  if (!project || project.organizationId !== context.organizationId)
    throw new Error("Project is not part of the active organization.");
  return project;
}

async function assertEnvironment(context: UpGalContext, environmentId: string) {
  const uow = resolve<IUnitOfWork>(context.scope, UnitOfWorkToken);
  const environment = await uow.environmentRepository.findById(environmentId);
  if (!environment) throw new Error("Environment was not found.");
  await assertProject(context, environment.projectId);
  return environment;
}

async function assertResource(context: UpGalContext, resourceId: string) {
  const uow = resolve<IUnitOfWork>(context.scope, UnitOfWorkToken);
  const resource = await uow.resourceRepository.findById(resourceId);
  if (!resource) throw new Error("Resource was not found.");
  await assertEnvironment(context, resource.environmentId);
  return resource;
}

function readTool<TInput, TOutput>(
  description: string,
  inputSchema: FlexibleSchema<TInput>,
  execute: (input: TInput) => Promise<TOutput>,
  outputSchema: FlexibleSchema<TOutput>,
): UpGalExecutableTool<TInput, TOutput> {
  return {
    type: "function",
    description,
    inputSchema,
    outputSchema,
    contextSchema: toolContextSchema,
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<UpGalToolContext>,
    ) => toJsonValue(await execute(input)) as TOutput,
  } satisfies UpGalExecutableTool<TInput, TOutput>;
}

function mutationTool<TInput, TOutput>(
  description: string,
  inputSchema: FlexibleSchema<TInput>,
  execute: (input: TInput) => Promise<TOutput>,
  outputSchema: FlexibleSchema<TOutput>,
): UpGalExecutableTool<TInput, TOutput> {
  return {
    type: "function",
    description,
    inputSchema,
    outputSchema,
    contextSchema: toolContextSchema,
    needsApproval: true,
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<UpGalToolContext>,
    ) => toJsonValue(await execute(input)) as TOutput,
  } satisfies UpGalExecutableTool<TInput, TOutput>;
}

export function createUpGalTools(context: UpGalContext): UpGalTools {
  const run = <T>(token: TokenLike<T>) => resolve(context.scope, token);
  const dockerRead = (
    kind: "info" | "containers" | "images" | "volumes" | "services",
    input: z.infer<typeof dockerTargetSchema>,
  ) =>
    run(GetDockerInventoryUseCaseToken).execute({
      organizationId: context.organizationId,
      kind,
      tail: 150,
      ...input,
    });
  return {
    get_account_status: readTool(
      "Read a compact health and inventory summary for the active organization.",
      emptySchema,
      async () =>
        run(GetAccountStatusUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
      accountStatusOutputSchema,
    ),
    list_projects: readTool(
      "Read all projects in the active Upstand organization. If none exist, report that clearly.",
      emptySchema,
      async () =>
        run(GetProjectsUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
      projectsOutputSchema,
    ),
    list_environments: readTool(
      "Read environments for a project. The projectId must come from a prior project result or the user.",
      projectIdSchema,
      async ({ projectId }) => {
        await assertProject(context, projectId);
        return run(GetEnvironmentsUseCaseToken).execute({ projectId });
      },
      environmentsOutputSchema,
    ),
    list_resources: readTool(
      "Read deployable resources in an environment. The environmentId must come from a prior environment result or the user.",
      environmentIdSchema,
      async ({ environmentId }) => {
        await assertEnvironment(context, environmentId);
        return run(GetResourcesUseCaseToken).execute({ environmentId });
      },
      resourcesOutputSchema,
    ),
    get_resource_logs: readTool(
      "Read recent logs for a resource, returning at most the requested number of lines.",
      resourceLogsSchema,
      async ({ id, tail }) => {
        await assertResource(context, id);
        return run(GetResourceLogsUseCaseToken).execute({
          id,
          tail: tail ?? 100,
        });
      },
      logsOutputSchema,
    ),
    get_resource_stats: readTool(
      "Read live CPU, memory, network, and container statistics for a resource.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(GetResourceStatsUseCaseToken).execute({ id });
      },
      resourceStatsOutputSchema,
    ),
    list_servers: readTool(
      "Read remote servers available to the active organization.",
      emptySchema,
      async () =>
        run(GetServersUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
      serversOutputSchema,
    ),
    list_deployments: readTool(
      "Read recent deployment history enriched with project and environment names.",
      emptySchema,
      async () => run(GetDeploymentsUseCaseToken).execute(),
      deploymentsOutputSchema,
    ),
    get_docker_info: readTool(
      "Read Docker engine status. Omit serverId or use 'local' to inspect the local engine.",
      dockerTargetSchema,
      async (input) => dockerRead("info", input),
      dockerOutputSchema,
    ),
    list_docker_containers: readTool(
      "Read local or remote Docker containers, including stopped containers, without changing them.",
      dockerTargetSchema,
      async (input) => dockerRead("containers", input),
      dockerOutputSchema,
    ),
    list_docker_images: readTool(
      "Read Docker images on the selected local or remote server.",
      dockerTargetSchema,
      async (input) => dockerRead("images", input),
      dockerOutputSchema,
    ),
    list_docker_volumes: readTool(
      "Read Docker volumes on the selected local or remote server.",
      dockerTargetSchema,
      async (input) => dockerRead("volumes", input),
      dockerOutputSchema,
    ),
    list_docker_services: readTool(
      "Read Docker Swarm services without changing them.",
      dockerTargetSchema,
      async (input) => dockerRead("services", input),
      dockerOutputSchema,
    ),
    get_docker_logs: readTool(
      "Read recent logs for a Docker container or Swarm service. Provide exactly one containerId or serviceName.",
      dockerLogsSchema,
      async (input) =>
        run(GetDockerInventoryUseCaseToken).execute({
          organizationId: context.organizationId,
          kind: "logs",
          ...input,
          tail: input.tail ?? 150,
        }),
      dockerOutputSchema,
    ),
    create_project: mutationTool(
      "Create a project and its default production environment. This requires approval.",
      createProjectSchema,
      async ({ name }) =>
        run(CreateProjectUseCaseToken).execute({
          organizationId: context.organizationId,
          name,
        }),
      projectOutputSchema,
    ),
    create_environment: mutationTool(
      "Create an environment within a project. This requires approval.",
      createEnvironmentSchema,
      async (input) => {
        await assertProject(context, input.projectId);
        return run(CreateEnvironmentUseCaseToken).execute(input);
      },
      environmentOutputSchema,
    ),
    deploy_resource: mutationTool(
      "Queue a deployment for a resource. This changes infrastructure and requires approval.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(DeployResourceUseCaseToken).execute({ id });
      },
      resourceOutputSchema,
    ),
    control_resource: mutationTool(
      "Start, stop, or restart a resource. This changes infrastructure and requires approval.",
      controlResourceSchema,
      async (input) => {
        await assertResource(context, input.id);
        return run(ControlResourceUseCaseToken).execute(input);
      },
      nullableResourceOutputSchema,
    ),
    delete_resource: mutationTool(
      "Permanently delete a resource and its deployment configuration. This cannot be undone and requires approval.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(DeleteResourceUseCaseToken).execute({ id });
      },
      deletionOutputSchema,
    ),
    delete_project: mutationTool(
      "Permanently delete a project and its environments. This cannot be undone and requires approval.",
      idSchema,
      async ({ id }) => {
        await assertProject(context, id);
        return run(DeleteProjectUseCaseToken).execute({
          organizationId: context.organizationId,
          id,
        });
      },
      projectOutputSchema.nullable(),
    ),
  };
}

export function isUpGalToolName(value: string): value is UpGalToolName {
  return UPGAL_TOOL_METADATA.some(([name]) => name === value);
}

export async function executeUpGalReadTool(
  name: UpGalToolName,
  input: JsonValue,
  context: UpGalContext,
): Promise<JsonValue> {
  const tools = createUpGalTools(context);
  const options: ToolExecutionOptions<UpGalToolContext> = {
    toolCallId: randomUUID(),
    messages: [],
    context: { organizationId: context.organizationId },
  };
  switch (name) {
    case "get_account_status":
      return toJsonValue(await tools.get_account_status.execute({}, options));
    case "list_projects":
      return toJsonValue(await tools.list_projects.execute({}, options));
    case "list_environments":
      return toJsonValue(
        await tools.list_environments.execute(
          projectIdSchema.parse(input),
          options,
        ),
      );
    case "list_resources":
      return toJsonValue(
        await tools.list_resources.execute(
          environmentIdSchema.parse(input),
          options,
        ),
      );
    case "get_resource_logs":
      return toJsonValue(
        await tools.get_resource_logs.execute(
          resourceLogsSchema.parse(input),
          options,
        ),
      );
    case "get_resource_stats":
      return toJsonValue(
        await tools.get_resource_stats.execute(idSchema.parse(input), options),
      );
    case "list_servers":
      return toJsonValue(await tools.list_servers.execute({}, options));
    case "list_deployments":
      return toJsonValue(await tools.list_deployments.execute({}, options));
    case "get_docker_info":
      return toJsonValue(
        await tools.get_docker_info.execute(
          dockerTargetSchema.parse(input),
          options,
        ),
      );
    case "list_docker_containers":
      return toJsonValue(
        await tools.list_docker_containers.execute(
          dockerTargetSchema.parse(input),
          options,
        ),
      );
    case "list_docker_images":
      return toJsonValue(
        await tools.list_docker_images.execute(
          dockerTargetSchema.parse(input),
          options,
        ),
      );
    case "list_docker_volumes":
      return toJsonValue(
        await tools.list_docker_volumes.execute(
          dockerTargetSchema.parse(input),
          options,
        ),
      );
    case "list_docker_services":
      return toJsonValue(
        await tools.list_docker_services.execute(
          dockerTargetSchema.parse(input),
          options,
        ),
      );
    case "get_docker_logs":
      return toJsonValue(
        await tools.get_docker_logs.execute(
          dockerLogsSchema.parse(input),
          options,
        ),
      );
    default:
      throw new Error(`Tool ${name} requires approval before execution.`);
  }
}

type ProviderOverrides = {
  provider?: AIProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
};

async function getProvider(
  organizationId: string,
  ai: IAIRepository,
  overrides: ProviderOverrides = {},
) {
  const stored = await ai.findProviderConfig(organizationId);
  const config = stored
    ? {
        ...stored,
        provider: overrides.provider ?? stored.provider,
        model: overrides.model ?? stored.model,
        baseUrl: overrides.baseUrl || stored.baseUrl,
      }
    : overrides.provider && overrides.model
      ? {
          provider: overrides.provider,
          model: overrides.model,
          baseUrl: overrides.baseUrl || null,
          enabled: true,
        }
      : null;
  if (!config?.enabled)
    throw new Error(
      "Configure an AI provider in Settings → AI before using UpGal.",
    );
  const apiKey = overrides.apiKey?.trim() || decryptProviderApiKey(stored);
  if (!apiKey) throw new Error("The configured AI provider has no API key.");

  // OpenRouter keys are easy to paste while OpenAI is selected. Route them to
  // the matching provider instead of sending them to api.openai.com, which
  // responds with a misleading invalid OpenAI-key error.
  const effectiveProvider =
    config.provider === "openai" && apiKey.startsWith("sk-or-v1-")
      ? "openrouter"
      : config.provider;

  if (effectiveProvider === "gateway") {
    const gateway = createGateway({ apiKey });
    const modelId = config.model.includes("/")
      ? config.model
      : `openai/${config.model}`;
    return { model: gateway(modelId), modelId };
  }
  if (effectiveProvider === "anthropic")
    return {
      model: createAnthropic({ apiKey, baseURL: config.baseUrl || undefined })(
        config.model,
      ),
      modelId: config.model,
    };
  if (effectiveProvider === "google")
    return {
      model: createGoogleGenerativeAI({
        apiKey,
        baseURL: config.baseUrl || undefined,
      })(config.model),
      modelId: config.model,
    };
  if (effectiveProvider === "openrouter")
    return {
      model: createOpenRouter({
        apiKey,
        baseURL: config.baseUrl || undefined,
        headers: {
          "HTTP-Referer": "https://upstand.dev",
          "X-Title": "Upstand",
        },
        appUrl: "https://upstand.dev",
        appName: "Upstand",
      }).chat(config.model),
      modelId: config.model,
    };
  return {
    model: createOpenAI({ apiKey, baseURL: config.baseUrl || undefined })(
      config.model,
    ),
    modelId: config.model,
  };
}

function decryptProviderApiKey(
  config: Awaited<ReturnType<IAIRepository["findProviderConfig"]>>,
) {
  if (
    !config?.apiKeyCiphertext ||
    !config.apiKeyIv ||
    !config.apiKeyAuthTag ||
    !config.apiKeyVersion
  ) {
    return undefined;
  }
  return decryptSecret({
    ciphertext: config.apiKeyCiphertext,
    iv: config.apiKeyIv,
    authTag: config.apiKeyAuthTag,
    keyVersion: config.apiKeyVersion,
  });
}

function upGalStreamErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("configure an ai provider")) {
    return "UpGal needs an AI provider. Open Settings → UpGal Settings, configure a provider, and try again.";
  }
  if (message.includes("no api key")) {
    return "UpGal could not authenticate with the configured AI provider. Check the API key in Settings → UpGal Settings.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "The AI provider is busy or rate-limiting this request. Wait a moment and try again.";
  }
  return "UpGal could not complete this response. Completed tool results remain available above; retry to continue.";
}

const MODEL_CATALOG_BASE_URLS: Record<AIProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  gateway: "https://ai-gateway.vercel.sh/v1",
};

export async function listProviderModels(
  organizationId: string,
  scope: ServiceScope,
  input: { provider: AIProvider; apiKey?: string; baseUrl?: string },
) {
  const repository = resolve(scope, AIRepositoryToken);
  const config = await repository.findProviderConfig(organizationId);
  const apiKey = input.apiKey?.trim() || decryptProviderApiKey(config);
  if (!apiKey) throw new Error(`Enter a ${input.provider} API key first.`);
  const effectiveProvider =
    input.provider === "openai" && apiKey.startsWith("sk-or-v1-")
      ? "openrouter"
      : input.provider;

  const endpoint = new URL(
    "models",
    `${(input.baseUrl?.trim() || MODEL_CATALOG_BASE_URLS[effectiveProvider]).replace(/\/$/, "")}/`,
  );
  const headers: Record<string, string> = { Accept: "application/json" };
  if (effectiveProvider === "google") {
    endpoint.searchParams.set("key", apiKey);
  } else if (effectiveProvider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (effectiveProvider === "openrouter" || effectiveProvider === "gateway") {
    headers["HTTP-Referer"] = "https://upstand.dev";
    headers["X-Title"] = "Upstand";
  }
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(
      `${input.provider} model request failed (${response.status}): ${message}`,
    );
  }
  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      display_name?: string;
      context_length?: number;
    }>;
    models?: Array<{
      name?: string;
      displayName?: string;
      inputTokenLimit?: number;
    }>;
  };
  const models =
    input.provider === "google"
      ? (payload.models ?? []).map((model) => ({
          id: model.name?.replace(/^models\//, "") || "",
          name: model.displayName || model.name || "",
          contextLength: model.inputTokenLimit,
        }))
      : (payload.data ?? []).map((model) => ({
          id: model.id || "",
          name: model.name || model.id || "",
          contextLength: model.context_length,
        }));
  return models
    .filter((model) => Boolean(model.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function testUpGalProvider(
  organizationId: string,
  scope: ServiceScope,
  overrides: ProviderOverrides = {},
) {
  const provider = await getProvider(
    organizationId,
    resolve(scope, AIRepositoryToken),
    overrides,
  );
  const result = await generateText({
    model: provider.model,
    prompt: "Reply with OK.",
  });
  return { ok: true, model: provider.modelId, text: result.text };
}

export async function createUpGalResponse(
  context: UpGalContext,
  uiMessages: UpGalUIMessage[],
  request: Request,
) {
  const ai = repository(context);
  const provider = await getProvider(context.organizationId, ai);
  const runId = context.runId || randomUUID();
  await ai.createRun({
    id: runId,
    conversationId: context.conversationId,
    organizationId: context.organizationId,
    userId: context.userId,
    model: provider.modelId,
  });
  const updateRunSafely = async (patch: {
    stepCount?: number;
    status?: string;
    finishedAt?: Date;
  }) => {
    try {
      await ai.updateRun(runId, patch);
    } catch (error) {
      log.error({
        message: "Failed to update UpGal run state",
        runId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const agent = new ToolLoopAgent({
    id: "upgal",
    model: provider.model,
    temperature: 0.5,
    instructions: `You are UpGal, Upstand's operations assistant. Be precise, transparent, and concise. You may inspect organization resources automatically. Every mutation requires user approval. Never invent IDs or claim an action completed until the tool returns success. After every tool call, continue with a concise plain-language answer; never leave the user with only a tool result card. If a list is empty, say that explicitly. Use IDs from tool results for follow-up calls and do not guess them. The active organization is ${context.organizationId}.`,
    tools: createUpGalTools(context),
    toolsContext: {
      get_account_status: { organizationId: context.organizationId },
      list_projects: { organizationId: context.organizationId },
      list_environments: { organizationId: context.organizationId },
      list_resources: { organizationId: context.organizationId },
      get_resource_logs: { organizationId: context.organizationId },
      get_resource_stats: { organizationId: context.organizationId },
      list_servers: { organizationId: context.organizationId },
      list_deployments: { organizationId: context.organizationId },
      get_docker_info: { organizationId: context.organizationId },
      list_docker_containers: { organizationId: context.organizationId },
      list_docker_images: { organizationId: context.organizationId },
      list_docker_volumes: { organizationId: context.organizationId },
      list_docker_services: { organizationId: context.organizationId },
      get_docker_logs: { organizationId: context.organizationId },
      create_project: { organizationId: context.organizationId },
      create_environment: { organizationId: context.organizationId },
      deploy_resource: { organizationId: context.organizationId },
      control_resource: { organizationId: context.organizationId },
      delete_resource: { organizationId: context.organizationId },
      delete_project: { organizationId: context.organizationId },
    },
    stopWhen: stepCountIs(12),
    runtimeContext: context,
    onStepEnd: async ({ stepNumber }) => {
      await updateRunSafely({ stepCount: stepNumber + 1 });
    },
    onFinish: async () => {
      await updateRunSafely({
        status: "completed",
        finishedAt: new Date(),
      });
    },
  });

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages,
    abortSignal: request.signal,
    // Persist the complete assistant message, including tool calls and tool
    // results. Without this callback only the incoming user messages are
    // stored, so a reloaded conversation loses the useful part of the run.
    onEnd: async ({ messages }) => {
      try {
        await saveIncomingMessages(context.conversationId, messages, ai);
      } catch (error) {
        // Persistence must not turn an otherwise successful model response
        // into a misleading stream error. The run is still observable in the
        // server log and the next request can retry persistence safely.
        log.error({
          message: "Failed to persist UpGal response messages",
          conversationId: context.conversationId,
          runId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    },
    onError: (error) => {
      void updateRunSafely({ status: "failed", finishedAt: new Date() });
      log.error({
        message: "UpGal response stream failed",
        runId,
        model: provider.modelId,
        err: error instanceof Error ? error.message : String(error),
      });
      return upGalStreamErrorMessage(error);
    },
    headers: { "X-UpGal-Run-Id": runId },
  });
  return response;
}

export async function saveIncomingMessages(
  conversationId: string,
  messages: ReadonlyArray<UpGalUIMessage>,
  ai: IAIRepository,
) {
  await ai.saveMessages(
    conversationId,
    messages.map((message) => ({
      id: message.id,
      conversationId,
      role: message.role,
      parts: message.parts.map(toJsonValue),
      createdAt: new Date(),
    })),
  );
  const firstUserText = messages
    .find((message) => message.role === "user")
    ?.parts.find((part) => part.type === "text")?.text;
  if (firstUserText?.trim()) {
    await ai.updateConversationTitle(
      conversationId,
      firstUserText.trim().replace(/\s+/g, " "),
    );
  }
}

export async function getConversationForUser(
  conversationId: string,
  organizationId: string,
  userId: string,
  ai: IAIRepository,
) {
  return ai.findConversation(conversationId, organizationId, userId);
}

export async function listConversations(
  organizationId: string,
  userId: string,
  ai: IAIRepository,
) {
  return ai.listConversations(organizationId, userId);
}
