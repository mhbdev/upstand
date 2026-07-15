import { TRPCError } from "@trpc/server";
import { createDb } from "@upstand/db";
import { organization, ssoProvider } from "@upstand/db/schema/auth";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import { router, twoFactorVerifiedProcedure } from "../index";

const inputSchema = z.object({ organizationId: z.string().min(1) });

async function assertManager(userId: string, organizationId: string) {
  const membership = await ensureOrganizationAccess(userId, organizationId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can manage SSO",
    });
  }
  return membership;
}

function parseMetadata(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const ssoRouter = router({
  getSettings: twoFactorVerifiedProcedure
    .input(inputSchema)
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      const db = createDb();
      const [workspace, providerCount] = await Promise.all([
        db
          .select({ metadata: organization.metadata })
          .from(organization)
          .where(eq(organization.id, input.organizationId))
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select({ value: count() })
          .from(ssoProvider)
          .where(eq(ssoProvider.organizationId, input.organizationId))
          .then((rows) => rows[0]?.value ?? 0),
      ]);
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        organizationId: input.organizationId,
        enforced: parseMetadata(workspace.metadata).ssoEnforced === true,
        providerCount,
      };
    }),

  updateSettings: twoFactorVerifiedProcedure
    .input(inputSchema.extend({ enforced: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.session.user.id, input.organizationId);
      const db = createDb();
      const current = await db
        .select({ metadata: organization.metadata })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.enforced) {
        const verified = await db
          .select({ value: count() })
          .from(ssoProvider)
          .where(
            and(
              eq(ssoProvider.organizationId, input.organizationId),
              eq(ssoProvider.domainVerified, true),
            ),
          )
          .then((rows) => rows[0]?.value ?? 0);
        if (verified === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Verify at least one SSO provider domain before enforcing SSO",
          });
        }
      }

      const metadata = {
        ...parseMetadata(current.metadata),
        ssoEnforced: input.enforced,
      };
      await db
        .update(organization)
        .set({ metadata: JSON.stringify(metadata) })
        .where(eq(organization.id, input.organizationId));
      return { organizationId: input.organizationId, enforced: input.enforced };
    }),
});
