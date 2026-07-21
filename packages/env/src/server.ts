import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(currentDir, "../../..");

dotenv.config();
dotenv.config({ path: path.join(monorepoRoot, "apps", "server", ".env") });
dotenv.config({ path: path.join(monorepoRoot, ".env") });

const isTest = process.env.NODE_ENV === "test";

const validatedEnv = createEnv({
  server: {
    DATABASE_URL: isTest ? z.string().optional() : z.string().min(1),
    BETTER_AUTH_SECRET: isTest ? z.string().optional() : z.string().min(32),
    BETTER_AUTH_URL: isTest ? z.string().optional() : z.url(),
    CORS_ORIGIN: isTest ? z.string().optional() : z.url(),
    TRUSTED_PROXY_CIDRS: z.string().default(""),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    IS_CLOUD: z
      .preprocess(
        (val) => val === "true" || val === "1" || val === true,
        z.boolean(),
      )
      .default(false),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    UPSTAND_AUTO_UPDATE: z
      .preprocess(
        (val) => val === "true" || val === "1" || val === true,
        z.boolean(),
      )
      .default(false),
    UPSTAND_SERVER_IMAGE: z.string().min(1).optional(),
    SERVER_ID: z.string().min(1).optional(),
    UPSTAND_CONTROL_PLANE_SSH_HOST_KEY_FINGERPRINT: z
      .string()
      .min(1)
      .optional(),
    PORT: z.coerce.number().default(3000),
    UPSTAND_MONITORING_IMAGE: z.string().min(1).optional(),
    DB_MIGRATIONS_PATH: z.string().min(1).optional(),
    UPGAL_MCP_SERVERS: z.string().optional(),
    UPGAL_WEB_SEARCH_API_KEY: z.string().optional(),
    UPGAL_WEB_SEARCH_BASE_URL: z
      .string()
      .url()
      .default("https://api.search.brave.com/res/v1/web/search"),
    UPSTAND_INSTANCE_OWNER_USER_ID: z.string().min(1).optional(),
    DOCKER_NETWORK: z.string().min(1).default("upstand-network"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    UPSTAND_BASE_URL: z.string().url().optional(),
    APP_URL: z.string().url().optional(),
    UPSTAND_POSTGRES_CONTAINER: z.string().min(1).optional(),
    SSH_KEY_ENCRYPTION_KEY_V1: isTest
      ? z.string().optional()
      : z.string().min(1),
    UPSTAND_GIT_PROVIDER_ALLOWED_HOSTS: z.string().optional(),
    UPSTAND_DOCKER_VERSION: z.string().min(1).optional(),
    UPSTAND_VERSION: z.string().min(1).optional(),
    UPSTAND_WEB_IMAGE: z.string().min(1).optional(),
    GITHUB_REPOSITORY: z.string().min(1).default("mhbdev/upstand"),
    UPSTAND_GITHUB_TOKEN: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    UPSTAND_DOCS_HOST: z.string().optional(),
    UPSTAND_DASHBOARD_HOST: z.string().optional(),
    UPSTAND_API_HOST: z.string().optional(),
    UPSTAND_SERVER_UPSTREAM: z.string().optional(),
    UPSTAND_WEB_UPSTREAM: z.string().optional(),
    UPSTAND_FUMADOCS_UPSTREAM: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.NEXT_PHASE === "phase-production-build",
  emptyStringAsUndefined: true,
});

export const env = new Proxy(validatedEnv, {
  get(target, prop) {
    if (process.env.NODE_ENV === "test") {
      const val = process.env[prop as string];
      if (val !== undefined) {
        if (prop === "IS_CLOUD" || prop === "UPSTAND_AUTO_UPDATE") {
          return val === "true" || val === "1";
        }
        if (prop === "PORT") {
          return Number(val);
        }
        return val;
      }
    }
    return (target as any)[prop];
  },
}) as typeof validatedEnv;

if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = env.NODE_ENV;
}
