import { TRPCError } from "@trpc/server";
import { ensureOrganizationAccess } from "./access-control";

export type PermissionAction =
  // Project Permissions
  | "project:create"
  | "project:view"
  | "project:delete"
  // Environment Permissions
  | "environment:create"
  | "environment:view"
  | "environment:delete"
  // Resource Permissions
  | "resource:create"
  | "resource:view"
  | "resource:update"
  | "resource:delete"
  // SSH Key Permissions
  | "ssh_key:create"
  | "ssh_key:view"
  | "ssh_key:delete"
  // Git Provider Permissions
  | "git_provider:create"
  | "git_provider:view"
  | "git_provider:delete"
  // S3 Destination Permissions
  | "s3_destination:create"
  | "s3_destination:view"
  | "s3_destination:delete"
  // Docker Registry Permissions
  | "docker_registry:create"
  | "docker_registry:view"
  | "docker_registry:delete"
  // Server Permissions
  | "server:create"
  | "server:view"
  | "server:delete"
  // Notification permissions
  | "notification:create"
  | "notification:view"
  | "notification:update"
  | "notification:delete";

// Role-to-permissions mapping
export const ROLE_PERMISSIONS: Record<string, PermissionAction[]> = {
  owner: [
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
  ],
  admin: [
    "project:create",
    "project:view",
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
  ],
  member: [
    "project:view",
    "environment:view",
    "resource:view",
    "resource:update",
    "ssh_key:view",
    "git_provider:view",
    "s3_destination:view",
    "docker_registry:view",
    "server:view",
    "notification:view",
  ],
};

/**
 * Checks if a user has a specific permission in an organization.
 * Throws a TRPCError FORBIDDEN if the permission check fails.
 */
export async function checkPermission(
  userId: string,
  organizationId: string,
  action: PermissionAction,
) {
  const membership = await ensureOrganizationAccess(userId, organizationId);
  let permissions = ROLE_PERMISSIONS[membership.role] || [];
  if (membership.permissions) {
    try {
      permissions = JSON.parse(membership.permissions) as PermissionAction[];
    } catch {
      permissions = [];
    }
  }

  if (!permissions.includes(action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Required permission not met. Action '${action}' is not allowed for role '${membership.role}'`,
    });
  }

  return membership;
}
