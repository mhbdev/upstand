import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createGateway } from "@ai-sdk/gateway";
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
import { z } from "zod";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import type { ServiceScope, TokenLike } from "@circulo-ai/di";
import {
  AIRepositoryToken,
  type IAIRepository,
  toJsonValue,
  UnitOfWorkToken,
  type IUnitOfWork,
  type JsonValue,
} from "@upstand/domain";
import {
  ControlResourceUseCaseToken,
  CreateEnvironmentUseCaseToken,
  CreateProjectUseCaseToken,
  DeleteProjectUseCaseToken,
  DeleteResourceUseCaseToken,
  DeployResourceUseCaseToken,
  GetDeploymentsUseCaseToken,
  GetEnvironmentsUseCaseToken,
  GetProjectsUseCaseToken,
  GetResourceLogsUseCaseToken,
  GetResourceStatsUseCaseToken,
  GetResourcesUseCaseToken,
  GetServersUseCaseToken,
} from "../di";
import type {
  ControlResourceUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  DeleteProjectUseCase,
  DeleteResourceUseCase,
  DeployResourceUseCase,
  GetDeploymentsUseCase,
  GetEnvironmentsUseCase,
  GetProjectsUseCase,
  GetResourceLogsUseCase,
  GetResourceStatsUseCase,
  GetResourcesUseCase,
  GetServersUseCase,
} from "@upstand/usecases";

export type UpGalContext = {
  organizationId: string;
  userId: string;
  conversationId: string;
  runId: string;
  scope: ServiceScope;
};

export const UPGAL_TOOL_METADATA = [
  ["list_projects", "List all projects in the active organization.", false],
  ["list_environments", "List environments for a project.", false],
  ["list_resources", "List resources in an environment.", false],
  ["get_resource_logs", "Read recent resource logs.", false],
  ["get_resource_stats", "Get live resource statistics.", false],
  ["list_servers", "List organization servers.", false],
  ["list_deployments", "List deployment history.", false],
  ["create_project", "Create a project.", true],
  ["create_environment", "Create an environment.", true],
  ["deploy_resource", "Queue a resource deployment.", true],
  ["control_resource", "Start, stop, or restart a resource.", true],
  ["delete_resource", "Permanently delete a resource.", true],
  ["delete_project", "Permanently delete a project.", true],
] as const;

export type UpGalTools = {
  list_projects: UpGalExecutableTool<z.infer<typeof emptySchema>, Awaited<ReturnType<GetProjectsUseCase["execute"]>>>;
  list_environments: UpGalExecutableTool<z.infer<typeof projectIdSchema>, Awaited<ReturnType<GetEnvironmentsUseCase["execute"]>>>;
  list_resources: UpGalExecutableTool<z.infer<typeof environmentIdSchema>, Awaited<ReturnType<GetResourcesUseCase["execute"]>>>;
  get_resource_logs: UpGalExecutableTool<z.infer<typeof resourceLogsSchema>, Awaited<ReturnType<GetResourceLogsUseCase["execute"]>>>;
  get_resource_stats: UpGalExecutableTool<z.infer<typeof idSchema>, Awaited<ReturnType<GetResourceStatsUseCase["execute"]>>>;
  list_servers: UpGalExecutableTool<z.infer<typeof emptySchema>, Awaited<ReturnType<GetServersUseCase["execute"]>>>;
  list_deployments: UpGalExecutableTool<Record<string, never>, Awaited<ReturnType<GetDeploymentsUseCase["execute"]>>>;
  create_project: UpGalExecutableTool<z.infer<typeof createProjectSchema>, Awaited<ReturnType<CreateProjectUseCase["execute"]>>>;
  create_environment: UpGalExecutableTool<z.infer<typeof createEnvironmentSchema>, Awaited<ReturnType<CreateEnvironmentUseCase["execute"]>>>;
  deploy_resource: UpGalExecutableTool<z.infer<typeof idSchema>, Awaited<ReturnType<DeployResourceUseCase["execute"]>>>;
  control_resource: UpGalExecutableTool<z.infer<typeof controlResourceSchema>, Awaited<ReturnType<ControlResourceUseCase["execute"]>>>;
  delete_resource: UpGalExecutableTool<z.infer<typeof idSchema>, Awaited<ReturnType<DeleteResourceUseCase["execute"]>>>;
  delete_project: UpGalExecutableTool<z.infer<typeof idSchema>, Awaited<ReturnType<DeleteProjectUseCase["execute"]>>>;
};
export type UpGalUIMessage = UIMessage<never, never, InferUITools<UpGalTools>>;
export type UpGalToolName = keyof UpGalTools & string;

export type UpGalExecutableTool<Input, Output> = Tool<
  Input,
  Output,
  Record<string, never>
> & {
  execute: (
    input: Input,
    options: ToolExecutionOptions<Record<string, never>>,
  ) => Promise<Output>;
};

const emptySchema = z.object({});
const idSchema = z.object({ id: z.string().min(1) });
const projectIdSchema = z.object({ projectId: z.string().min(1) });
const environmentIdSchema = z.object({ environmentId: z.string().min(1) });
const resourceLogsSchema = z.object({
  id: z.string().min(1),
  tail: z.number().int().positive().max(1000).optional(),
});
const createProjectSchema = z.object({ name: z.string().min(1).max(120) });
const createEnvironmentSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});
const controlResourceSchema = z.object({
  id: z.string().min(1),
  command: z.enum(["start", "stop", "restart"]),
});

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
): UpGalExecutableTool<TInput, TOutput> {
  return {
    type: "function",
    description,
    inputSchema,
    contextSchema: z.object({}),
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<Record<string, never>>,
    ) => execute(input),
  } satisfies UpGalExecutableTool<TInput, TOutput>;
}

function mutationTool<TInput, TOutput>(
  description: string,
  inputSchema: FlexibleSchema<TInput>,
  execute: (input: TInput) => Promise<TOutput>,
): UpGalExecutableTool<TInput, TOutput> {
  return {
    type: "function",
    description,
    inputSchema,
    contextSchema: z.object({}),
    needsApproval: true,
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<Record<string, never>>,
    ) => execute(input),
  } satisfies UpGalExecutableTool<TInput, TOutput>;
}

export function createUpGalTools(context: UpGalContext): UpGalTools {
  const run = <T>(token: TokenLike<T>) => resolve(context.scope, token);
  return {
    list_projects: readTool(
      "List all projects in the active Upstand organization.",
      emptySchema,
      async () =>
        run(GetProjectsUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
    ),
    list_environments: readTool(
      "List environments for a project.",
      projectIdSchema,
      async ({ projectId }) => {
        await assertProject(context, projectId);
        return run(GetEnvironmentsUseCaseToken).execute({ projectId });
      },
    ),
    list_resources: readTool(
      "List deployable resources in an environment.",
      environmentIdSchema,
      async ({ environmentId }) => {
        await assertEnvironment(context, environmentId);
        return run(GetResourcesUseCaseToken).execute({ environmentId });
      },
    ),
    get_resource_logs: readTool(
      "Read recent logs for a resource.",
      resourceLogsSchema,
      async ({ id, tail }) => {
        await assertResource(context, id);
        return run(GetResourceLogsUseCaseToken).execute({
          id,
          tail: tail ?? 100,
        });
      },
    ),
    get_resource_stats: readTool(
      "Get live CPU, memory, and runtime statistics for a resource.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(GetResourceStatsUseCaseToken).execute({ id });
      },
    ),
    list_servers: readTool(
      "List remote servers available to the active organization.",
      emptySchema,
      async () =>
        run(GetServersUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
    ),
    list_deployments: readTool(
      "List recent deployment history.",
      emptySchema,
      async () => run(GetDeploymentsUseCaseToken).execute(),
    ),
    create_project: mutationTool(
      "Create a project and its default production environment.",
      createProjectSchema,
      async ({ name }) =>
        run(CreateProjectUseCaseToken).execute({
          organizationId: context.organizationId,
          name,
        }),
    ),
    create_environment: mutationTool(
      "Create an environment within a project.",
      createEnvironmentSchema,
      async (input) => {
        await assertProject(context, input.projectId);
        return run(CreateEnvironmentUseCaseToken).execute(input);
      },
    ),
    deploy_resource: mutationTool(
      "Queue a deployment for a resource.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(DeployResourceUseCaseToken).execute({ id });
      },
    ),
    control_resource: mutationTool(
      "Start, stop, or restart a running resource.",
      controlResourceSchema,
      async (input) => {
        await assertResource(context, input.id);
        return run(ControlResourceUseCaseToken).execute(input);
      },
    ),
    delete_resource: mutationTool(
      "Permanently delete a resource and its deployment configuration.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run(DeleteResourceUseCaseToken).execute({ id });
      },
    ),
    delete_project: mutationTool(
      "Permanently delete a project and its environments.",
      idSchema,
      async ({ id }) => {
        await assertProject(context, id);
        return run(DeleteProjectUseCaseToken).execute({
          organizationId: context.organizationId,
          id,
        });
      },
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
  const options: ToolExecutionOptions<Record<string, never>> = {
    toolCallId: randomUUID(),
    messages: [],
    context: {},
  };
  switch (name) {
    case "list_projects":
      return toJsonValue(await tools.list_projects.execute({}, options));
    case "list_environments":
      return toJsonValue(
        await tools.list_environments.execute(projectIdSchema.parse(input), options),
      );
    case "list_resources":
      return toJsonValue(
        await tools.list_resources.execute(environmentIdSchema.parse(input), options),
      );
    case "get_resource_logs":
      return toJsonValue(
        await tools.get_resource_logs.execute(resourceLogsSchema.parse(input), options),
      );
    case "get_resource_stats":
      return toJsonValue(
        await tools.get_resource_stats.execute(idSchema.parse(input), options),
      );
    case "list_servers":
      return toJsonValue(await tools.list_servers.execute({}, options));
    case "list_deployments":
      return toJsonValue(await tools.list_deployments.execute({}, options));
    default:
      throw new Error(`Tool ${name} requires approval before execution.`);
  }
}

async function getProvider(organizationId: string, ai: IAIRepository) {
  const config = await ai.findProviderConfig(organizationId);
  if (!config || !config.enabled)
    throw new Error(
      "Configure an AI provider in Settings → AI before using UpGal.",
    );
  const apiKey =
    config.apiKeyCiphertext &&
    config.apiKeyIv &&
    config.apiKeyAuthTag &&
    config.apiKeyVersion
      ? decryptSecret({
          ciphertext: config.apiKeyCiphertext,
          iv: config.apiKeyIv,
          authTag: config.apiKeyAuthTag,
          keyVersion: config.apiKeyVersion,
        })
      : undefined;
  if (!apiKey) throw new Error("The configured AI provider has no API key.");

  if (config.provider === "gateway") {
    const gateway = createGateway({ apiKey });
    const modelId = config.model.includes("/")
      ? config.model
      : `openai/${config.model}`;
    return { model: gateway(modelId), modelId };
  }
  if (config.provider === "anthropic")
    return {
      model: createAnthropic({ apiKey, baseURL: config.baseUrl || undefined })(
        config.model,
      ),
      modelId: config.model,
    };
  if (config.provider === "google")
    return {
      model: createGoogleGenerativeAI({
        apiKey,
        baseURL: config.baseUrl || undefined,
      })(config.model),
      modelId: config.model,
    };
  return {
    model: createOpenAI({ apiKey, baseURL: config.baseUrl || undefined })(
      config.model,
    ),
    modelId: config.model,
  };
}

export async function testUpGalProvider(
  organizationId: string,
  scope: ServiceScope,
) {
  const provider = await getProvider(
    organizationId,
    resolve(scope, AIRepositoryToken),
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

  const agent = new ToolLoopAgent({
    id: "upgal",
    model: provider.model,
    instructions: `You are UpGal, Upstand's operations assistant. Be precise, transparent, and concise. You may inspect organization resources automatically. Every mutation requires user approval. Never invent IDs or claim an action completed until the tool returns success. The active organization is ${context.organizationId}.`,
    tools: createUpGalTools(context),
    stopWhen: stepCountIs(12),
    runtimeContext: context,
    onStepEnd: async ({ stepNumber }) => {
      await ai.updateRun(runId, { stepCount: stepNumber + 1 });
    },
    onFinish: async () => {
      await ai.updateRun(runId, { status: "completed", finishedAt: new Date() });
    },
  });

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages,
    abortSignal: request.signal,
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
