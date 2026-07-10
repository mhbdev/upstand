import { TRPCError } from "@trpc/server";
import { createDb } from "@upstand/db";
import { member } from "@upstand/db/schema/auth";
import { and, eq } from "drizzle-orm";

export async function ensureOrganizationAccess(
  userId: string,
  organizationId: string,
  allowedRoles?: string[],
) {
  const db = createDb();
  const membership = await db
    .select()
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    });
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Required role not met. Allowed roles: ${allowedRoles.join(", ")}`,
    });
  }

  return membership;
}
