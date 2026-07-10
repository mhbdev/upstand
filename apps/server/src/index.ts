import type { ServiceScope } from "@circulo-ai/di";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@upstand/api/context";
import {
  BackupSchedulerToken,
  CreateGitProviderUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  serviceProvider,
} from "@upstand/api/di";
import { appRouter } from "@upstand/api/routers/index";
import { auth } from "@upstand/auth";
import { type IUnitOfWork, UnitOfWorkToken } from "@upstand/domain";
import { env } from "@upstand/env/server";
import { closeRedis, pingRedis, redis } from "@upstand/redis";
import {
  BackupRunWorker,
  DeploymentWorker,
  getDockerInstance,
  NotificationDeliveryWorker,
  reconcileQueuedJobs,
} from "@upstand/usecases";
import { initLogger, log } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { runDatabaseMigrations } from "./startup";

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
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
              title: string;
              message: string;
            }) => Promise<number>;
          };
          await publisher
            .execute({
              event: "docker_cleanup_completed",
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

export default app;
