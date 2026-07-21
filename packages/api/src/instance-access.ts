import { TRPCError } from "@trpc/server";
import { db } from "@upstand/db";
import { user } from "@upstand/db/schema/auth";
import { env } from "@upstand/env/server";
import { asc } from "drizzle-orm";

/**
 * The first account is the instance owner created by migration 0015. An
 * explicit environment override is supported for installations that need to
 * transfer ownership without changing tenant memberships.
 */
export async function requireInstanceOwner(
  userId: string,
  actorKind: string | undefined,
): Promise<void> {
  if (actorKind !== "session") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Instance operations require an interactive owner session",
    });
  }

  const configuredOwner = env.UPSTAND_INSTANCE_OWNER_USER_ID?.trim();
  if (configuredOwner) {
    if (configuredOwner !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Instance owner permission required",
      });
    }
    return;
  }

  const firstUser = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!firstUser || firstUser.id !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Instance owner permission required",
    });
  }
}

export async function requireInstanceOwnerContext(ctx: {
  session: { user: { id: string } };
  actor?: { kind: string } | null;
}): Promise<void> {
  await requireInstanceOwner(ctx.session.user.id, ctx.actor?.kind);
}
