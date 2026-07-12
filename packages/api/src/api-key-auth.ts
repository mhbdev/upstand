import { TRPCError } from "@trpc/server";
import { auth } from "@upstand/auth";
import {
  API_KEY_CONFIG_ID,
  type ApiKeyPermissions,
  statementsToApiKeyPermissions,
} from "@upstand/domain";

export type ApiKeyPrincipal = {
  kind: "api-key";
  keyId: string;
  organizationId: string;
  userId: string;
  name: string | null;
  permissions: ApiKeyPermissions;
  rateLimit: {
    enabled: boolean;
    max: number | null;
    windowMs: number | null;
    remaining: number | null;
    lastRequest: Date | null;
  };
};

function getApiKeyValue(headers: Headers): string | null {
  const explicit = headers.get("x-api-key")?.trim();
  if (explicit) return explicit;
  const authorization = headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const value = authorization.slice("Bearer ".length).trim();
  return value || null;
}

export async function authenticateApiKey(
  headers: Headers,
): Promise<ApiKeyPrincipal | null> {
  const value = getApiKeyValue(headers);
  if (!value) return null;

  const result = await auth.api.verifyApiKey({
    body: { configId: API_KEY_CONFIG_ID, key: value },
  });
  if (!result.valid || !result.key) return null;

  const metadata = result.key.metadata;
  const userId =
    metadata && typeof metadata.createdBy === "string"
      ? metadata.createdBy
      : `api-key:${result.key.id}`;

  return {
    kind: "api-key",
    keyId: result.key.id,
    organizationId: result.key.referenceId,
    userId,
    name: result.key.name,
    permissions: statementsToApiKeyPermissions(result.key.permissions),
    rateLimit: {
      enabled: result.key.rateLimitEnabled,
      max: result.key.rateLimitMax,
      windowMs: result.key.rateLimitTimeWindow,
      remaining: result.key.remaining,
      lastRequest: result.key.lastRequest,
    },
  };
}

export function isApiKeyPrincipal(
  actor: { kind: string } | null | undefined,
): actor is ApiKeyPrincipal {
  return actor?.kind === "api-key";
}

export function setApiKeyRateLimitHeaders(
  actor: ApiKeyPrincipal,
  setHeader: (name: string, value: string) => void,
): void {
  if (!actor.rateLimit.enabled || actor.rateLimit.max === null) return;
  const resetAt =
    actor.rateLimit.lastRequest && actor.rateLimit.windowMs
      ? actor.rateLimit.lastRequest.getTime() + actor.rateLimit.windowMs
      : Date.now() + (actor.rateLimit.windowMs ?? 0);
  setHeader("X-RateLimit-Limit", String(actor.rateLimit.max));
  setHeader(
    "X-RateLimit-Remaining",
    String(Math.max(0, actor.rateLimit.remaining ?? actor.rateLimit.max)),
  );
  setHeader("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));
}

const ROUTE_PERMISSIONS: Record<string, string> = {
  "project.list": "project:view",
  "project.get": "project:view",
  "project.create": "project:create",
  "project.deleteProject": "project:delete",
  "environment.list": "environment:view",
  "environment.get": "environment:view",
  "environment.create": "environment:create",
  "environment.delete": "environment:delete",
  "resource.list": "resource:view",
  "resource.getContainers": "resource:view",
  "resource.getLogs": "resource:view",
  "resource.getStats": "resource:view",
  "resource.getRoutingTargets": "resource:view",
  "resource.create": "resource:create",
  "resource.update": "resource:update",
  "resource.deploy": "resource:update",
  "resource.control": "resource:update",
  "resource.delete": "resource:delete",
  "backup.listSchedules": "backup:view",
  "backup.listRuns": "backup:view",
  "backup.listVolumes": "backup:view",
  "backup.createSchedule": "backup:manage",
  "backup.updateSchedule": "backup:manage",
  "backup.deleteSchedule": "backup:manage",
  "backup.runNow": "backup:manage",
  "backup.restore": "backup:manage",
  "notification.list": "notification:view",
  "notification.create": "notification:create",
  "notification.update": "notification:update",
  "notification.remove": "notification:delete",
  "notification.test": "notification:update",
  "ai.settings": "ai:view",
  "ai.conversations": "ai:view",
  "ai.getConversation": "ai:view",
  "ai.createConversation": "ai:manage",
  "ai.saveSettings": "ai:manage",
  "ai.removeSettings": "ai:manage",
  "ai.testSettings": "ai:manage",
};

export function requiredApiKeyPermission(path: string): string | null {
  return ROUTE_PERMISSIONS[path] ?? null;
}

export async function enforceApiKeyRoute(
  path: string,
  actor: ApiKeyPrincipal,
  rawInput: unknown,
): Promise<void> {
  const required = requiredApiKeyPermission(path);
  if (!required || path.startsWith("apiKey.")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This endpoint requires an interactive user session.",
    });
  }
  if (!actor.organizationId || actor.userId.startsWith("api-key:")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This API key has no auditable organization user.",
    });
  }
  const input = rawInput;
  // Resource-scoped procedures intentionally resolve the organization from
  // the resource before calling the existing membership/permission guard.
  // For organization-scoped inputs, reject cross-organization access here so
  // a malformed request cannot reach the router implementation.
  if (
    typeof input === "object" &&
    input !== null &&
    "organizationId" in input &&
    input.organizationId !== actor.organizationId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The API key cannot access another organization.",
    });
  }
  if (
    !actor.permissions.upstand.includes("*") &&
    !actor.permissions.upstand.includes(required)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `API key permission required: ${required}`,
    });
  }
}
