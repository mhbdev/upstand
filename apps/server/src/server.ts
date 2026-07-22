import { auth } from "@upstand/api/auth";
import { closeDb } from "@upstand/db";
import { env } from "@upstand/env/server";
import { closeRedis, redis } from "@upstand/redis";
import {
  AccessLogCleanupScheduler,
  BackupRunWorker,
  NotificationDeliveryWorker,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CaddyServiceToken,
  DeliverNotificationUseCaseToken,
  GeneralSchedulerToken,
  GetWebServerSettingsUseCaseToken,
  RunDueSecretRotationsUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { type DrainContext, initLogger, log } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { createFsDrain } from "evlog/fs";
import { evlog } from "evlog/hono";
import { createOTLPDrain } from "evlog/otlp";
import { Hono } from "hono";
import { websocket } from "hono/bun";
import { AutoUpdateRuntime } from "./auto-update-runtime";
import { AutoscalingRuntime } from "./autoscaling-runtime";
import { createBackupRunHandler } from "./backup-runtime";
import { DeploymentRuntime } from "./deployment-runtime";
import { getServiceProvider } from "./di";
import { ScheduledDockerCleanup } from "./docker-cleanup-scheduler";
import { registerHttpMiddleware } from "./http/middleware";
import { registerAiRoutes } from "./http/routes/ai";
import { registerAuthRoutes } from "./http/routes/auth";
import { registerDeploymentRoutes } from "./http/routes/deployments";
import { registerMonitoringRoutes } from "./http/routes/monitoring";
import { registerProviderRoutes } from "./http/routes/providers";
import { registerScimRoutes } from "./http/routes/scim";
import {
  registerSetupStatusRoute,
  registerSystemRoutes,
} from "./http/routes/system";
import { registerTerminalRoutes } from "./http/routes/terminal";
import { registerApiTransports } from "./http/routes/transports";
import { registerWebhookRoutes } from "./http/routes/webhooks";
import type { AppEnv } from "./http/types";
import { initializeMonitoring } from "./monitoring-agent";
import { OutboxRuntime } from "./outbox-runtime";
import { runDatabaseMigrations } from "./startup";

const fileDrain = createFsDrain({ maxFiles: 7 });
const otlpEndpoint =
  process.env.OTLP_ENDPOINT?.trim() ||
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
const otlpDrain = otlpEndpoint
  ? createOTLPDrain({
      endpoint: otlpEndpoint,
      serviceName: "upstand-server",
    })
  : undefined;

const drain = async (context: DrainContext | DrainContext[]) => {
  await Promise.allSettled([
    fileDrain(context),
    ...(otlpDrain ? [otlpDrain(context)] : []),
  ]);
};

initLogger({
  env: { service: "upstand-server" },
  drain,
});

await runDatabaseMigrations();

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
const autoscalingRuntime = new AutoscalingRuntime();
let secretRotationTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let caddyReady = false;

app.use(evlog());

registerHttpMiddleware(app, {
  getServiceProvider,
  identifyUser,
});

registerAuthRoutes(app);

registerTerminalRoutes(app);

registerMonitoringRoutes(app);

registerDeploymentRoutes(app);

registerWebhookRoutes(app);

registerSetupStatusRoute(app);

registerScimRoutes(app);

registerAiRoutes(app);

registerProviderRoutes(app);

registerApiTransports(app);

registerSystemRoutes(app, {
  deploymentRuntime,
  notificationWorker,
  backupWorker,
  backupScheduler,
  isShuttingDown: () => shuttingDown,
  isCaddyReady: () => caddyReady,
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
    log.error(
      err instanceof Error ? err.message : String(err),
      "Failed to initialize Caddy Web Server",
    ),
  )
  .finally(() => caddyInitScope.dispose());

await deploymentRuntime.start();
await notificationWorker.start();
await backupWorker.start();
await backupScheduler.start();
await generalScheduler.start();
await accessLogCleanupScheduler.start();
await outboxRuntime.start();
autoscalingRuntime.start();
secretRotationTimer = setInterval(() => {
  const scope = getServiceProvider().createScope();
  void scope
    .resolve(RunDueSecretRotationsUseCaseToken)
    .execute()
    .catch((error) => {
      log.warn({
        message: "Secret rotation reconciliation failed",
        err: error,
      });
    })
    .finally(() => scope.dispose());
}, 60_000);
secretRotationTimer.unref?.();
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
  autoscalingRuntime.stop();
  if (secretRotationTimer) clearInterval(secretRotationTimer);

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
  port: env.PORT,
  fetch: (request: Request, bunServer: Bun.Server<unknown>) =>
    app.fetch(request, { server: bunServer }),
  websocket,
};
