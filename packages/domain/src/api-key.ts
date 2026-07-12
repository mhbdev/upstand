import { z } from "zod";

export const API_KEY_CONFIG_ID = "upstand" as const;

export const API_KEY_PERMISSION_ACTIONS = [
  "project:create",
  "project:view",
  "project:delete",
  "environment:create",
  "environment:view",
  "environment:delete",
  "resource:create",
  "resource:view",
  "resource:update",
  "resource:delete",
  "ssh_key:create",
  "ssh_key:view",
  "ssh_key:delete",
  "git_provider:create",
  "git_provider:view",
  "git_provider:delete",
  "s3_destination:create",
  "s3_destination:view",
  "s3_destination:update",
  "s3_destination:delete",
  "docker_registry:create",
  "docker_registry:view",
  "docker_registry:delete",
  "server:create",
  "server:view",
  "server:delete",
  "notification:create",
  "notification:view",
  "notification:update",
  "notification:delete",
  "deployment:view",
  "deployment:manage",
  "backup:view",
  "backup:manage",
  "swarm:view",
  "swarm:manage",
  "ai:view",
  "ai:manage",
] as const;

export type ApiKeyPermissionAction =
  (typeof API_KEY_PERMISSION_ACTIONS)[number];

export const ApiKeyPermissionsSchema = z.object({
  upstand: z.array(z.string().min(1)).default([]),
  mcp: z.array(z.string().min(1)).default([]),
});

export type ApiKeyPermissions = z.infer<typeof ApiKeyPermissionsSchema>;

export const ApiKeyPresetSchema = z.enum([
  "read-only",
  "deployment",
  "operations",
  "mcp-read-only",
  "full-access",
]);

export type ApiKeyPreset = z.infer<typeof ApiKeyPresetSchema>;

export const API_KEY_PRESETS: Record<ApiKeyPreset, ApiKeyPermissions> = {
  "read-only": {
    upstand: API_KEY_PERMISSION_ACTIONS.filter((action) =>
      action.endsWith(":view"),
    ),
    mcp: ["read"],
  },
  deployment: {
    upstand: [
      "project:view",
      "environment:view",
      "resource:view",
      "resource:update",
      "deployment:view",
      "deployment:manage",
    ],
    mcp: ["read"],
  },
  operations: {
    upstand: [
      "project:view",
      "environment:view",
      "resource:view",
      "resource:update",
      "deployment:view",
      "deployment:manage",
      "backup:view",
      "backup:manage",
      "swarm:view",
      "swarm:manage",
    ],
    mcp: ["read"],
  },
  "mcp-read-only": { upstand: [], mcp: ["read"] },
  "full-access": { upstand: ["*"], mcp: ["*"] },
};

export function apiKeyPermissionsToStatements(
  permissions: ApiKeyPermissions,
): Record<string, string[]> {
  return {
    upstand: [...new Set(permissions.upstand)],
    mcp: [...new Set(permissions.mcp)],
  };
}

export function statementsToApiKeyPermissions(
  permissions: Record<string, string[]> | null | undefined,
): ApiKeyPermissions {
  return ApiKeyPermissionsSchema.parse({
    upstand: permissions?.upstand ?? [],
    mcp: permissions?.mcp ?? [],
  });
}

export function hasApiKeyPermission(
  permissions: ApiKeyPermissions,
  required: string,
): boolean {
  return (
    permissions.upstand.includes("*") || permissions.upstand.includes(required)
  );
}

export function hasMcpPermission(
  permissions: ApiKeyPermissions,
  toolName?: string,
): boolean {
  if (permissions.mcp.includes("*")) return true;
  if (permissions.mcp.includes("read")) return true;
  return Boolean(toolName && permissions.mcp.includes(`tool:${toolName}`));
}
