import { initTRPC, TRPCError } from "@trpc/server";
import { redis } from "@upstand/redis";
import { log } from "evlog";
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
    return next();
  });

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
