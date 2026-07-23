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

  // OAuth 2.0 Authorization Server Metadata — RFC 8414.
  // MCP 2025-03-26 clients probe this endpoint to auto-negotiate authentication.
  // We use API-key bearer tokens (not a full OAuth flow), so we advertise the
  // subset of RFC 8414 fields that describe our authentication model.
  app.get("/.well-known/oauth-authorization-server", (c) => {
    const base = new URL(c.req.url).origin;
    return c.json({
      issuer: base,
      // We do not issue OAuth tokens — clients should use API keys as Bearer tokens.
      // The token_endpoint and authorization_endpoint are omitted intentionally.
      response_types_supported: ["token"],
      token_endpoint_auth_methods_supported: ["none"],
      grant_types_supported: [],
      // Document where clients can obtain an API key.
      service_documentation: `${base}/docs`,
      // Signal that we accept Bearer tokens in the Authorization header.
      // MCP clients use this to confirm Bearer auth is valid.
      introspection_endpoint_auth_methods_supported: ["bearer"],
      code_challenge_methods_supported: [],
    });
  });

  app.get("/", (c) => c.text("OK"));
}
