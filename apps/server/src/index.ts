import { randomUUID } from "node:crypto";
import type { ServiceScope } from "@circulo-ai/di";
import { trpcServer } from "@hono/trpc-server";
import { ensureOrganizationAccess } from "@upstand/api/access-control";
import {
  createUpGalResponse,
  createUpGalTools,
  executeUpGalReadTool,
  getConversationForUser,
  isUpGalToolName,
  saveIncomingMessages,
  UPGAL_TOOL_METADATA,
  type UpGalUIMessage,
} from "@upstand/api/ai/upgal";
import {
  authenticateApiKey,
  setApiKeyRateLimitHeaders,
} from "@upstand/api/api-key-auth";
import { createContext } from "@upstand/api/context";
import { serviceProvider } from "@upstand/api/di";
import { appRouter } from "@upstand/api/routers/index";
import { auth } from "@upstand/auth";
import { db } from "@upstand/db";
import * as authSchema from "@upstand/db/schema/auth";
import {
  type IUnitOfWork,
  isJsonObject,
  UnitOfWorkToken,
} from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { env } from "@upstand/env/server";
import { closeRedis, pingRedis, redis } from "@upstand/redis";
import { AIRepositoryToken } from "@upstand/repositories";
import {
  BackupRunWorker,
  DeploymentWorker,
  getDockerInstance,
  NotificationDeliveryWorker,
  QueueDeploymentUseCase,
  reconcileQueuedJobs,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CreateGitProviderUseCaseToken,
  GetUpdateStatusUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  TriggerUpdateUseCaseToken,
} from "@upstand/usecases/tokens";
import { validateUIMessages } from "ai";
import { count } from "drizzle-orm";
import { initLogger, log } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { cors } from "hono/cors";
import { z } from "zod";
import { runDatabaseMigrations } from "./startup";
import { terminalBroker } from "./terminal-broker";

initLogger({
  env: { service: "upstand-server" },
});

await runDatabaseMigrations();

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: [
    "/api/auth/**",
    "/api/providers/github/setup",
    "/api/providers/gitlab/setup",
    "/api/providers/gitea/setup",
  ],
  maskEmail: true,
});

type AppEnv = EvlogVariables & {
  Variables: {
    scope: ServiceScope;
  };
};

const app = new Hono<AppEnv>();
const deploymentWorkers = new Map<string, DeploymentWorker>();
const notificationWorker = new NotificationDeliveryWorker(
  () => serviceProvider,
);
const backupWorker = new BackupRunWorker(() => serviceProvider);
const backupScheduler = serviceProvider.resolve(BackupSchedulerToken);
let deploymentWorkerRefresh: Promise<void> | null = null;
let workerRefreshInterval: ReturnType<typeof setInterval> | null = null;
let queueReconcileInterval: ReturnType<typeof setInterval> | null = null;
let dockerCleanupTimer: ReturnType<typeof setInterval> | null = null;
let autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
let autoUpdateInFlight = false;
let shuttingDown = false;
let caddyReady = false;

app.use(evlog());

app.use("*", async (c, next) => {
  const scope = serviceProvider.createScope();
  c.set("scope", scope);
  try {
    await next();
  } finally {
    await scope.dispose();
  }
});

app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.post("/api/terminal/session", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    organizationId?: string;
    sshKeyId?: string;
    username?: string;
    port?: number;
  } | null;
  if (!body?.organizationId || !body.sshKeyId) {
    return c.json({ error: "Organization and SSH key are required" }, 400);
  }

  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
  const membership = await ensureOrganizationAccess(
    session.user.id,
    body.organizationId,
  );
  if (membership?.role !== "owner") {
    return c.json(
      { error: "Only organization owners can open a server terminal" },
      403,
    );
  }

  const [key, settings] = await Promise.all([
    uow.sshKeyRepository.findById(body.sshKeyId),
    uow.webServerSettingsRepository.findGlobal(),
  ]);
  if (!key || key.organizationId !== body.organizationId) {
    return c.json({ error: "SSH key was not found in this organization" }, 404);
  }
  if (!settings?.serverIp) {
    return c.json(
      { error: "Set the control-plane server IP before opening a terminal" },
      409,
    );
  }

  const privateKey = decryptSecret({
    ciphertext: key.privateKeyCiphertext,
    iv: key.privateKeyIv,
    authTag: key.privateKeyAuthTag,
    keyVersion: key.privateKeyVersion,
  });
  const token = terminalBroker.create({
    userId: session.user.id,
    host: settings.serverIp,
    port: body.port && Number.isInteger(body.port) ? body.port : 22,
    username: body.username?.trim() || "root",
    privateKey,
  });
  return c.json({ token, expiresIn: 60 });
});

app.get(
  "/api/terminal/connect",
  upgradeWebSocket((c) => {
    const token = c.req.query("token");
    return {
      onOpen: async (_event, ws) => {
        if (!token) {
          ws.close(1008, "Missing terminal token");
          return;
        }
        try {
          await terminalBroker.connect(
            token,
            (data) =>
              ws.send(
                data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength,
                ) as ArrayBuffer,
              ),
            (message) => ws.close(1000, message),
          );
        } catch (error) {
          ws.close(
            1011,
            error instanceof Error
              ? error.message
              : "Terminal connection failed",
          );
        }
      },
      onMessage: (event) => {
        if (token && typeof event.data === "string")
          terminalBroker.write(token, event.data);
      },
      onClose: () => {
        if (token) terminalBroker.close(token);
      },
    };
  }),
);

// Public, tokenized deployment hook used by GitHub Actions and external CI.
// The token contains only the resource id; authorization is completed by the
// resource's persisted autoDeploy setting before anything is queued.
app.post("/api/deploy/:token", async (c) => {
  const token = c.req.param("token");
  if (!token?.startsWith("rc-") || token.length <= 3) {
    return c.json({ error: "Invalid deployment webhook" }, 404);
  }
  const resourceId = token.slice(3);
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
  const resource = await uow.resourceRepository.findById(resourceId);
  if (!resource) return c.json({ error: "Resource not found" }, 404);

  let autoDeploy = false;
  try {
    const credentials = JSON.parse(resource.credentials || "{}");
    autoDeploy = credentials?.autoDeploy === true;
  } catch {
    autoDeploy = false;
  }
  if (!autoDeploy) {
    return c.json({ error: "Automatic deployment is disabled" }, 403);
  }

  const payload = await c.req.json().catch(() => ({}));
  const branch =
    typeof payload?.ref === "string" ? payload.ref : payload?.branch;
  const title = branch
    ? `Webhook deployment (${String(branch).slice(0, 120)})`
    : "Webhook deployment";
  try {
    const queued = await new QueueDeploymentUseCase(uow).execute({
      resourceId,
      title,
    });
    return c.json({ accepted: true, resourceId, status: queued.status }, 202);
  } catch (error) {
    log.error({
      message: "Failed to queue deployment webhook",
      resourceId,
      err: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Unable to queue deployment" }, 500);
  }
});

// This endpoint deliberately exposes only whether an owner exists. It lets the
// web app provide a deterministic first-run flow without leaking user details.
app.get("/api/setup/status", async (c) => {
  const result = await db.select({ value: count() }).from(authSchema.user);
  const userCount = result[0]?.value ?? 0;
  return c.json({ needsOwnerSetup: userCount === 0 });
});

app.post("/api/ai/chat", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  const bodyResult = z
    .object({
      organizationId: z.string().min(1),
      conversationId: z.string().min(1).optional(),
      messages: z.unknown(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!bodyResult.success)
    return c.json({ error: "Invalid UpGal request" }, 400);
  const body = bodyResult.data;
  await ensureOrganizationAccess(session.user.id, body.organizationId);
  const conversationId = body.conversationId || randomUUID();
  const ownedConversation = await getConversationForUser(
    conversationId,
    body.organizationId,
    session.user.id,
    c.get("scope").resolve(AIRepositoryToken),
  );
  if (body.conversationId && !ownedConversation)
    return c.json({ error: "Conversation not found" }, 404);
  if (!ownedConversation)
    await c.get("scope").resolve(AIRepositoryToken).createConversation({
      id: conversationId,
      organizationId: body.organizationId,
      userId: session.user.id,
      context: {},
    });
  const context = {
    organizationId: body.organizationId,
    userId: session.user.id,
    conversationId,
    runId: randomUUID(),
    scope: c.get("scope"),
  };
  const tools = createUpGalTools(context);
  let messages: UpGalUIMessage[];
  try {
    messages = await validateUIMessages<UpGalUIMessage>({
      messages: body.messages,
      tools,
    });
  } catch {
    return c.json({ error: "Invalid UpGal messages" }, 400);
  }
  await saveIncomingMessages(
    conversationId,
    messages,
    c.get("scope").resolve(AIRepositoryToken),
  );
  return createUpGalResponse(context, messages, c.req.raw);
});

app.all("/api/mcp", async (c) => {
  const authorization = c.req.header("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const key = token
    ? await authenticateApiKey(new Headers({ "x-api-key": token }))
    : null;
  if (!key) return c.json({ error: "Invalid or expired API key" }, 401);
  setApiKeyRateLimitHeaders(key, (name, value) => c.header(name, value));
  const bodyResult = z
    .object({
      id: z.union([z.string(), z.number(), z.null()]).optional(),
      method: z.string(),
      params: z.record(z.string(), z.json()).optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!bodyResult.success)
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid MCP request" },
      },
      400,
    );
  const body = bodyResult.data;
  const id = body.id ?? null;
  if (body.method === "initialize")
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "upstand-upgal", version: "1.0.0" },
      },
    });
  if (body.method === "tools/list")
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: UPGAL_TOOL_METADATA.filter(
          ([name]) =>
            key.permissions.mcp.includes("*") ||
            key.permissions.mcp.includes("read") ||
            key.permissions.mcp.includes(`tool:${name}`),
        ).map(([name, description, mutation]) => ({
          name,
          description,
          annotations: { destructiveHint: mutation, readOnlyHint: !mutation },
        })),
      },
    });
  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    if (typeof name !== "string" || !isJsonObject(args))
      return c.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Tool name and object arguments are required",
          },
        },
        400,
      );
    const metadata = UPGAL_TOOL_METADATA.find(
      ([toolName]) => toolName === name,
    );
    if (
      !metadata ||
      !isUpGalToolName(name) ||
      !(
        key.permissions.mcp.includes("*") ||
        key.permissions.mcp.includes("read") ||
        key.permissions.mcp.includes(`tool:${name}`)
      )
    )
      return c.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: "Tool is not available for this API key",
        },
      });
    if (metadata[2])
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: "Mutating MCP tools must be approved through the UpGal dashboard.",
            },
          ],
        },
      });
    const result = await executeUpGalReadTool(name, args, {
      organizationId: key.organizationId,
      userId: key.userId,
      conversationId: randomUUID(),
      runId: randomUUID(),
      scope: c.get("scope"),
    });
    return c.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: JSON.stringify(result) }] },
    });
  }
  return c.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    },
    404,
  );
});

app.get("/api/providers/github/setup", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const installationId = c.req.query("installation_id");

  if (!code) {
    return c.json({ error: "Missing code parameter" }, 400);
  }

  const [action, ...rest] = (state || "").split(":");
  const scope = c.get("scope");

  if (action === "gh_init") {
    const organizationId = rest[0];
    if (!organizationId) {
      return c.json({ error: "Missing organizationId in state" }, 400);
    }

    try {
      const res = await fetch(
        `https://api.github.com/app-manifests/${code}/conversions`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Upstand",
          },
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        return c.text(`GitHub App conversion failed: ${errorText}`, 500);
      }

      const data = (await res.json()) as {
        name: string;
        html_url: string;
        id: number;
        client_id: string;
        client_secret: string;
        webhook_secret: string;
        pem: string;
      };

      const configObj = {
        githubAppId: data.id,
        githubClientId: data.client_id,
        githubClientSecret: data.client_secret,
        githubWebhookSecret: data.webhook_secret,
        githubPrivateKey: data.pem,
        githubAppName: data.html_url,
      };

      const createUseCase = scope.resolve(CreateGitProviderUseCaseToken);
      await createUseCase.execute({
        organizationId,
        name: data.name,
        provider: "github",
        config: JSON.stringify(configObj),
      });
    } catch (err: any) {
      return c.text(
        `Internal Server Error during GitHub setup: ${err.message}`,
        500,
      );
    }
  } else if (action === "gh_setup") {
    const gitProviderId = rest[0];
    if (!gitProviderId) {
      return c.json({ error: "Missing gitProviderId in state" }, 400);
    }

    try {
      const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const provider = await uow.gitProviderRepository.findById(gitProviderId);
      if (!provider) {
        return c.text("Git Provider not found", 404);
      }

      const configObj = JSON.parse(provider.config);
      configObj.githubInstallationId = installationId;

      await uow.gitProviderRepository.updateById(gitProviderId, {
        config: JSON.stringify(configObj),
      });
    } catch (err: any) {
      return c.text(
        `Internal Server Error during GitHub installation update: ${err.message}`,
        500,
      );
    }
  }

  return c.redirect(`${env.CORS_ORIGIN}/git-providers`, 307);
});

app.get("/api/providers/gitlab/setup", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const scope = c.get("scope");
  try {
    const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
    const provider = await uow.gitProviderRepository.findById(state);
    if (!provider) {
      return c.text("Git Provider not found", 404);
    }

    const configObj = JSON.parse(provider.config);
    const redirectUri = `${env.BETTER_AUTH_URL.replace(/\/api\/auth\/?$/, "")}/api/providers/gitlab/setup`;

    const res = await fetch(`${configObj.gitlabUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: configObj.applicationId,
        client_secret: configObj.secret,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return c.text(`GitLab OAuth exchange failed: ${errorText}`, 500);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    configObj.accessToken = data.access_token;
    configObj.refreshToken = data.refresh_token;
    configObj.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

    await uow.gitProviderRepository.updateById(provider.id, {
      config: JSON.stringify(configObj),
    });
  } catch (err: any) {
    return c.text(
      `Internal Server Error during GitLab setup: ${err.message}`,
      500,
    );
  }

  return c.redirect(`${env.CORS_ORIGIN}/git-providers`, 307);
});

app.get("/api/providers/gitea/setup", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const scope = c.get("scope");
  try {
    const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
    const provider = await uow.gitProviderRepository.findById(state);
    if (!provider) {
      return c.text("Git Provider not found", 404);
    }

    const configObj = JSON.parse(provider.config);
    const redirectUri = `${env.BETTER_AUTH_URL.replace(/\/api\/auth\/?$/, "")}/api/providers/gitea/setup`;

    const res = await fetch(`${configObj.giteaUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: configObj.clientId,
        client_secret: configObj.clientSecret,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return c.text(`Gitea OAuth exchange failed: ${errorText}`, 500);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    configObj.accessToken = data.access_token;
    configObj.refreshToken = data.refresh_token || "";
    configObj.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

    await uow.gitProviderRepository.updateById(provider.id, {
      config: JSON.stringify(configObj),
    });
  } catch (err: any) {
    return c.text(
      `Internal Server Error during Gitea setup: ${err.message}`,
      500,
    );
  }

  return c.redirect(`${env.CORS_ORIGIN}/git-providers`, 307);
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/health/live", (c) => {
  return c.json({ status: "alive" });
});

app.get("/health/ready", async (c) => {
  const workersReady =
    deploymentWorkers.size > 0 &&
    [...deploymentWorkers.values()].every((worker) => worker.isReady()) &&
    notificationWorker.isReady() &&
    backupWorker.isReady() &&
    backupScheduler.isReady();
  const redisReady = await pingRedis(redis);
  let databaseReady = false;
  try {
    const uow = c.get("scope").resolve(UnitOfWorkToken) as IUnitOfWork;
    await uow.resourceRepository.count();
    databaseReady = true;
  } catch (error) {
    log.error({
      message: "Database readiness check failed",
      err: error instanceof Error ? error.message : String(error),
    });
  }

  const ready =
    !shuttingDown && caddyReady && workersReady && redisReady && databaseReady;
  return c.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        database: databaseReady,
        caddy: caddyReady,
        redis: redisReady,
        workers: workersReady,
      },
    },
    ready ? 200 : 503,
  );
});

app.get("/", (c) => {
  return c.text("OK");
});

// Initialize Caddy Web Server on Startup
const caddyInitScope = serviceProvider.createScope();
const getCaddySettingsUseCase = caddyInitScope.resolve(
  GetWebServerSettingsUseCaseToken,
);
getCaddySettingsUseCase
  .execute()
  .then(() => {
    caddyReady = true;
    log.info({ message: "Caddy Web Server initialized successfully. ✅" });
  })
  .catch((err) =>
    log.error({
      message: "Failed to initialize Caddy Web Server",
      err: err.message || err,
    }),
  )
  .finally(() => caddyInitScope.dispose());

async function discoverDeploymentServerIds(): Promise<string[]> {
  if (process.env.SERVER_ID) return [process.env.SERVER_ID];

  const serverIds = new Set<string>();
  const scope = serviceProvider.createScope();
  try {
    const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
    const settings = await uow.serverBuildSettingsRepository.findMany();
    for (const setting of settings) serverIds.add(setting.id);
  } finally {
    await scope.dispose();
  }

  const docker = getDockerInstance();
  try {
    const info = await docker.info();
    if (info.Swarm?.LocalNodeState === "active") {
      const nodes = await docker.listNodes();
      for (const node of nodes) {
        if (node.ID) serverIds.add(node.ID);
      }
    }
  } catch (error) {
    log.warn({
      message: "Unable to discover Docker nodes for deployment workers",
      err: error instanceof Error ? error.message : String(error),
    });
  }

  if (serverIds.size === 0) serverIds.add("local");
  return [...serverIds];
}

async function refreshDeploymentWorkers(): Promise<void> {
  if (deploymentWorkerRefresh) return deploymentWorkerRefresh;

  deploymentWorkerRefresh = (async () => {
    const serverIds = await discoverDeploymentServerIds();
    for (const serverId of serverIds) {
      if (deploymentWorkers.has(serverId)) continue;
      const worker = new DeploymentWorker(serverId, () => serviceProvider);
      await worker.start();
      deploymentWorkers.set(serverId, worker);
      log.info({
        message: "Deployment queue worker started",
        serverId,
        queueConsumers: deploymentWorkers.size,
      });
    }
  })();

  try {
    await deploymentWorkerRefresh;
  } finally {
    deploymentWorkerRefresh = null;
  }
}

async function reconcileQueues(): Promise<void> {
  const scope = serviceProvider.createScope();
  try {
    const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
    const restored = await reconcileQueuedJobs(uow);
    if (
      restored.backups > 0 ||
      restored.deployments > 0 ||
      restored.notifications > 0
    ) {
      log.info({
        message: "Queued database records reconciled with BullMQ",
        restored,
      });
    }
  } finally {
    await scope.dispose();
  }
}

await refreshDeploymentWorkers();
await notificationWorker.start();
await backupWorker.start();
await backupScheduler.start();
await reconcileQueues();
log.info({ message: "Background job workers and schedulers started" });

// Opt-in release-channel updates. Source installs and canary builds are never
// updated silently; operators can still use the explicit UI action for those.
if (process.env.UPSTAND_AUTO_UPDATE === "true") {
  const checkAndApplyUpdate = async () => {
    if (
      autoUpdateInFlight ||
      process.env.UPSTAND_SERVER_IMAGE?.includes(":source-")
    )
      return;
    autoUpdateInFlight = true;
    const scope = serviceProvider.createScope();
    try {
      const status = await scope.resolve(GetUpdateStatusUseCaseToken).execute();
      if (
        status.channel === "stable" &&
        status.updateAvailable &&
        status.canUpdate
      ) {
        log.info({
          message: `Automatic update found ${status.latestVersion}; starting rollout`,
          currentVersion: status.currentVersion,
        });
        await scope
          .resolve(TriggerUpdateUseCaseToken)
          .execute({ version: status.latestVersion });
      }
    } catch (error) {
      log.error({
        message: "Automatic update check failed",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      autoUpdateInFlight = false;
      await scope.dispose();
    }
  };
  autoUpdateTimer = setInterval(() => void checkAndApplyUpdate(), 30 * 60_000);
  autoUpdateTimer.unref?.();
  setTimeout(() => void checkAndApplyUpdate(), 120_000).unref?.();
  log.info({ message: "Opt-in automatic release updates enabled" });
}

workerRefreshInterval = setInterval(
  () =>
    void refreshDeploymentWorkers().catch((error) => {
      log.error({
        message: "Failed to refresh deployment queue workers",
        err: error instanceof Error ? error.message : String(error),
      });
    }),
  60_000,
);
workerRefreshInterval.unref?.();

queueReconcileInterval = setInterval(
  () =>
    void reconcileQueues().catch((error) => {
      log.error({
        message: "Failed to reconcile queued database records",
        err: error instanceof Error ? error.message : String(error),
      });
    }),
  30_000,
);
queueReconcileInterval.unref?.();

// Daily Docker Cleanup Scheduler
dockerCleanupTimer = setInterval(
  async () => {
    const scope = serviceProvider.createScope();
    try {
      const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const settings = await uow.webServerSettingsRepository.findGlobal();
      if (settings?.dailyDockerCleanup) {
        const now = new Date();
        if (now.getHours() === 3) {
          log.info({ message: "Running scheduled daily Docker cleanup... 🧹" });
          const { exec } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execAsync = promisify(exec);
          await execAsync(
            "docker container prune --force && docker image prune --all --force && docker volume prune --all --force && docker builder prune --all --force && docker system prune --all --force",
          );
          const publisher = scope.resolve(
            Symbol.for("PublishNotificationUseCase"),
          ) as {
            execute: (input: {
              event: "docker_cleanup_completed";
              idempotencyKey: string;
              title: string;
              message: string;
            }) => Promise<number>;
          };
          await publisher
            .execute({
              event: "docker_cleanup_completed",
              idempotencyKey: `docker-cleanup:${now.toISOString().slice(0, 10)}`,
              title: "Daily Docker cleanup completed",
              message:
                "Upstand completed the scheduled cleanup of unused Docker resources.",
            })
            .catch((notificationError) => {
              log.error({
                message: "Unable to queue Docker cleanup notification",
                err:
                  notificationError instanceof Error
                    ? notificationError.message
                    : notificationError,
              });
            });
          log.info({
            message: "Daily Docker cleanup completed successfully. ✅",
          });
        }
      }
    } catch (err: any) {
      log.error({
        message: "Failed to run scheduled daily Docker cleanup",
        err: err.message || err,
      });
    } finally {
      scope.dispose();
    }
  },
  60 * 60 * 1000,
); // Check once every hour
dockerCleanupTimer.unref?.();

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ message: "Graceful shutdown started", signal });

  if (workerRefreshInterval) clearInterval(workerRefreshInterval);
  if (queueReconcileInterval) clearInterval(queueReconcileInterval);
  if (dockerCleanupTimer) clearInterval(dockerCleanupTimer);
  if (autoUpdateTimer) clearInterval(autoUpdateTimer);

  const drain = Promise.allSettled([
    ...[...deploymentWorkers.values()].map((worker) => worker.stop()),
    notificationWorker.stop(),
    backupWorker.stop(),
    backupScheduler.stop(),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), 270_000);
    timeout.unref?.();
  });

  const result = await Promise.race([drain, timedOut]);
  if (timeout) clearTimeout(timeout);
  if (result === "timeout") {
    log.error({
      message: "Worker shutdown exceeded grace period; forcing exit",
      signal,
    });
  }
  await closeRedis(redis);
  log.info({ message: "Graceful shutdown completed", signal });
  process.exit(result === "timeout" ? 1 : 0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

// Export the Bun server configuration so the runtime starts exactly one
// listener. Calling Bun.serve here as well would make the compiled bundle
// attempt to bind port 3000 twice.
export default {
  port: Number(process.env.PORT || 3000),
  fetch: (request: Request, bunServer: Bun.Server<unknown>) =>
    app.fetch(request, { server: bunServer }),
  websocket,
};
