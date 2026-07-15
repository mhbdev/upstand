import { initTRPC, TRPCError } from "@trpc/server";
import {
  type AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  type JsonObject,
} from "@upstand/domain";
import { redis } from "@upstand/redis";
import {
  CreateAuditLogUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";
import { ensureOrganizationAccess } from "./access-control";
import {
  enforceApiKeyRoute,
  isApiKeyPrincipal,
  setApiKeyRateLimitHeaders,
} from "./api-key-auth";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

// Centralized Rate Limit Middleware using Redis
export const rateLimitMiddleware = t.middleware(async ({ ctx, path, next }) => {
  if (isApiKeyPrincipal(ctx.actor)) {
    setApiKeyRateLimitHeaders(ctx.actor, (name, value) =>
      ctx.honoContext.header(name, value),
    );
    return next();
  }
  const ip =
    ctx.honoContext.req.header("x-forwarded-for") ||
    ctx.honoContext.req.header("x-real-ip") ||
    "127.0.0.1";

  // Use user id if logged in, otherwise fall back to IP address
  const identifier = ctx.session ? `user:${ctx.session.user.id}` : `ip:${ip}`;
  const key = `ratelimit:${path}:${identifier}`;

  // Configure limit: 60 requests per 60 seconds
  const limit = 60;
  const windowSize = 60; // 1 minute
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = now - (now % windowSize);
  const redisKey = `${key}:${currentWindow}`;

  let count = 0;
  try {
    count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSize);
    }
  } catch (error: unknown) {
    // Fail-open logging to avoid blocking users if Redis is down
    log.error({
      message: "Rate limit check failed (Redis error)",
      err: error instanceof Error ? error.message : String(error),
    });
    return next();
  }

  const remaining = Math.max(0, limit - count);
  const reset = currentWindow + windowSize;

  // Set standard rate limit headers on Hono context
  ctx.honoContext.header("X-RateLimit-Limit", limit.toString());
  ctx.honoContext.header("X-RateLimit-Remaining", remaining.toString());
  ctx.honoContext.header("X-RateLimit-Reset", reset.toString());

  if (count > limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded. Please try again in a minute.",
    });
  }

  return next();
});

// All public procedures run through the rate limiter
export const publicProcedure = t.procedure.use(rateLimitMiddleware);

// Protected procedures run through rate limiter and check session
export const protectedProcedure = t.procedure
  .use(rateLimitMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session || !ctx.actor) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        cause: "No session",
      });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  })
  .use(async ({ ctx, path, getRawInput, next }) => {
    if (isApiKeyPrincipal(ctx.actor)) {
      await enforceApiKeyRoute(path, ctx.actor, await getRawInput());
    }
    const result = await next();
    if (path !== "auditLog.list" && result.ok) {
      const input = await getRawInput();
      const organizationId = await resolveAuditOrganizationId(ctx, path, input);
      if (organizationId) {
        void recordAuditEvent(ctx, path, organizationId, input);
      }
    }
    return result;
  });

async function recordAuditEvent(
  ctx: Context,
  path: string,
  organizationId: string,
  input: unknown,
) {
  try {
    if (!ctx.session || !ctx.actor) return;
    const membership = await ensureOrganizationAccess(
      ctx.session.user.id,
      organizationId,
    );
    const [resource = "system", operation = "read"] = path.split(".");
    const action = resolveAuditAction(operation);
    const resourceType = resolveAuditResourceType(resource);
    const metadata = sanitizeAuditInput(input);
    await ctx.scope.resolve(CreateAuditLogUseCaseToken).execute({
      organizationId,
      actorId: ctx.actor.userId,
      actorName: ctx.session.user.name,
      actorEmail: ctx.session.user.email,
      actorRole: membership.role,
      action,
      resourceType,
      resourceId: typeof metadata.id === "string" ? metadata.id : null,
      resourceName: typeof metadata.name === "string" ? metadata.name : null,
      route: path,
      metadata,
      ipAddress: ctx.honoContext.req.header("x-forwarded-for") ?? null,
      userAgent: ctx.honoContext.req.header("user-agent") ?? null,
    });
  } catch (error) {
    log.error({
      message: "Failed to persist audit event",
      route: path,
      organizationId,
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveAuditOrganizationId(
  ctx: Context,
  path: string,
  input: unknown,
): Promise<string | undefined> {
  if (input && typeof input === "object" && "organizationId" in input) {
    const value = input.organizationId;
    if (typeof value === "string" && value) return value;
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return undefined;
  const values = input as Record<string, unknown>;
  const id = ["resourceId", "environmentId", "projectId", "serverId", "id"]
    .map((key) => values[key])
    .find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  if (!id) return undefined;
  const uow = ctx.scope.resolve(UnitOfWorkToken);
  const resource = path.split(".")[0];
  if (resource === "project")
    return (await uow.projectRepository.findById(id))?.organizationId;
  if (resource === "environment") {
    const environment = await uow.environmentRepository.findById(id);
    return environment
      ? (await uow.projectRepository.findById(environment.projectId))
          ?.organizationId
      : undefined;
  }
  if (resource === "resource") {
    const service = await uow.resourceRepository.findById(id);
    if (!service) return undefined;
    const environment = await uow.environmentRepository.findById(
      service.environmentId,
    );
    return environment
      ? (await uow.projectRepository.findById(environment.projectId))
          ?.organizationId
      : undefined;
  }
  if (resource === "deployment") {
    const deployment = await uow.deploymentRepository.findById(id);
    if (!deployment) return undefined;
    const service = await uow.resourceRepository.findById(
      deployment.resourceId,
    );
    if (!service) return undefined;
    const environment = await uow.environmentRepository.findById(
      service.environmentId,
    );
    return environment
      ? (await uow.projectRepository.findById(environment.projectId))
          ?.organizationId
      : undefined;
  }
  if (resource === "server")
    return (await uow.serverRepository.findById(id))?.organizationId;
  if (resource === "notification") {
    return (
      (await uow.notificationChannelRepository.findById(id))?.organizationId ??
      (await uow.notificationDeliveryRepository.findById(id))?.organizationId
    );
  }
  if (resource === "tag")
    return (await uow.tagRepository.findById(id))?.organizationId;
  if (resource === "template")
    return (await uow.templateRepository.findById(id))?.organizationId;
  if (resource === "certificate")
    return (await uow.certificateRepository.findById(id))?.organizationId;
  if (resource === "gitProvider")
    return (await uow.gitProviderRepository.findById(id))?.organizationId;
  if (resource === "dockerRegistry")
    return (await uow.dockerRegistryRepository.findById(id))?.organizationId;
  if (resource === "s3Destination")
    return (await uow.s3DestinationRepository.findById(id))?.organizationId;
  if (resource === "sshKey")
    return (await uow.sshKeyRepository.findById(id))?.organizationId;
  if (resource === "schedule") {
    const schedule = await uow.scheduleRepository.findById(id);
    if (!schedule?.resourceId) return undefined;
    const service = await uow.resourceRepository.findById(schedule.resourceId);
    if (!service) return undefined;
    const environment = await uow.environmentRepository.findById(
      service.environmentId,
    );
    return environment
      ? (await uow.projectRepository.findById(environment.projectId))
          ?.organizationId
      : undefined;
  }
  return undefined;
}

function resolveAuditAction(operation: string): (typeof AUDIT_ACTIONS)[number] {
  if (operation.toLowerCase().includes("invite")) return "invite";
  if (
    operation.toLowerCase().includes("revoke") ||
    operation.toLowerCase().includes("remove")
  )
    return "revoke";
  if (operation.toLowerCase().includes("rotate")) return "rotate";
  if (operation.toLowerCase().includes("test")) return "test";
  if (operation.toLowerCase().includes("import")) return "import";
  if (operation.toLowerCase().includes("restore")) return "restore";
  if (operation.toLowerCase().includes("retry")) return "run";
  if (operation.toLowerCase().includes("duplicate")) return "duplicate";
  if (operation.toLowerCase().includes("delete")) return "delete";
  if (operation.toLowerCase().includes("create")) return "create";
  if (operation.toLowerCase().includes("update")) return "update";
  if (operation.toLowerCase().includes("deploy")) return "deploy";
  if (operation.toLowerCase().includes("cancel")) return "cancel";
  if (operation.toLowerCase().includes("start")) return "start";
  if (operation.toLowerCase().includes("stop")) return "stop";
  if (operation.toLowerCase().includes("reload")) return "reload";
  if (operation.toLowerCase().includes("run")) return "run";
  if (
    operation.toLowerCase().includes("config") ||
    operation.toLowerCase().includes("save")
  )
    return "configure";
  return "read";
}

function resolveAuditResourceType(
  resource: string,
): (typeof AUDIT_RESOURCE_TYPES)[number] {
  const aliases: Record<string, (typeof AUDIT_RESOURCE_TYPES)[number]> = {
    ai: "settings",
    apiKey: "settings",
    application: "application",
    compose: "compose",
    customRole: "custom_role",
    database: "database",
    domain: "domain",
    dockerRegistry: "registry",
    gitProvider: "git_provider",
    mount: "mount",
    port: "port",
    s3Destination: "backup",
    sshKey: "ssh_key",
    tag: "tag",
    template: "template",
    webServer: "settings",
  };
  return (
    aliases[resource] ??
    ((AUDIT_RESOURCE_TYPES as readonly string[]).includes(resource)
      ? (resource as (typeof AUDIT_RESOURCE_TYPES)[number])
      : "system")
  );
}

function sanitizeAuditInput(input: unknown): JsonObject {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const sensitive =
    /key|token|password|secret|credential|cookie|authorization|environment/i;
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (sensitive.test(key)) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.length;
    } else if (typeof value === "object") {
      result[key] = "[redacted object]";
    }
  }
  return result;
}

// Two-Factor verified procedures check if user has 2FA enabled and if it's verified in Redis
export const twoFactorVerifiedProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (isApiKeyPrincipal(ctx.actor)) {
      return next();
    }
    if (ctx.session.user.twoFactorEnabled) {
      const verified = await redis.get(
        `2fa-verified:${ctx.session.session.id}`,
      );
      if (verified !== "true") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "2FA verification required",
          cause: "2FA_PENDING",
        });
      }
    }
    return next();
  },
);
