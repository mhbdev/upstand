import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ServiceScope } from "@circulo-ai/di";
import { trpcServer } from "@hono/trpc-server";
import { getRateLimiterHealth } from "@upstand/api";
import { ensureOrganizationAccess } from "@upstand/api/access-control";
import {
  createUpGalResponse,
  createUpGalTools,
  executeUpGalReadTool,
  getConversationForUser,
  getUpGalToolNamesForUser,
  isUpGalToolName,
  saveIncomingMessages,
  UPGAL_TOOL_CAPABILITIES,
  UPGAL_TOOL_METADATA,
  type UpGalUIMessage,
  validateAndRecoverUpGalMessages,
} from "@upstand/api/ai/upgal";
import { classifyUpGalError } from "@upstand/api/ai/upgal-errors";
import { UpGalPageContextSchema } from "@upstand/api/ai/upgal-page-context";
import {
  authenticateApiKey,
  setApiKeyRateLimitHeaders,
} from "@upstand/api/api-key-auth";
import { auth } from "@upstand/api/auth";
import { type ApiBindings, createContext } from "@upstand/api/context";
import { getServiceProvider } from "@upstand/api/di";
import { checkPermission } from "@upstand/api/permissions";
import { appRouter } from "@upstand/api/routers/index";
import { closeDb, db } from "@upstand/db";
import * as authSchema from "@upstand/db/schema/auth";
import { scimProvider } from "@upstand/db/schema/scim";
import { hasApiKeyPermission, isJsonObject } from "@upstand/domain";
import { env } from "@upstand/env/server";
import { CaddyService, getDockerInstance } from "@upstand/infrastructure";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { closeRedis, pingRedis, redis } from "@upstand/redis";
import { AIRepositoryToken } from "@upstand/repositories/tokens";
import {
  AccessLogCleanupScheduler,
  assertSafeProviderUrl,
  BackupRunWorker,
  gitProviderOAuthStateKey,
  hashWebhookToken,
  matchesDockerImageWebhook,
  NotificationDeliveryWorker,
  ProcessSourceWebhookUseCase,
  parseGitProviderOAuthState,
  parseResourceCredentials,
  QueueDeploymentUseCase,
  UploadDockerContainerInputSchema,
  UploadDockerVolumeInputSchema,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CaddyServiceToken,
  CreateGitProviderUseCaseToken,
  DeliverNotificationUseCaseToken,
  GeneralSchedulerToken,
  GetDockerInventoryUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  PublishNotificationUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { and, count, eq } from "drizzle-orm";
import { initLogger, log } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { createFsDrain } from "evlog/fs";
import { type EvlogVariables, evlog } from "evlog/hono";
import { type Context, Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { cors } from "hono/cors";
import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { z } from "zod";
import {
  ApplicationArchiveValidationError,
  extractApplicationArchive,
} from "./application-archive";
import { AutoUpdateRuntime } from "./auto-update-runtime";
import { createBackupRunHandler } from "./backup-runtime";
import {
  containerBelongsToResource,
  isValidContainerIdentifier,
  matchesContainerIdentifier,
} from "./container-ownership";
import { DeploymentRuntime } from "./deployment-runtime";
import { ScheduledDockerCleanup } from "./docker-cleanup-scheduler";
import { initializeMonitoring } from "./monitoring-agent";
import {
  openApiDocument,
  openApiRouter,
  serveSwaggerUiAsset,
  swaggerUiHtml,
} from "./openapi";
import { OutboxRuntime } from "./outbox-runtime";
import {
  configureManagedUserProvisioning,
  runDatabaseMigrations,
} from "./startup";
import { isStepUpAuthenticationSatisfied } from "./step-up-auth";
import { matchesTerminalSession, terminalBroker } from "./terminal-broker";

initLogger({
  env: { service: "upstand-server" },
  drain: createFsDrain({ maxFiles: 7 }),
});

await runDatabaseMigrations();
await configureManagedUserProvisioning();

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: [
    "/api/auth/**",
    "/api/providers/github/setup",
    "/api/providers/gitlab/setup",
    "/api/providers/gitea/setup",
    "/api/scim/**",
  ],
  maskEmail: true,
});

type AppEnv = EvlogVariables & {
  Bindings: ApiBindings;
  Variables: {
    scope: ServiceScope;
  };
};

const app = new Hono<AppEnv>();
const deploymentRuntime = new DeploymentRuntime();
const outboxRuntime = new OutboxRuntime();
const notificationWorker = new NotificationDeliveryWorker(
  async (deliveryId) => {
    const scope = getServiceProvider().createScope();
    try {
      await scope.resolve(DeliverNotificationUseCaseToken).execute(deliveryId);
    } finally {
      await scope.dispose();
    }
  },
);
const backupWorker = new BackupRunWorker(
  createBackupRunHandler(() => getServiceProvider()),
);
const backupScheduler = getServiceProvider().resolve(BackupSchedulerToken);
const generalScheduler = getServiceProvider().resolve(GeneralSchedulerToken);
const accessLogCleanupScheduler = new AccessLogCleanupScheduler(
  async () => {
    const scope = getServiceProvider().createScope();
    try {
      const settings = await scope
        .resolve(UnitOfWorkToken)
        .webServerSettingsRepository.findGlobal();
      return {
        enabled: settings?.accessLogsEnabled ?? false,
        cronExpression: settings?.accessLogCleanupCron ?? "0 3 * * *",
      };
    } finally {
      await scope.dispose();
    }
  },
  async () => {
    const scope = getServiceProvider().createScope();
    try {
      await scope.resolve(CaddyServiceToken).cleanupAccessLogs();
    } finally {
      await scope.dispose();
    }
  },
);
const scheduledDockerCleanup = new ScheduledDockerCleanup();
const autoUpdateRuntime = new AutoUpdateRuntime();
let shuttingDown = false;
let caddyReady = false;

function getDashboardUrl(path: string): string {
  return new URL(path, env.CORS_ORIGIN).toString();
}

app.use(evlog());

app.use("*", async (c, next) => {
  const scope = getServiceProvider().createScope();
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
    origin: (origin, c) => {
      if (!origin) return undefined;

      // Trust the configured CORS_ORIGIN
      if (origin === env.CORS_ORIGIN) return origin;

      try {
        const originUrl = new URL(origin);
        // Trust loopback / localhost origins for development ease
        if (
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1" ||
          originUrl.hostname === "::1" ||
          originUrl.hostname === "[::1]" ||
          originUrl.hostname.startsWith("127.")
        ) {
          return origin;
        }

        // Trust if it's the same host as the Hono request (same domain/IP, just different port)
        const requestUrl = new URL(c.req.url);
        if (originUrl.hostname === requestUrl.hostname) {
          return origin;
        }

        // Also trust if it matches the hostname of the configured CORS_ORIGIN
        const configuredCorsUrl = new URL(env.CORS_ORIGIN);
        if (originUrl.hostname === configuredCorsUrl.hostname) {
          return origin;
        }
      } catch {
        // Fallback
      }

      return env.CORS_ORIGIN;
    },
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
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
  if (!(await isStepUpAuthenticationSatisfied(session))) {
    return c.json({ error: "2FA verification required" }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    organizationId?: string;
    sshKeyId?: string;
    username?: string;
    port?: number;
  } | null;
  if (!body?.organizationId || !body.sshKeyId) {
    return c.json({ error: "Organization and SSH key are required" }, 400);
  }
  if (
    body.port !== undefined &&
    (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535)
  ) {
    return c.json({ error: "SSH port must be between 1 and 65535" }, 400);
  }

  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);
  try {
    await checkPermission(
      session.user.id,
      body.organizationId,
      "server:update",
    );
  } catch {
    return c.json({ error: "Server terminal permission is required" }, 403);
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
  const controlPlaneFingerprint =
    process.env.UPSTAND_CONTROL_PLANE_SSH_HOST_KEY_FINGERPRINT;
  if (!controlPlaneFingerprint) {
    return c.json(
      {
        error: "Configure the trusted control-plane SSH host fingerprint first",
      },
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
    sessionId: session.session.id,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    host: settings.serverIp,
    port: body.port && Number.isInteger(body.port) ? body.port : 22,
    username: body.username?.trim() || "root",
    privateKey,
    hostKeyFingerprint: controlPlaneFingerprint,
  });
  return c.json({ token, expiresIn: 60 });
});

app.post("/api/container-terminal/session", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  if (!(await isStepUpAuthenticationSatisfied(session))) {
    return c.json({ error: "2FA verification required" }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    organizationId?: string;
    resourceId?: string;
    containerId?: string;
    sshKeyId?: string;
  } | null;
  if (!body?.organizationId || !body.resourceId || !body.containerId) {
    return c.json(
      { error: "Organization, resource, container, and SSH key are required" },
      400,
    );
  }
  const containerId = body.containerId;
  if (!isValidContainerIdentifier(containerId)) {
    return c.json({ error: "Invalid container identifier" }, 400);
  }

  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);
  const resource = await uow.resourceRepository.findById(body.resourceId);
  if (!resource) return c.json({ error: "Resource not found" }, 404);
  const environment = await uow.environmentRepository.findById(
    resource.environmentId,
  );
  const project = environment
    ? await uow.projectRepository.findById(environment.projectId)
    : null;
  if (!project || project.organizationId !== body.organizationId) {
    return c.json({ error: "Resource is not part of this organization" }, 403);
  }
  try {
    await checkPermission(
      session.user.id,
      body.organizationId,
      "resource:update",
    );
  } catch {
    return c.json({ error: "Resource terminal permission is required" }, 403);
  }
  const targetServerId =
    resource.serverId && !["local", "manager"].includes(resource.serverId)
      ? resource.serverId
      : "local";
  let containers: unknown;
  try {
    containers = await scope.resolve(GetDockerInventoryUseCaseToken).execute({
      organizationId: body.organizationId,
      serverId: targetServerId,
      kind: "containers",
      tail: 150,
    });
  } catch {
    return c.json(
      { error: "Unable to verify the selected container on its Docker target" },
      409,
    );
  }
  const selectedContainer = Array.isArray(containers)
    ? containers.find((container) => {
        if (
          typeof container !== "object" ||
          container === null ||
          typeof (container as { id?: unknown }).id !== "string" ||
          !Array.isArray((container as { labels?: unknown }).labels)
        ) {
          return false;
        }
        const candidate = container as { id: string; labels: string[] };
        return (
          matchesContainerIdentifier(containerId, candidate.id) &&
          containerBelongsToResource(candidate, resource)
        );
      })
    : undefined;
  if (!selectedContainer) {
    return c.json({ error: "Container is not part of this resource" }, 404);
  }
  let host = "127.0.0.1";
  let port = 22;
  let username = "root";
  let privateKey: string;
  let hostKeyFingerprint: string;
  if (resource.serverId && !["local", "manager"].includes(resource.serverId)) {
    const server = await uow.serverRepository.findById(resource.serverId);
    if (!server || server.organizationId !== body.organizationId) {
      return c.json({ error: "Deployment server not found" }, 404);
    }
    host = server.ipAddress;
    port = server.port;
    username = server.username;
    const key = server.sshKeyId
      ? await uow.sshKeyRepository.findById(server.sshKeyId)
      : null;
    if (!key) return c.json({ error: "Deployment server has no SSH key" }, 409);
    if (!server.sshHostKeyFingerprint) {
      return c.json(
        { error: "Trust the deployment server SSH host key first" },
        409,
      );
    }
    privateKey = decryptSecret({
      ciphertext: key.privateKeyCiphertext,
      iv: key.privateKeyIv,
      authTag: key.privateKeyAuthTag,
      keyVersion: key.privateKeyVersion,
    });
    hostKeyFingerprint = server.sshHostKeyFingerprint;
  } else {
    if (!body.sshKeyId) {
      return c.json(
        { error: "An SSH key is required for the control-plane terminal" },
        400,
      );
    }
    const [key, settings] = await Promise.all([
      uow.sshKeyRepository.findById(body.sshKeyId),
      uow.webServerSettingsRepository.findGlobal(),
    ]);
    if (!key || key.organizationId !== body.organizationId) {
      return c.json(
        { error: "SSH key was not found in this organization" },
        404,
      );
    }
    if (!settings?.serverIp) {
      return c.json(
        { error: "Control-plane server IP is not configured" },
        409,
      );
    }
    host = settings.serverIp;
    privateKey = decryptSecret({
      ciphertext: key.privateKeyCiphertext,
      iv: key.privateKeyIv,
      authTag: key.privateKeyAuthTag,
      keyVersion: key.privateKeyVersion,
    });
    hostKeyFingerprint =
      process.env.UPSTAND_CONTROL_PLANE_SSH_HOST_KEY_FINGERPRINT || "";
    if (!hostKeyFingerprint) {
      return c.json(
        {
          error:
            "Configure the trusted control-plane SSH host fingerprint first",
        },
        409,
      );
    }
  }

  const token = terminalBroker.create({
    userId: session.user.id,
    sessionId: session.session.id,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    host,
    port,
    username,
    privateKey,
    hostKeyFingerprint,
    command: `docker exec -it ${body.containerId} /bin/sh -lc 'exec /bin/sh || exec /bin/bash'`,
  });
  return c.json({ token, expiresIn: 60 });
});

app.post("/api/docker/terminal/session", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  if (!(await isStepUpAuthenticationSatisfied(session))) {
    return c.json({ error: "2FA verification required" }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    organizationId?: string;
    serverId?: string;
    containerId?: string;
    sshKeyId?: string;
  } | null;
  if (!body?.organizationId || !body.containerId) {
    return c.json({ error: "Organization and container are required" }, 400);
  }
  if (!isValidContainerIdentifier(body.containerId)) {
    return c.json({ error: "Invalid container identifier" }, 400);
  }

  try {
    await checkPermission(
      session.user.id,
      body.organizationId,
      "server:update",
    );
  } catch {
    return c.json({ error: "Docker terminal permission is required" }, 403);
  }
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);
  const serverId =
    body.serverId && body.serverId !== "local" ? body.serverId : undefined;
  let host: string;
  let port: number;
  let username: string;
  let privateKey: string;
  let hostKeyFingerprint: string;

  if (serverId) {
    const server = await uow.serverRepository.findById(serverId);
    if (!server || server.organizationId !== body.organizationId) {
      return c.json(
        { error: "Docker server is not part of this organization" },
        403,
      );
    }
    if (!server.sshKeyId) {
      return c.json({ error: "Docker server has no SSH key configured" }, 409);
    }
    if (!server.sshHostKeyFingerprint) {
      return c.json(
        { error: "Trust the Docker server SSH host key first" },
        409,
      );
    }
    const key = await uow.sshKeyRepository.findById(server.sshKeyId);
    if (!key)
      return c.json({ error: "Docker server SSH key was not found" }, 404);
    host = server.ipAddress;
    port = server.port;
    username = server.username;
    privateKey = decryptSecret({
      ciphertext: key.privateKeyCiphertext,
      iv: key.privateKeyIv,
      authTag: key.privateKeyAuthTag,
      keyVersion: key.privateKeyVersion,
    });
    hostKeyFingerprint = server.sshHostKeyFingerprint;
  } else {
    if (!body.sshKeyId) {
      return c.json({ error: "An SSH key is required for local Docker" }, 400);
    }
    const [key, settings] = await Promise.all([
      uow.sshKeyRepository.findById(body.sshKeyId),
      uow.webServerSettingsRepository.findGlobal(),
    ]);
    if (!key || key.organizationId !== body.organizationId) {
      return c.json(
        { error: "SSH key was not found in this organization" },
        404,
      );
    }
    if (!settings?.serverIp) {
      return c.json(
        { error: "Control-plane server IP is not configured" },
        409,
      );
    }
    host = settings.serverIp;
    port = 22;
    username = "root";
    privateKey = decryptSecret({
      ciphertext: key.privateKeyCiphertext,
      iv: key.privateKeyIv,
      authTag: key.privateKeyAuthTag,
      keyVersion: key.privateKeyVersion,
    });
    hostKeyFingerprint =
      process.env.UPSTAND_CONTROL_PLANE_SSH_HOST_KEY_FINGERPRINT || "";
    if (!hostKeyFingerprint) {
      return c.json(
        {
          error:
            "Configure the trusted control-plane SSH host fingerprint first",
        },
        409,
      );
    }
  }

  const containers = await scope
    .resolve(GetDockerInventoryUseCaseToken)
    .execute({
      organizationId: body.organizationId,
      serverId: body.serverId || "local",
      kind: "containers",
      tail: 150,
    });
  if (
    !Array.isArray(containers) ||
    !containers.some(
      (container) =>
        typeof container === "object" &&
        container !== null &&
        (container as { id?: string }).id === body.containerId,
    )
  ) {
    return c.json(
      { error: "Container was not found on the selected Docker target" },
      404,
    );
  }

  const token = terminalBroker.create({
    userId: session.user.id,
    sessionId: session.session.id,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    host,
    port,
    username,
    privateKey,
    hostKeyFingerprint,
    command: `docker exec -it ${body.containerId} /bin/sh -lc 'exec /bin/sh || exec /bin/bash'`,
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
            async (identity) => {
              const currentSession = await auth.api.getSession({
                headers: c.req.raw.headers,
              });
              if (!currentSession) return false;
              if (
                !matchesTerminalSession(identity, {
                  userId: currentSession.user.id,
                  sessionId: currentSession.session.id,
                  twoFactorEnabled:
                    currentSession.user.twoFactorEnabled === true,
                })
              ) {
                return false;
              }
              return isStepUpAuthenticationSatisfied(currentSession);
            },
          );
          ws.send(JSON.stringify({ type: "terminal.ready" }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Terminal connection failed";
          ws.send(JSON.stringify({ type: "terminal.error", message }));
          ws.close(1011, "Terminal connection failed");
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

// Webhook for receiving threshold alerts from Go Monitoring Agent.
app.post("/api/monitoring/alerts", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    json?: {
      serverId?: string;
      serverType?: string;
      type?: "CPU" | "Memory";
      value?: number;
      threshold?: number;
      message?: string;
      timestamp?: string;
      nonce?: string;
      signature?: string;
    };
  } | null;

  const alert = body?.json;
  if (
    !alert?.serverId ||
    !alert.nonce ||
    !alert.signature ||
    !alert.timestamp ||
    !alert.type
  ) {
    return c.json({ error: "Invalid monitoring alert signature payload" }, 400);
  }

  const {
    serverId,
    serverType,
    type,
    value,
    threshold,
    message,
    timestamp,
    nonce,
    signature,
  } = alert;

  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);

  const settings =
    await uow.monitoringSettingsRepository.findByServerId(serverId);

  if (!settings) {
    return c.json(
      { error: "Unauthorized: Invalid monitoring alert source" },
      401,
    );
  }

  const alertTime = Date.parse(timestamp);
  if (
    !Number.isFinite(alertTime) ||
    Math.abs(Date.now() - alertTime) > 5 * 60_000
  ) {
    return c.json({ error: "Monitoring alert signature expired" }, 401);
  }
  const canonical = [
    serverId,
    serverType ?? "",
    type,
    String(value ?? ""),
    String(threshold ?? ""),
    message ?? "",
    timestamp,
    nonce,
  ].join("|");
  const expectedSignature = createHmac("sha256", settings.token)
    .update(canonical)
    .digest("hex");
  const receivedSignature = Buffer.from(signature, "utf8");
  const expectedSignatureBytes = Buffer.from(expectedSignature, "utf8");
  if (
    receivedSignature.length !== expectedSignatureBytes.length ||
    !timingSafeEqual(receivedSignature, expectedSignatureBytes)
  ) {
    return c.json(
      { error: "Unauthorized: Invalid monitoring alert signature" },
      401,
    );
  }
  const acceptedNonce = await redis.set(
    `monitoring-alert:${serverId}:${nonce}`,
    "1",
    "EX",
    300,
    "NX",
  );
  if (acceptedNonce !== "OK") {
    return c.json({ error: "Monitoring alert has already been received" }, 401);
  }

  const serverRecord =
    settings.serverId === "local"
      ? null
      : await uow.serverRepository.findById(settings.serverId);
  if (settings.serverId !== "local" && !serverRecord) {
    return c.json({ error: "Associated server not found" }, 404);
  }

  const serverName = serverRecord?.name ?? "Local control plane";

  log.warn({
    message: `Server alert received: ${type} usage exceeded threshold`,
    serverId: settings.serverId,
    type,
    value,
    threshold,
  });

  const publisher = scope.resolve(PublishNotificationUseCaseToken);

  await publisher
    .execute({
      event: "server_threshold_alert",
      ...(serverRecord?.organizationId
        ? { organizationId: serverRecord.organizationId }
        : {}),
      idempotencyKey: `alert:${settings.serverId}:${type}:${new Date().toISOString().slice(0, 13)}`,
      title: `[Alert] Server ${serverName} - High ${type} Usage`,
      message:
        message ||
        `The ${type} usage on server '${serverName}' is currently ${value}%, exceeding the set threshold of ${threshold}%.`,
      metadata: {
        serverId: settings.serverId,
        serverName,
        alertType: type,
        value,
        threshold,
      },
    })
    .catch((err) => {
      log.error({
        message: "Failed to publish server threshold alert notification",
        err: err instanceof Error ? err.message : String(err),
      });
    });

  return c.json({ status: "acknowledged" });
});

// Public, tokenized deployment hook used by GitHub Actions and external CI.
// Only a SHA-256 digest is persisted; the URL token is never recoverable from
// the database and must be rotated if it is lost.
app.on(["POST", "GET"], "/api/deploy/:token", async (c) => {
  const token = c.req.param("token");
  if (!token?.startsWith("upw_") || token.length < 12) {
    return c.json({ error: "Invalid deployment webhook" }, 404);
  }
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);
  const resource = await uow.resourceRepository.findByWebhookTokenHash(
    hashWebhookToken(token),
  );
  if (!resource) return c.json({ error: "Resource not found" }, 404);
  const resourceId = resource.id;

  let autoDeploy = false;
  try {
    const credentials = parseResourceCredentials(resource.credentials);
    autoDeploy = credentials?.autoDeploy !== false;
  } catch {
    autoDeploy = false;
  }
  if (!autoDeploy) {
    return c.json({ error: "Automatic deployment is disabled" }, 403);
  }

  let payload: any = {};
  if (c.req.method === "POST" || c.req.method === "PUT") {
    payload = await c.req.json().catch(() => ({}));
  }
  if (resource.provider === "docker-registry") {
    const repository =
      typeof payload?.repository?.repo_name === "string"
        ? payload.repository.repo_name
        : typeof payload?.repository?.name === "string"
          ? payload.repository.name
          : undefined;
    const tag =
      typeof payload?.push_data?.tag === "string"
        ? payload.push_data.tag
        : undefined;
    if (
      repository &&
      !matchesDockerImageWebhook(resource.dockerImage || "", repository, tag)
    ) {
      return c.json(
        { error: "Docker image does not match this resource" },
        409,
      );
    }
  }
  const branch =
    typeof payload?.ref === "string" ? payload.ref : payload?.branch;
  const title = branch
    ? `Webhook deployment (${String(branch).slice(0, 120)})`
    : "Webhook deployment";
  const deploymentId = `dep-${randomUUID()}`;
  try {
    const queued = await new QueueDeploymentUseCase(uow).execute({
      resourceId,
      title,
      deploymentId,
    });
    return c.json(
      {
        accepted: true,
        resourceId,
        status: queued.status,
        deploymentId,
      },
      202,
    );
  } catch (error) {
    log.error({
      message: "Failed to queue deployment webhook",
      resourceId,
      err: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Unable to queue deployment" }, 500);
  }
});

app.post("/api/resources/:resourceId/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);

  const resourceId = c.req.param("resourceId");
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);

  const resourceRecord = await uow.resourceRepository.findById(resourceId);
  if (!resourceRecord) return c.json({ error: "Resource not found" }, 404);

  const environment = await uow.environmentRepository.findById(
    resourceRecord.environmentId,
  );
  if (!environment) return c.json({ error: "Environment not found" }, 404);

  const project = await uow.projectRepository.findById(environment.projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  await ensureOrganizationAccess(session.user.id, project.organizationId);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "Upload payload ('file') is required" }, 400);
  }

  const filename = file.name.toLowerCase();
  if (
    !filename.endsWith(".zip") &&
    !filename.endsWith(".tar.gz") &&
    !filename.endsWith(".tgz")
  ) {
    return c.json(
      { error: "Only .zip, .tar.gz, and .tgz archives are supported" },
      400,
    );
  }

  const tempDir = path.join(process.cwd(), ".builds", "temp");
  fs.mkdirSync(tempDir, { recursive: true });
  const archivePath = path.join(
    tempDir,
    `upload-${resourceRecord.id}-${randomUUID()}.archive`,
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > 50 * 1024 * 1024) {
    return c.json({ error: "Archive exceeds the 50MB upload limit" }, 413);
  }
  fs.writeFileSync(archivePath, buffer);
  const dropsDir = path.join(
    process.cwd(),
    ".builds",
    "drops",
    resourceRecord.id,
  );

  try {
    await extractApplicationArchive(archivePath, dropsDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof ApplicationArchiveValidationError ? 400 : 500;
    return c.json({ error: `Extraction failed: ${message}` }, status);
  } finally {
    fs.rmSync(archivePath, { force: true });
  }

  await uow.transaction(async (tx) => {
    await tx.resourceRepository.updateById(resourceId, {
      provider: "drop",
    });
  });

  const deploymentId = `dep-${randomUUID()}`;
  try {
    const queued = await new QueueDeploymentUseCase(uow).execute({
      resourceId,
      title: "ZIP upload deployment",
      deploymentId,
    });
    return c.json(
      {
        accepted: true,
        resourceId,
        status: queued.status,
        deploymentId,
      },
      202,
    );
  } catch (error: any) {
    return c.json(
      { error: `Failed to trigger deployment queue: ${error.message}` },
      500,
    );
  }
});

app.post("/api/docker/volumes/:volumeName/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);

  const organizationId = c.req.query("organizationId");
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }
  try {
    await checkPermission(session.user.id, organizationId, "server:update");
  } catch {
    return c.json({ error: "Docker volume upload is not permitted" }, 403);
  }
  if (session.user.twoFactorEnabled) {
    const verified = await redis.get(`2fa-verified:${session.session.id}`);
    if (!verified) {
      return c.json({ error: "2FA verification required" }, 403);
    }
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "Upload payload ('file') is required" }, 400);
  }
  if (!file.name.toLowerCase().endsWith(".tar")) {
    return c.json(
      { error: "Only uncompressed .tar archives are supported" },
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > 50 * 1024 * 1024) {
    return c.json({ error: "Volume archives must not exceed 50 MB" }, 413);
  }

  const tempArchive = path.join(
    process.cwd(),
    ".builds",
    `volume-upload-${randomUUID()}.tar`,
  );
  fs.mkdirSync(path.dirname(tempArchive), { recursive: true });
  fs.writeFileSync(tempArchive, buffer);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const listing = await execFileAsync("tar", ["-tf", tempArchive]);
    const detailedListing = await execFileAsync("tar", ["-tvf", tempArchive]);
    if (
      detailedListing.stdout
        .split(/\r?\n/)
        .some((entry) => /^[lh]/i.test(entry))
    ) {
      return c.json(
        { error: "Symbolic and hard links are not allowed in volume uploads" },
        400,
      );
    }
    const unsafeEntry = listing.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => {
        if (!entry || path.isAbsolute(entry)) return Boolean(entry);
        const normalized = path.posix.normalize(entry.replaceAll("\\", "/"));
        return normalized === ".." || normalized.startsWith("../");
      });
    if (unsafeEntry) {
      return c.json(
        { error: `Archive entry escapes the destination: ${unsafeEntry}` },
        400,
      );
    }

    const parsed = UploadDockerVolumeInputSchema.parse({
      organizationId,
      serverId: c.req.query("serverId") || undefined,
      volumeName: c.req.param("volumeName"),
      destination: c.req.query("destination") || "/",
    });
    const result = await c
      .get("scope")
      .resolve(GetDockerInventoryUseCaseToken)
      .uploadVolume(parsed, buffer);
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  } finally {
    fs.rmSync(tempArchive, { force: true });
  }
});

app.post("/api/docker/containers/:containerId/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);

  const organizationId = c.req.query("organizationId");
  const resourceId = c.req.query("resourceId");
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }
  try {
    await checkPermission(session.user.id, organizationId, "server:update");
  } catch {
    return c.json({ error: "Docker container upload is not permitted" }, 403);
  }
  if (session.user.twoFactorEnabled) {
    const verified = await redis.get(`2fa-verified:${session.session.id}`);
    if (!verified) {
      return c.json({ error: "2FA verification required" }, 403);
    }
  }

  const uow = c.get("scope").resolve(UnitOfWorkToken);
  if (!resourceId) {
    return c.json(
      { error: "resourceId is required for container uploads" },
      400,
    );
  }
  const resource = await uow.resourceRepository.findById(resourceId);
  const environment = resource
    ? await uow.environmentRepository.findById(resource.environmentId)
    : null;
  const project = environment
    ? await uow.projectRepository.findById(environment.projectId)
    : null;
  if (!resource || !project || project.organizationId !== organizationId) {
    return c.json({ error: "Resource is not part of this organization" }, 403);
  }
  const requestedServerId = c.req.query("serverId") || "local";
  const resourceServerId = resource.serverId || "local";
  if (
    (resourceServerId === "manager" ? "local" : resourceServerId) !==
    (requestedServerId === "manager" ? "local" : requestedServerId)
  ) {
    return c.json(
      { error: "Container target does not match its resource" },
      403,
    );
  }
  const liveContainers = await c
    .get("scope")
    .resolve(GetDockerInventoryUseCaseToken)
    .execute({
      organizationId,
      serverId: requestedServerId,
      kind: "containers",
      tail: 150,
    });
  if (
    !Array.isArray(liveContainers) ||
    !liveContainers.some(
      (container) =>
        typeof container === "object" &&
        container !== null &&
        (container as { id?: string }).id === c.req.param("containerId"),
    )
  ) {
    return c.json({ error: "Container is not owned by this resource" }, 404);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "Upload payload ('file') is required" }, 400);
  }
  if (!file.name.toLowerCase().endsWith(".tar")) {
    return c.json(
      { error: "Only uncompressed .tar archives are supported" },
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > 50 * 1024 * 1024) {
    return c.json({ error: "Container archives must not exceed 50 MB" }, 413);
  }

  const tempArchive = path.join(
    process.cwd(),
    ".builds",
    `container-upload-${randomUUID()}.tar`,
  );
  fs.mkdirSync(path.dirname(tempArchive), { recursive: true });
  fs.writeFileSync(tempArchive, buffer);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const listing = await execFileAsync("tar", ["-tf", tempArchive]);
    const detailedListing = await execFileAsync("tar", ["-tvf", tempArchive]);
    if (
      detailedListing.stdout
        .split(/\r?\n/)
        .some((entry) => /^[lh]/i.test(entry))
    ) {
      return c.json(
        {
          error: "Symbolic and hard links are not allowed in container uploads",
        },
        400,
      );
    }
    const unsafeEntry = listing.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => {
        if (!entry || path.isAbsolute(entry)) return Boolean(entry);
        const normalized = path.posix.normalize(entry.replaceAll("\\", "/"));
        return normalized === ".." || normalized.startsWith("../");
      });
    if (unsafeEntry) {
      return c.json(
        { error: `Archive entry escapes the destination: ${unsafeEntry}` },
        400,
      );
    }

    const parsed = UploadDockerContainerInputSchema.parse({
      organizationId,
      resourceId,
      serverId: c.req.query("serverId") || undefined,
      containerId: c.req.param("containerId"),
      destination: c.req.query("destination") || "/",
    });
    const result = await c
      .get("scope")
      .resolve(GetDockerInventoryUseCaseToken)
      .uploadContainer(parsed, buffer);
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  } finally {
    fs.rmSync(tempArchive, { force: true });
  }
});

app.post("/api/webhooks/github/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);

  const provider = await uow.gitProviderRepository.findById(providerId);
  if (!provider) return c.json({ error: "Git provider not found" }, 404);

  const config = JSON.parse(provider.config);
  const webhookSecret = config.githubWebhookSecret;

  const bodyText = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  if (!webhookSecret || !signature) {
    return c.json({ error: "Webhook signature is not configured" }, 401);
  }
  if (webhookSecret && signature) {
    const hmac = createHmac("sha256", webhookSecret);
    const digest = `sha256=${hmac.update(bodyText).digest("hex")}`;
    const trusted = Buffer.from(digest, "ascii");
    const received = Buffer.from(signature, "ascii");
    if (
      trusted.length !== received.length ||
      !timingSafeEqual(trusted, received)
    ) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const event = c.req.header("x-github-event");
  if (event !== "pull_request") {
    try {
      const result = await new ProcessSourceWebhookUseCase(uow).execute({
        providerId,
        provider: "github",
        bodyText,
        headers: {
          "x-github-event": event,
          "x-hub-signature-256": signature,
        },
      });
      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Invalid webhook signature") {
        return c.json({ error: message }, 401);
      }
      log.error({ message: "GitHub webhook processing failed", err: message });
      return c.json({ error: "Unable to process webhook" }, 400);
    }
  }

  const payload = JSON.parse(bodyText);
  const action = payload.action;
  const prNumber = payload.number;
  const branchName = payload.pull_request?.head?.ref;
  const repoFullName = payload.repository?.full_name;

  if (!branchName || !repoFullName || !prNumber) {
    return c.json({ error: "Invalid pull request payload" }, 400);
  }

  const allResources = await uow.resourceRepository.findMany();
  const matchedResources = [];
  for (const resource of allResources) {
    if (resource.provider !== "github") continue;
    try {
      const creds = parseResourceCredentials(resource.credentials);
      if (
        creds.repository !== repoFullName ||
        (resource.isPreviewDeploymentsActive !== true &&
          creds.enablePrPreviews !== true) ||
        creds.githubAccount !== providerId
      ) {
        continue;
      }
      const environment = await uow.environmentRepository.findById(
        resource.environmentId,
      );
      const project = environment
        ? await uow.projectRepository.findById(environment.projectId)
        : null;
      if (project?.organizationId === provider.organizationId) {
        matchedResources.push(resource);
      }
    } catch {
      // Ignore malformed resource metadata rather than failing the webhook.
    }
  }

  for (const resource of matchedResources) {
    if (action === "opened" || action === "synchronize") {
      let preview = await uow.previewDeploymentRepository.findByPullRequestId(
        resource.id,
        prNumber,
      );
      let appName = preview?.appName;
      let domain = preview?.domain;

      if (!preview) {
        const existingPreviews =
          await uow.previewDeploymentRepository.findByResourceId(resource.id);
        const previewLimit = resource.previewLimit ?? 3;
        if (
          existingPreviews.filter((candidate) => candidate.status !== "failed")
            .length >= previewLimit
        ) {
          log.warn({
            message: "Preview deployment limit reached",
            resourceId: resource.id,
            previewLimit,
          });
          continue;
        }
        const hash = randomBytes(3).toString("hex");
        appName = `pr-${prNumber}-${resource.name}-${hash}`
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "-");

        domain = `${appName}.${resource.previewWildcard || "sslip.io"}`;

        preview = await uow.previewDeploymentRepository.create({
          resourceId: resource.id,
          pullRequestId: prNumber,
          branchName,
          appName,
          status: "idle",
          domain,
        });
      } else {
        await uow.previewDeploymentRepository.updateById(preview.id, {
          status: "idle",
          branchName,
        });
      }

      await new QueueDeploymentUseCase(uow).execute({
        resourceId: resource.id,
        title: `PR #${prNumber} preview deployment (${action})`,
        previewDeploymentId: preview.id,
      });
    } else if (action === "closed") {
      const preview = await uow.previewDeploymentRepository.findByPullRequestId(
        resource.id,
        prNumber,
      );
      if (preview) {
        log.info({
          message: `Cleaning up preview deployment ${preview.appName} on PR close...`,
        });

        try {
          const docker = getDockerInstance();
          const service = docker.getService(preview.appName);
          await service.remove();
        } catch (err: any) {
          log.error({
            message: `Failed to remove Swarm service for preview ${preview.appName}`,
            err: err.message,
          });
        }

        await uow.previewDeploymentRepository.deleteById(preview.id);

        try {
          const [resources, settings, allPreviews] = await Promise.all([
            uow.resourceRepository.findMany(),
            uow.webServerSettingsRepository.findGlobal(),
            uow.previewDeploymentRepository.findMany(),
          ]);
          const docker = getDockerInstance();
          const caddyService = new CaddyService(docker);

          const routingResources = resources.filter(
            (candidate) =>
              !candidate.serverId ||
              candidate.serverId === "local" ||
              candidate.serverId === "manager",
          );

          const activePreviews = allPreviews.filter(
            (p) => p.status === "success",
          );
          const routingPreviews: any[] = [];
          for (const prev of activePreviews) {
            const parent = resources.find((r) => r.id === prev.resourceId);
            if (parent) {
              const parentDomains = JSON.parse(parent.domains || "[]");
              const parentPort =
                parent.previewPort || parentDomains[0]?.port || 80;
              const parentHttps =
                parent.previewHttps || (parentDomains[0]?.https ?? false);
              const parentCert = parentDomains[0]?.certificateType ?? "none";
              const parentMiddlewares = parentDomains[0]?.middlewares ?? [];

              routingPreviews.push({
                id: prev.id,
                name: prev.appName,
                type: "application",
                appName: prev.appName,
                domains: JSON.stringify([
                  {
                    host: prev.domain,
                    path: "/",
                    port: parentPort,
                    https: parentHttps,
                    certificateType: parentCert,
                    middlewares: parentMiddlewares,
                  },
                ]),
                composeType: parent.composeType,
                advancedConfig: parent.advancedConfig,
              });
            }
          }

          const certificates =
            (await uow.certificateRepository.findAll?.()) ?? [];
          await caddyService.syncResourceConfigs(
            [...routingResources, ...routingPreviews],
            settings || {},
            certificates,
          );
        } catch (err: any) {
          log.error({
            message: "Failed to sync Caddy on preview cleanup",
            err: err.message,
          });
        }
      }
    }
  }

  return c.json({ accepted: true }, 200);
});

async function processNonGithubWebhook(
  c: Context<AppEnv>,
  provider: "gitlab" | "gitea" | "bitbucket" | "dockerhub",
) {
  const providerId = c.req.param("providerId");
  if (!providerId) return c.json({ error: "Provider ID is required" }, 400);
  const bodyText = await c.req.text();
  const scope = c.get("scope");
  const uow = scope.resolve(UnitOfWorkToken);
  const headers = {
    "x-gitlab-token": c.req.header("x-gitlab-token"),
    "x-hub-signature": c.req.header("x-hub-signature"),
    "x-gitea-signature": c.req.header("x-gitea-signature"),
  };
  try {
    const result = await new ProcessSourceWebhookUseCase(uow).execute({
      providerId,
      provider,
      bodyText,
      headers,
    });
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Invalid webhook signature") {
      return c.json({ error: message }, 401);
    }
    if (message === "Git provider not found") {
      return c.json({ error: message }, 404);
    }
    log.error({
      message: `${provider} webhook processing failed`,
      err: message,
    });
    return c.json({ error: "Unable to process webhook" }, 400);
  }
}

app.post("/api/webhooks/gitlab/:providerId", (c) =>
  processNonGithubWebhook(c, "gitlab"),
);
app.post("/api/webhooks/gitea/:providerId", (c) =>
  processNonGithubWebhook(c, "gitea"),
);
app.post("/api/webhooks/bitbucket/:providerId", (c) =>
  processNonGithubWebhook(c, "bitbucket"),
);
app.post("/api/webhooks/dockerhub/:providerId", (c) =>
  processNonGithubWebhook(c, "dockerhub"),
);

// This endpoint deliberately exposes only whether an owner exists. It lets the
// web app provide a deterministic first-run flow without leaking user details.
app.get("/api/setup/status", async (c) => {
  const result = await db.select({ value: count() }).from(authSchema.user);
  const userCount = result[0]?.value ?? 0;
  return c.json({ needsOwnerSetup: userCount === 0 });
});

const SCIM_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0";
const SCIM_MESSAGES_SCHEMA = `${SCIM_SCHEMA}:messages:2.0`;

function scimError(
  c: Context<AppEnv>,
  status: 400 | 401 | 404 | 405 | 409 | 422 | 500,
  detail: string,
) {
  return c.json(
    {
      schemas: [`${SCIM_MESSAGES_SCHEMA}:Error`],
      status: String(status),
      detail,
    },
    status,
  );
}

async function authorizeScim(c: Context<AppEnv>, organizationId: string) {
  const authorization = c.req.header("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 256) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return db
    .select({ id: scimProvider.id })
    .from(scimProvider)
    .where(
      and(
        eq(scimProvider.organizationId, organizationId),
        eq(scimProvider.tokenHash, tokenHash),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function scimRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type ScimMembership = {
  member: typeof authSchema.member.$inferSelect;
  user: typeof authSchema.user.$inferSelect;
};
type ScimUser = typeof authSchema.user.$inferSelect;

function toScimUser(row: ScimMembership, baseUrl: string) {
  return {
    schemas: [SCIM_SCHEMA],
    id: row.user.id,
    externalId: row.member.scimExternalId ?? undefined,
    userName: row.user.email,
    active: row.member.scimActive,
    displayName: row.member.scimDisplayName ?? row.user.name,
    name: { formatted: row.member.scimDisplayName ?? row.user.name },
    emails: [{ value: row.user.email, type: "work", primary: true }],
    meta: {
      resourceType: "User",
      created: row.user.createdAt.toISOString(),
      lastModified: row.user.updatedAt.toISOString(),
      location: `${baseUrl}/Users/${row.user.id}`,
    },
  };
}

async function findScimMembership(
  organizationId: string,
  userId: string,
): Promise<ScimMembership | null> {
  const rows = await db
    .select({ member: authSchema.member, user: authSchema.user })
    .from(authSchema.member)
    .innerJoin(
      authSchema.user,
      eq(authSchema.member.userId, authSchema.user.id),
    )
    .where(
      and(
        eq(authSchema.member.organizationId, organizationId),
        eq(authSchema.user.id, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listScimMemberships(
  organizationId: string,
): Promise<ScimMembership[]> {
  return db
    .select({ member: authSchema.member, user: authSchema.user })
    .from(authSchema.member)
    .innerJoin(
      authSchema.user,
      eq(authSchema.member.userId, authSchema.user.id),
    )
    .where(eq(authSchema.member.organizationId, organizationId));
}

async function handleScimCreateUser(c: Context<AppEnv>) {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const body = scimRecord(await c.req.json().catch(() => null));
  const email =
    typeof body.userName === "string"
      ? body.userName.trim().toLowerCase()
      : typeof body.emails === "object" && Array.isArray(body.emails)
        ? String(scimRecord(body.emails[0]).value ?? "")
            .trim()
            .toLowerCase()
        : "";
  const parsedEmail = z.email().safeParse(email);
  if (!parsedEmail.success)
    return scimError(c, 400, "SCIM userName must be an email");

  const existingUser = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email))
    .limit(1)
    .then((rows) => rows[0]);
  if (existingUser) {
    const existingMembership = await findScimMembership(
      organizationId,
      existingUser.id,
    );
    if (existingMembership)
      return scimError(c, 409, "SCIM user already exists");
  }

  let user: ScimUser | undefined = existingUser;
  if (!user) {
    const created = await auth.api.createUser({
      body: {
        email,
        // Keep the global account profile neutral. SCIM display names belong
        // to the organization membership, not the shared user record.
        name: email,
        password: randomBytes(32).toString("base64url"),
        role: "user",
        data: { managed: true },
      },
    });
    user = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, created.user.id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!user)
      return scimError(c, 500, "Created SCIM user could not be loaded");

    const personalWorkspaces = await db
      .select({ id: authSchema.organization.id })
      .from(authSchema.member)
      .innerJoin(
        authSchema.organization,
        eq(authSchema.member.organizationId, authSchema.organization.id),
      )
      .where(
        and(
          eq(authSchema.member.userId, user.id),
          eq(
            authSchema.organization.metadata,
            JSON.stringify({ isPersonal: true }),
          ),
        ),
      );
    for (const workspace of personalWorkspaces) {
      await db
        .delete(authSchema.organization)
        .where(eq(authSchema.organization.id, workspace.id));
    }
  }

  const displayName =
    (typeof body.displayName === "string" && body.displayName.trim()) ||
    user.name;
  const active = body.active !== false;
  const [membership] = await db
    .insert(authSchema.member)
    .values({
      id: randomUUID(),
      organizationId,
      userId: user.id,
      role: "member",
      permissions: null,
      scimActive: active,
      scimExternalId:
        typeof body.externalId === "string"
          ? body.externalId.slice(0, 255)
          : null,
      scimDisplayName: displayName.slice(0, 120),
      createdAt: new Date(),
    })
    .returning();
  if (!membership) return scimError(c, 500, "Unable to provision SCIM user");
  const row = await findScimMembership(organizationId, user.id);
  if (!row)
    return scimError(c, 500, "Provisioned SCIM user could not be loaded");
  const baseUrl = `${new URL(c.req.url).origin}/api/scim/v2.0/${organizationId}`;
  return c.json(toScimUser(row, baseUrl), 201);
}

async function handleScimPatchUser(c: Context<AppEnv>) {
  const organizationId = c.req.param("organizationId") as string;
  const userId = c.req.param("userId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const existing = await findScimMembership(organizationId, userId);
  if (!existing) return scimError(c, 404, "SCIM user not found");
  const body = scimRecord(await c.req.json().catch(() => null));
  if (c.req.method === "PUT") {
    if (typeof body.userName !== "string") {
      return scimError(c, 400, "SCIM PUT requires userName");
    }
    if (
      body.userName.trim().toLowerCase() !== existing.user.email.toLowerCase()
    ) {
      return scimError(c, 422, "SCIM userName cannot be changed");
    }
  }
  const operations = Array.isArray(body.Operations) ? body.Operations : [];
  let active: boolean | undefined;
  let displayName: string | null | undefined;
  let externalId: string | null | undefined;
  for (const operation of operations) {
    const item = scimRecord(operation);
    const operationName = String(item.op ?? "replace").toLowerCase();
    const path = String(item.path ?? "").toLowerCase();
    const value = item.value;
    if (path === "active") {
      if (typeof value === "boolean") active = value;
      else {
        const record = scimRecord(value);
        if (typeof record.active === "boolean") active = record.active;
      }
    } else if (path === "" && typeof value === "object") {
      const record = scimRecord(value);
      if (typeof record.active === "boolean") active = record.active;
    } else if (path === "externalid" && operationName === "remove") {
      externalId = null;
    } else if (path === "displayname" && operationName === "remove") {
      displayName = null;
    } else if (path === "displayname" && typeof value === "string") {
      displayName = value.trim().slice(0, 120);
    } else if (path === "externalid" && typeof value === "string") {
      externalId = value.slice(0, 255);
    }
  }
  if (typeof body.active === "boolean") active = body.active;
  if (c.req.method === "PUT" && active === undefined) active = true;
  if (typeof body.displayName === "string")
    displayName = body.displayName.trim().slice(0, 120);
  if (typeof body.externalId === "string")
    externalId = body.externalId.slice(0, 255);
  if (body.externalId === null) externalId = null;
  await db
    .update(authSchema.member)
    .set({
      ...(active === undefined ? {} : { scimActive: active }),
      ...(externalId === undefined ? {} : { scimExternalId: externalId }),
      ...(displayName === undefined ? {} : { scimDisplayName: displayName }),
    })
    .where(
      and(
        eq(authSchema.member.organizationId, organizationId),
        eq(authSchema.member.userId, userId),
      ),
    );
  const row = await findScimMembership(organizationId, userId);
  if (!row) return scimError(c, 404, "SCIM user not found");
  const baseUrl = `${new URL(c.req.url).origin}/api/scim/v2.0/${organizationId}`;
  return c.json(toScimUser(row, baseUrl));
}

app.get("/api/scim/v2.0/:organizationId/ServiceProviderConfig", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  return c.json({
    schemas: [`${SCIM_SCHEMA}:ServiceProviderConfig`],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 1000 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "SCIM bearer token",
        description: "Organization-scoped Upstand SCIM token",
        primary: true,
      },
    ],
  });
});

app.get("/api/scim/v2.0/:organizationId/ResourceTypes", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const base = `${new URL(c.req.url).origin}/api/scim/v2.0/${organizationId}`;
  return c.json({
    schemas: [`${SCIM_MESSAGES_SCHEMA}:ListResponse`],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        schemas: [`${SCIM_SCHEMA}:ResourceType`],
        id: "User",
        name: "User",
        endpoint: `${base}/Users`,
        schema: SCIM_SCHEMA,
        meta: { resourceType: "ResourceType" },
      },
      {
        schemas: [`${SCIM_SCHEMA}:ResourceType`],
        id: "Group",
        name: "Group",
        endpoint: `${base}/Groups`,
        schema: `${SCIM_SCHEMA}:Group`,
        meta: { resourceType: "ResourceType" },
      },
    ],
  });
});

app.get("/api/scim/v2.0/:organizationId/Schemas", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  return c.json({
    schemas: [`${SCIM_MESSAGES_SCHEMA}:ListResponse`],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [
      {
        schemas: [`${SCIM_SCHEMA}:Schema`],
        id: SCIM_SCHEMA,
        name: "User",
        description: "Upstand organization member",
        attributes: [
          {
            name: "userName",
            type: "string",
            required: true,
            multiValued: false,
          },
          {
            name: "displayName",
            type: "string",
            required: false,
            multiValued: false,
          },
          {
            name: "active",
            type: "boolean",
            required: false,
            multiValued: false,
          },
          {
            name: "externalId",
            type: "string",
            required: false,
            multiValued: false,
          },
        ],
      },
    ],
  });
});

app.get("/api/scim/v2.0/:organizationId/Users", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  let rows = await listScimMemberships(organizationId);
  const filter = c.req.query("filter") || "";
  const match = filter.match(
    /^(userName|externalId|active)\s+eq\s+["']?([^"']+)["']?$/i,
  );
  if (match) {
    const attribute = (match[1] ?? "").toLowerCase();
    const expected = (match[2] ?? "").toLowerCase();
    rows = rows.filter((row) => {
      if (attribute === "username")
        return row.user.email.toLowerCase() === expected;
      if (attribute === "externalid")
        return (row.member.scimExternalId ?? "").toLowerCase() === expected;
      return String(row.member.scimActive).toLowerCase() === expected;
    });
  }
  const requestedStart = Number(c.req.query("startIndex") || 1);
  const startIndex = Number.isFinite(requestedStart)
    ? Math.max(1, Math.trunc(requestedStart))
    : 1;
  const requestedCount = Number(c.req.query("count") || 100);
  const countLimit = Math.min(
    1000,
    Number.isFinite(requestedCount)
      ? Math.max(1, Math.trunc(requestedCount))
      : 100,
  );
  const resources = rows
    .slice(startIndex - 1, startIndex - 1 + countLimit)
    .map((row) =>
      toScimUser(
        row,
        `${new URL(c.req.url).origin}/api/scim/v2.0/${organizationId}`,
      ),
    );
  return c.json({
    schemas: [`${SCIM_MESSAGES_SCHEMA}:ListResponse`],
    totalResults: rows.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  });
});

app.get("/api/scim/v2.0/:organizationId/Users/:userId", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const row = await findScimMembership(
    organizationId,
    c.req.param("userId") as string,
  );
  if (!row) return scimError(c, 404, "SCIM user not found");
  return c.json(
    toScimUser(
      row,
      `${new URL(c.req.url).origin}/api/scim/v2.0/${organizationId}`,
    ),
  );
});

app.post("/api/scim/v2.0/:organizationId/Users", handleScimCreateUser);
app.on(
  ["PATCH", "PUT"],
  "/api/scim/v2.0/:organizationId/Users/:userId",
  handleScimPatchUser,
);
app.delete("/api/scim/v2.0/:organizationId/Users/:userId", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const deleted = await db
    .delete(authSchema.member)
    .where(
      and(
        eq(authSchema.member.organizationId, organizationId),
        eq(authSchema.member.userId, c.req.param("userId") as string),
      ),
    )
    .returning({ id: authSchema.member.id });
  if (!deleted.length) return scimError(c, 404, "SCIM user not found");
  await db
    .delete(authSchema.session)
    .where(eq(authSchema.session.userId, c.req.param("userId") as string));
  return c.body(null, 204);
});

app.get("/api/scim/v2.0/:organizationId/Groups", async (c) => {
  const organizationId = c.req.param("organizationId") as string;
  const provider = await authorizeScim(c, organizationId);
  if (!provider) return scimError(c, 401, "Invalid SCIM bearer token");
  const rows = (await listScimMemberships(organizationId)).filter(
    (row) => row.member.scimActive,
  );
  return c.json({
    schemas: [`${SCIM_MESSAGES_SCHEMA}:ListResponse`],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [
      {
        schemas: [`${SCIM_SCHEMA}:Group`],
        id: organizationId,
        displayName: "Organization members",
        members: rows.map((row) => ({ value: row.user.id, type: "User" })),
      },
    ],
  });
});

app.post("/api/ai/chat", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  const bodyResult = z
    .object({
      organizationId: z.string().min(1),
      conversationId: z.string().min(1).optional(),
      page: UpGalPageContextSchema.optional(),
      messages: z.unknown(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!bodyResult.success)
    return c.json({ error: "Invalid UpGal request" }, 400);
  const body = bodyResult.data;
  await checkPermission(session.user.id, body.organizationId, "ai:view");
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
    await c
      .get("scope")
      .resolve(AIRepositoryToken)
      .createConversation({
        id: conversationId,
        organizationId: body.organizationId,
        userId: session.user.id,
        context: body.page ? { page: body.page } : {},
      });
  const context = {
    organizationId: body.organizationId,
    userId: session.user.id,
    userName: session.user.name?.trim() || undefined,
    page: body.page,
    conversationId,
    runId: randomUUID(),
    scope: c.get("scope"),
    allowedToolNames: await getUpGalToolNamesForUser(
      session.user.id,
      body.organizationId,
    ),
  };
  const tools = createUpGalTools(context);
  let messages: UpGalUIMessage[];
  try {
    messages = await validateAndRecoverUpGalMessages(body.messages, tools);
  } catch (error) {
    log.warn({
      message: "Rejected UpGal request with unrecoverable UI message history",
      organizationId: body.organizationId,
      conversationId,
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      err: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error:
          "UpGal could not read this conversation history. Start a new message to continue.",
      },
      400,
    );
  }
  try {
    await saveIncomingMessages(
      conversationId,
      messages,
      c.get("scope").resolve(AIRepositoryToken),
    );
    return await createUpGalResponse(context, messages, c.req.raw);
  } catch (error) {
    const info = classifyUpGalError(error);
    log.error({
      message: "UpGal request failed before streaming started",
      organizationId: body.organizationId,
      conversationId,
      code: info.code,
      retryable: info.retryable,
      err: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: info.userMessage,
        code: info.code,
        retryable: info.retryable,
      },
      info.status,
    );
  }
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
  const canUseMcpTool = (name: string) => {
    if (!isUpGalToolName(name)) return false;
    const mcpGrant =
      key.permissions.mcp.includes("*") ||
      key.permissions.mcp.includes("read") ||
      key.permissions.mcp.includes(`tool:${name}`);
    return (
      mcpGrant &&
      hasApiKeyPermission(key.permissions, UPGAL_TOOL_CAPABILITIES[name])
    );
  };
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
        tools: UPGAL_TOOL_METADATA.filter(([name]) => canUseMcpTool(name)).map(
          ([name, description, mutation]) => ({
            name,
            description,
            annotations: { destructiveHint: mutation, readOnlyHint: !mutation },
          }),
        ),
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
    if (!metadata || !isUpGalToolName(name) || !canUseMcpTool(name))
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
    try {
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
    } catch (error) {
      const info = classifyUpGalError(error);
      log.warn({
        message: "UpGal MCP tool execution failed",
        toolName: name,
        organizationId: key.organizationId,
        code: info.code,
        err: error instanceof Error ? error.message : String(error),
      });
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: info.userMessage }],
        },
      });
    }
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

  const scope = c.get("scope");

  const parsedState = parseGitProviderOAuthState(state || "");
  if (!parsedState) {
    return c.json({ error: "Invalid or expired GitHub OAuth state" }, 400);
  }
  const storedStateSubject = await redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
    1,
    gitProviderOAuthStateKey(state || ""),
  );
  if (storedStateSubject !== parsedState.providerId) {
    return c.json(
      { error: "GitHub OAuth state was already used or is invalid" },
      400,
    );
  }
  const callbackSession = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!callbackSession || callbackSession.user.id !== parsedState.userId) {
    return c.json({ error: "OAuth state actor is no longer valid" }, 403);
  }

  let action: "gh_init" | "gh_setup";
  let rest: string[];
  if (parsedState.purpose === "github-init") {
    const [, organizationId, userId] = parsedState.providerId.split(":");
    if (!organizationId || !userId) {
      return c.json({ error: "Invalid GitHub manifest state" }, 400);
    }
    action = "gh_init";
    rest = [organizationId, userId];
  } else if (parsedState.purpose === "github-install") {
    action = "gh_setup";
    rest = [parsedState.providerId];
  } else {
    return c.json({ error: "Invalid GitHub OAuth state purpose" }, 400);
  }

  if (action === "gh_init") {
    const organizationId = rest[0];
    if (!organizationId) {
      return c.json({ error: "Missing organizationId in state" }, 400);
    }
    if (organizationId !== parsedState.organizationId) {
      return c.json({ error: "OAuth state organization mismatch" }, 403);
    }
    await checkPermission(
      callbackSession.user.id,
      organizationId,
      "git_provider:create",
    );

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
      const uow = scope.resolve(UnitOfWorkToken);
      const provider = await uow.gitProviderRepository.findById(gitProviderId);
      if (!provider) {
        return c.text("Git Provider not found", 404);
      }
      if (provider.organizationId !== parsedState.organizationId) {
        return c.text("OAuth state organization mismatch", 403);
      }
      await checkPermission(
        callbackSession.user.id,
        provider.organizationId,
        "git_provider:create",
      );

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

  return c.redirect(getDashboardUrl("/git-providers"), 307);
});

app.get("/api/providers/gitlab/setup", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const scope = c.get("scope");
  try {
    const parsedState = parseGitProviderOAuthState(state);
    if (parsedState?.purpose !== "provider-oauth") {
      return c.json({ error: "Invalid or expired OAuth state" }, 400);
    }
    const storedProviderId = await redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      gitProviderOAuthStateKey(state),
    );
    if (storedProviderId !== parsedState.providerId) {
      return c.json(
        { error: "OAuth state was already used or is invalid" },
        400,
      );
    }
    const uow = scope.resolve(UnitOfWorkToken);
    const provider = await uow.gitProviderRepository.findById(
      parsedState.providerId,
    );
    if (!provider) {
      return c.text("Git Provider not found", 404);
    }
    if (
      provider.organizationId !== parsedState.organizationId ||
      parsedState.userId !==
        (await auth.api.getSession({ headers: c.req.raw.headers }))?.user.id
    ) {
      return c.text("OAuth state actor is no longer valid", 403);
    }
    await checkPermission(
      parsedState.userId,
      provider.organizationId,
      "git_provider:create",
    );

    const configObj = JSON.parse(provider.config);
    const gitlabUrl = assertSafeProviderUrl(configObj.gitlabUrl);
    const redirectUri = new URL(
      "/api/providers/gitlab/setup",
      env.BETTER_AUTH_URL,
    ).toString();

    const res = await fetch(`${gitlabUrl}/oauth/token`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
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

  return c.redirect(getDashboardUrl("/git-providers"), 307);
});

app.get("/api/providers/gitea/setup", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const scope = c.get("scope");
  try {
    const parsedState = parseGitProviderOAuthState(state);
    if (parsedState?.purpose !== "provider-oauth") {
      return c.json({ error: "Invalid or expired OAuth state" }, 400);
    }
    const storedProviderId = await redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      gitProviderOAuthStateKey(state),
    );
    if (storedProviderId !== parsedState.providerId) {
      return c.json(
        { error: "OAuth state was already used or is invalid" },
        400,
      );
    }
    const uow = scope.resolve(UnitOfWorkToken);
    const provider = await uow.gitProviderRepository.findById(
      parsedState.providerId,
    );
    if (!provider) {
      return c.text("Git Provider not found", 404);
    }
    if (provider.organizationId !== parsedState.organizationId) {
      return c.text("OAuth state organization mismatch", 403);
    }
    const currentSession = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!currentSession || currentSession.user.id !== parsedState.userId) {
      return c.text("OAuth state actor is no longer valid", 403);
    }
    await checkPermission(
      currentSession.user.id,
      provider.organizationId,
      "git_provider:create",
    );

    const configObj = JSON.parse(provider.config);
    const giteaUrl = assertSafeProviderUrl(configObj.giteaUrl);
    const redirectUri = new URL(
      "/api/providers/gitea/setup",
      env.BETTER_AUTH_URL,
    ).toString();

    const res = await fetch(`${giteaUrl}/login/oauth/access_token`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
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

  return c.redirect(getDashboardUrl("/git-providers"), 307);
});

app.get("/api/openapi.json", (c) => c.json(openApiDocument));

app.get("/api/docs", (c) => c.redirect("/api/docs/", 308));
app.get("/api/docs/", (c) => c.html(swaggerUiHtml));

app.get("/api/docs/assets/:asset", async (c) => {
  const asset = c.req.param("asset");
  return (await serveSwaggerUiAsset(asset)) ?? c.notFound();
});

// Keep the existing /api routes above authoritative, and expose the generated
// REST compatibility routes for any remaining /api path.
app.all("/api/*", async (c) => {
  // trpc-to-openapi strips its endpoint with String#replace. Give it a request
  // URL whose hostname cannot contain the `/api` endpoint substring (the
  // production API hostname does), while keeping the original request headers,
  // method, and body intact for authentication and input parsing.
  const openApiUrl = new URL(c.req.url);
  openApiUrl.hostname = "openapi.invalid";
  openApiUrl.port = "";
  return createOpenApiFetchHandler({
    endpoint: "/api",
    req: new Request(openApiUrl.toString(), c.req.raw),
    router: openApiRouter,
    createContext: () => createContext({ context: c as any }),
  });
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
    deploymentRuntime.isReady() &&
    notificationWorker.isReady() &&
    backupWorker.isReady() &&
    backupScheduler.isReady();
  const redisReady = await pingRedis(redis);
  const rateLimiterHealth = getRateLimiterHealth();
  let databaseReady = false;
  try {
    const uow = c.get("scope").resolve(UnitOfWorkToken);
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
        rateLimiter: rateLimiterHealth,
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
const caddyInitScope = getServiceProvider().createScope();
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

await deploymentRuntime.start();
await notificationWorker.start();
await backupWorker.start();
await backupScheduler.start();
await generalScheduler.start();
await accessLogCleanupScheduler.start();
await outboxRuntime.start();
log.info({ message: "Background job workers and schedulers started" });

initializeMonitoring().catch((err) => {
  log.error({
    message: "Monitoring initialization error",
    err: err instanceof Error ? err.message : String(err),
  });
});

autoUpdateRuntime.start();
deploymentRuntime.startMaintenance();
outboxRuntime.startMaintenance();
scheduledDockerCleanup.start();

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ message: "Graceful shutdown started", signal });

  const deploymentDrain = deploymentRuntime.shutdown();
  const outboxDrain = outboxRuntime.shutdown();
  scheduledDockerCleanup.stop();
  autoUpdateRuntime.stop();

  const drain = Promise.all([
    deploymentDrain,
    outboxDrain,
    Promise.allSettled([
      notificationWorker.stop(),
      backupWorker.stop(),
      backupScheduler.stop(),
      generalScheduler.stop(),
      accessLogCleanupScheduler.stop(),
    ]),
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
  await closeDb();
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
