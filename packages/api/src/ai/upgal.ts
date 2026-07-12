import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createGateway } from "@ai-sdk/gateway";
import {
  createAgentUIStreamResponse,
  generateText,
  stepCountIs,
  ToolLoopAgent,
  tool,
} from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aiProviderConfig,
  aiConversation,
  aiMessage,
  aiRun,
} from "@upstand/db";
import { createDb } from "@upstand/db";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import type { ServiceScope } from "@circulo-ai/di";
import { UnitOfWorkToken, type IUnitOfWork } from "@upstand/domain";
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

const idSchema = z.object({ id: z.string().min(1) });

function resolve<T>(scope: ServiceScope, token: unknown): T {
  return scope.resolve(token as never) as T;
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

function readTool<T extends z.ZodTypeAny>(
  description: string,
  inputSchema: T,
  execute: (input: z.infer<T>) => Promise<unknown>,
) {
  return tool({
    description,
    inputSchema,
    execute: (input) => execute(input as z.infer<T>),
  });
}

function mutationTool<T extends z.ZodTypeAny>(
  description: string,
  inputSchema: T,
  execute: (input: z.infer<T>) => Promise<unknown>,
) {
  return tool({
    description,
    inputSchema,
    needsApproval: true,
    execute: (input) => execute(input as z.infer<T>),
  });
}

export function createUpGalTools(context: UpGalContext): Record<string, any> {
  const run = <T>(token: unknown) => resolve<T>(context.scope, token);
  return {
    list_projects: readTool(
      "List all projects in the active Upstand organization.",
      z.object({}),
      async () =>
        run<any>(GetProjectsUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
    ),
    list_environments: readTool(
      "List environments for a project.",
      z.object({ projectId: z.string().min(1) }),
      async ({ projectId }) => {
        await assertProject(context, projectId);
        return run<any>(GetEnvironmentsUseCaseToken).execute({ projectId });
      },
    ),
    list_resources: readTool(
      "List deployable resources in an environment.",
      z.object({ environmentId: z.string().min(1) }),
      async ({ environmentId }) => {
        await assertEnvironment(context, environmentId);
        return run<any>(GetResourcesUseCaseToken).execute({ environmentId });
      },
    ),
    get_resource_logs: readTool(
      "Read recent logs for a resource.",
      z.object({
        id: z.string().min(1),
        tail: z.number().int().positive().max(1000).optional(),
      }),
      async ({ id, tail }) => {
        await assertResource(context, id);
        return run<any>(GetResourceLogsUseCaseToken).execute({
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
        return run<any>(GetResourceStatsUseCaseToken).execute({ id });
      },
    ),
    list_servers: readTool(
      "List remote servers available to the active organization.",
      z.object({}),
      async () =>
        run<any>(GetServersUseCaseToken).execute({
          organizationId: context.organizationId,
        }),
    ),
    list_deployments: readTool(
      "List recent deployment history.",
      z.object({}),
      async () => run<any>(GetDeploymentsUseCaseToken).execute(),
    ),
    create_project: mutationTool(
      "Create a project and its default production environment.",
      z.object({ name: z.string().min(1).max(120) }),
      async ({ name }) =>
        run<any>(CreateProjectUseCaseToken).execute({
          organizationId: context.organizationId,
          name,
        }),
    ),
    create_environment: mutationTool(
      "Create an environment within a project.",
      z.object({
        projectId: z.string().min(1),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
      }),
      async (input) => {
        await assertProject(context, input.projectId);
        return run<any>(CreateEnvironmentUseCaseToken).execute(input);
      },
    ),
    deploy_resource: mutationTool(
      "Queue a deployment for a resource.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run<any>(DeployResourceUseCaseToken).execute({ id });
      },
    ),
    control_resource: mutationTool(
      "Start, stop, or restart a running resource.",
      z.object({
        id: z.string().min(1),
        command: z.enum(["start", "stop", "restart"]),
      }),
      async (input) => {
        await assertResource(context, input.id);
        return run<any>(ControlResourceUseCaseToken).execute(input);
      },
    ),
    delete_resource: mutationTool(
      "Permanently delete a resource and its deployment configuration.",
      idSchema,
      async ({ id }) => {
        await assertResource(context, id);
        return run<any>(DeleteResourceUseCaseToken).execute({ id });
      },
    ),
    delete_project: mutationTool(
      "Permanently delete a project and its environments.",
      idSchema,
      async ({ id }) => {
        await assertProject(context, id);
        return run<any>(DeleteProjectUseCaseToken).execute({ id });
      },
    ),
  };
}

async function getProvider(organizationId: string) {
  const db = createDb();
  const config = await db
    .select()
    .from(aiProviderConfig)
    .where(
      and(
        eq(aiProviderConfig.organizationId, organizationId),
        eq(aiProviderConfig.enabled, 1),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!config)
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

export async function testUpGalProvider(organizationId: string) {
  const provider = await getProvider(organizationId);
  const result = await generateText({
    model: provider.model,
    prompt: "Reply with OK.",
  });
  return { ok: true, model: provider.modelId, text: result.text };
}

export async function createUpGalResponse(
  context: UpGalContext,
  uiMessages: unknown[],
  request: Request,
) {
  const provider = await getProvider(context.organizationId);
  const runId = context.runId || randomUUID();
  const db = createDb();
  await db.insert(aiRun).values({
    id: runId,
    conversationId: context.conversationId,
    organizationId: context.organizationId,
    userId: context.userId,
    model: provider.modelId,
    status: "running",
  });

  const agent = new ToolLoopAgent({
    id: "upgal",
    model: provider.model,
    instructions: `You are UpGal, Upstand's operations assistant. Be precise, transparent, and concise. You may inspect organization resources automatically. Every mutation requires user approval. Never invent IDs or claim an action completed until the tool returns success. The active organization is ${context.organizationId}.`,
    tools: createUpGalTools(context),
    stopWhen: stepCountIs(12),
    runtimeContext: context,
    onStepEnd: async ({ stepNumber }) => {
      await db
        .update(aiRun)
        .set({ stepCount: stepNumber + 1 })
        .where(eq(aiRun.id, runId));
    },
    onFinish: async () => {
      await db
        .update(aiRun)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(aiRun.id, runId));
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
  messages: Array<{ id?: string; role?: string; parts?: unknown[] }>,
) {
  const db = createDb();
  for (const message of messages) {
    if (!message.parts || !message.role) continue;
    await db
      .insert(aiMessage)
      .values({
        id: message.id || randomUUID(),
        conversationId,
        role: message.role,
        parts: message.parts,
      })
      .onConflictDoNothing();
  }
  await db
    .update(aiConversation)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversation.id, conversationId));
}

export async function getConversationForUser(
  conversationId: string,
  organizationId: string,
  userId: string,
) {
  return createDb()
    .select()
    .from(aiConversation)
    .where(
      and(
        eq(aiConversation.id, conversationId),
        eq(aiConversation.organizationId, organizationId),
        eq(aiConversation.userId, userId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function listConversations(
  organizationId: string,
  userId: string,
) {
  return createDb()
    .select()
    .from(aiConversation)
    .where(
      and(
        eq(aiConversation.organizationId, organizationId),
        eq(aiConversation.userId, userId),
      ),
    )
    .orderBy(desc(aiConversation.updatedAt))
    .limit(50);
}
