import { env } from "@upstand/env/server";
import type { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServiceProvider } from "../di";
import type { AppEnv } from "./types";

type IdentifyUser = (
  logger: AppEnv["Variables"]["log"],
  headers: Headers,
  path?: string,
) => Promise<boolean>;

export type HttpMiddlewareDependencies = {
  getServiceProvider(): ServiceProvider;
  identifyUser: IdentifyUser;
};

export function registerHttpMiddleware(
  app: Hono<AppEnv>,
  dependencies: HttpMiddlewareDependencies,
): void {
  app.use("*", async (c, next) => {
    const scope = dependencies.getServiceProvider().createScope();
    c.set("scope", scope);
    try {
      await next();
    } finally {
      await scope.dispose();
    }
  });

  app.use("*", async (c, next) => {
    await dependencies.identifyUser(
      c.get("log"),
      c.req.raw.headers,
      c.req.path,
    );
    await next();
  });

  app.use(
    "/*",
    cors({
      origin: (origin, c) => {
        if (!origin) return undefined;
        if (origin === env.CORS_ORIGIN) return origin;

        try {
          const originUrl = new URL(origin);
          if (
            originUrl.hostname === "localhost" ||
            originUrl.hostname === "127.0.0.1" ||
            originUrl.hostname === "::1" ||
            originUrl.hostname === "[::1]" ||
            originUrl.hostname.startsWith("127.")
          ) {
            return origin;
          }

          const requestUrl = new URL(c.req.url);
          if (originUrl.hostname === requestUrl.hostname) return origin;

          const configuredCorsUrl = new URL(
            env.CORS_ORIGIN || "http://localhost:3001",
          );
          if (originUrl.hostname === configuredCorsUrl.hostname) return origin;
        } catch {
          // Fall through to the configured origin for malformed origins.
        }

        return env.CORS_ORIGIN || "http://localhost:3001";
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
}
