import { TRPCError } from "@trpc/server";
import {
  CAPABILITY_ACTIONS,
  type Capability,
  capabilitiesForRole,
  type OrganizationRole,
  parseCapabilities,
} from "@upstand/domain";
import { ensureOrganizationAccess } from "./access-control";

/** Backwards-compatible name used by routers while the catalog stays domain-owned. */
export type PermissionAction = Capability;

/**
 * Role grants are generated from CAPABILITY_CATALOG. There is intentionally
 * no instance-wide role in this map: instance capabilities cannot be granted
 * by an ordinary organization membership.
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, PermissionAction[]> = {
  owner: [...capabilitiesForRole("owner")],
  admin: [...capabilitiesForRole("admin")],
  member: [...capabilitiesForRole("member")],
};

export const PERMISSION_ACTIONS = CAPABILITY_ACTIONS;

export type AuthorizationActor = {
  userId: string;
  organizationId: string;
};

/** The application policy decision point used by session-backed routes. */
export class AuthorizationService {
  async authorize(actor: AuthorizationActor, action: PermissionAction) {
    const membership = await ensureOrganizationAccess(
      actor.userId,
      actor.organizationId,
    );
    const permissions = membership.permissions
      ? parseStoredPermissions(membership.permissions)
      : ROLE_PERMISSIONS[membership.role as OrganizationRole] || [];

    if (!permissions.includes(action)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Required permission not met. Action '${action}' is not allowed for role '${membership.role}'`,
      });
    }

    return membership;
  }
}

function parseStoredPermissions(value: string): PermissionAction[] {
  try {
    return parseCapabilities(JSON.parse(value));
  } catch {
    return [];
  }
}

const authorizationService = new AuthorizationService();

/**
 * Checks if a user has a capability in an organization. All existing router
 * call sites now pass through the same policy decision point.
 */
export async function checkPermission(
  userId: string,
  organizationId: string,
  action: PermissionAction,
) {
  return authorizationService.authorize({ userId, organizationId }, action);
}
