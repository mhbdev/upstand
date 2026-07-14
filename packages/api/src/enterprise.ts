import { ensureOrganizationAccess } from "./access-control";

export type EnterpriseFeature = "sso" | "scim" | "custom_roles" | "whitelabel";

export function hasEnterpriseFeature(
  _license: unknown,
  _feature: EnterpriseFeature,
  _now = new Date(),
): boolean {
  return true;
}

export async function assertEnterpriseFeature(
  userId: string,
  organizationId: string,
  _feature: EnterpriseFeature,
): Promise<void> {
  await ensureOrganizationAccess(userId, organizationId);
}
