import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ServiceScope, TokenLike } from "@circulo-ai/di";
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
  GetDeploymentsUseCase,
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
import { z } from "zod";
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
export type UpGalUIMessage = UIMessage<never, never, InferUITools<UpGalTools>>;
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
    contextSchema: z.object({ organizationId: z.string().min(1) }),
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<UpGalToolContext>,
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
    contextSchema: z.object({ organizationId: z.string().min(1) }),
    needsApproval: true,
    execute: async (
      input: TInput,
      _options: ToolExecutionOptions<UpGalToolContext>,
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
  const options: ToolExecutionOptions<UpGalToolContext> = {
    toolCallId: randomUUID(),
    messages: [],
    context: { organizationId: context.organizationId },
  };
  switch (name) {
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
  if (!config || !config.enabled)
    throw new Error(
      "Configure an AI provider in Settings → AI before using UpGal.",
    );
  const apiKey = overrides.apiKey?.trim() || decryptProviderApiKey(stored);
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
  if (config.provider === "openrouter")
    return {
      model: createOpenAI({
        apiKey,
        baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://upstand.dev",
          "X-Title": "Upstand",
        },
        name: "openrouter",
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

  const endpoint = new URL(
    "models",
    `${(input.baseUrl?.trim() || MODEL_CATALOG_BASE_URLS[input.provider]).replace(/\/$/, "")}/`,
  );
  const headers: Record<string, string> = { Accept: "application/json" };
  if (input.provider === "google") {
    endpoint.searchParams.set("key", apiKey);
  } else if (input.provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (input.provider === "openrouter" || input.provider === "gateway") {
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

  const agent = new ToolLoopAgent({
    id: "upgal",
    model: provider.model,
    temperature: 0.7,
    instructions: `You are UpGal, Upstand's operations assistant. Be precise, transparent, and concise. You may inspect organization resources automatically. Every mutation requires user approval. Never invent IDs or claim an action completed until the tool returns success. The active organization is ${context.organizationId}.`,
    tools: createUpGalTools(context),
    toolsContext: {
      list_projects: { organizationId: context.organizationId },
      list_environments: { organizationId: context.organizationId },
      list_resources: { organizationId: context.organizationId },
      get_resource_logs: { organizationId: context.organizationId },
      get_resource_stats: { organizationId: context.organizationId },
      list_servers: { organizationId: context.organizationId },
      list_deployments: { organizationId: context.organizationId },
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
      await ai.updateRun(runId, { stepCount: stepNumber + 1 });
    },
    onFinish: async () => {
      await ai.updateRun(runId, {
        status: "completed",
        finishedAt: new Date(),
      });
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
