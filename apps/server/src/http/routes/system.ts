import { getRateLimiterHealth } from "@upstand/api";
import { env } from "@upstand/env/server";
import { pingRedis, redis } from "@upstand/redis";
import {
  GetSetupStatusUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import type { Hono } from "hono";
import type { AppEnv } from "../types";

export type SystemRouteDependencies = {
  deploymentRuntime: { isReady(): boolean };
  notificationWorker: { isReady(): boolean };
  backupWorker: { isReady(): boolean };
  backupScheduler: { isReady(): boolean };
  isShuttingDown(): boolean;
  isCaddyReady(): boolean;
};

/** Registers the minimal first-run status endpoint before tenant routes. */
export function registerSetupStatusRoute(app: Hono<AppEnv>): void {
  app.get("/api/setup/status", async (c) => {
    const status = await c
      .get("scope")
      .resolve(GetSetupStatusUseCaseToken)
      .execute();
    return c.json({ ...status, isCloud: env.IS_CLOUD });
  });
}

/** Registers generated API compatibility routes and process health endpoints. */
export function registerSystemRoutes(
  app: Hono<AppEnv>,
  dependencies: SystemRouteDependencies,
): void {
  app.get("/health/live", (c) => c.json({ status: "alive" }));

  app.get("/health/ready", async (c) => {
    const workersReady =
      dependencies.deploymentRuntime.isReady() &&
      dependencies.notificationWorker.isReady() &&
      dependencies.backupWorker.isReady() &&
      dependencies.backupScheduler.isReady();
    const redisReady = await pingRedis(redis);
    const rateLimiterHealth = getRateLimiterHealth();
    let databaseReady = false;
    try {
      const uow = c.get("scope").resolve(UnitOfWorkToken);
      await uow.resourceRepository.count();
      databaseReady = true;
    } catch (error) {
      c.get("log").error(error instanceof Error ? error : String(error), {
        message: "Database readiness check failed",
      });
    }

    const ready =
      !dependencies.isShuttingDown() &&
      dependencies.isCaddyReady() &&
      workersReady &&
      redisReady &&
      databaseReady;
    return c.json(
      {
        status: ready ? "ready" : "not_ready",
        checks: {
          database: databaseReady,
          caddy: dependencies.isCaddyReady(),
          redis: redisReady,
          rateLimiter: rateLimiterHealth,
          workers: workersReady,
        },
      },
      ready ? 200 : 503,
    );
  });

  app.get("/", (c) => c.text("OK"));
}
