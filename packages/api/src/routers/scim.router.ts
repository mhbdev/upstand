import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { createDb } from "@upstand/db";
import { scimProvider } from "@upstand/db/schema/scim";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import { assertEnterpriseFeature } from "../enterprise";
import { router, twoFactorVerifiedProcedure } from "../index";

const baseInput = z.object({ organizationId: z.string().min(1) });

function createScimToken(): { token: string; hash: string; prefix: string } {
  const token = `upscim_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    prefix: token.slice(0, 14),
  };
}

async function assertManager(userId: string, organizationId: string) {
  const membership = await ensureOrganizationAccess(userId, organizationId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners and admins can manage SCIM",
    });
  }
  return membership;
}

export const scimRouter = router({
  list: twoFactorVerifiedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      await assertManager(ctx.session.user.id, input.organizationId);
      await assertEnterpriseFeature(
        ctx.session.user.id,
        input.organizationId,
        "scim",
      );
      const db = createDb();
      const rows = await db
        .select({
          id: scimProvider.id,
          organizationId: scimProvider.organizationId,
          providerId: scimProvider.providerId,
          tokenPrefix: scimProvider.tokenPrefix,
          createdAt: scimProvider.createdAt,
          updatedAt: scimProvider.updatedAt,
        })
        .from(scimProvider)
        .where(eq(scimProvider.organizationId, input.organizationId));
      return rows;
    }),

  create: twoFactorVerifiedProcedure
    .input(baseInput.extend({ providerId: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.session.user.id, input.organizationId);
      await assertEnterpriseFeature(
        ctx.session.user.id,
        input.organizationId,
        "scim",
      );
      const db = createDb();
      const token = createScimToken();
      try {
        const [row] = await db
          .insert(scimProvider)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            providerId: input.providerId,
            tokenHash: token.hash,
            tokenPrefix: token.prefix,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({
            id: scimProvider.id,
            providerId: scimProvider.providerId,
            tokenPrefix: scimProvider.tokenPrefix,
          });
        if (!row) throw new Error("SCIM provider was not created");
        return { ...row, token: token.token };
      } catch (error) {
        if (String(error).toLowerCase().includes("unique")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A SCIM provider with this ID already exists",
          });
        }
        throw error;
      }
    }),

  rotate: twoFactorVerifiedProcedure
    .input(baseInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.session.user.id, input.organizationId);
      await assertEnterpriseFeature(
        ctx.session.user.id,
        input.organizationId,
        "scim",
      );
      const db = createDb();
      const token = createScimToken();
      const [row] = await db
        .update(scimProvider)
        .set({
          tokenHash: token.hash,
          tokenPrefix: token.prefix,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scimProvider.id, input.id),
            eq(scimProvider.organizationId, input.organizationId),
          ),
        )
        .returning({
          id: scimProvider.id,
          providerId: scimProvider.providerId,
          tokenPrefix: scimProvider.tokenPrefix,
        });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row, token: token.token };
    }),

  remove: twoFactorVerifiedProcedure
    .input(baseInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertManager(ctx.session.user.id, input.organizationId);
      await assertEnterpriseFeature(
        ctx.session.user.id,
        input.organizationId,
        "scim",
      );
      const db = createDb();
      const deleted = await db
        .delete(scimProvider)
        .where(
          and(
            eq(scimProvider.id, input.id),
            eq(scimProvider.organizationId, input.organizationId),
          ),
        )
        .returning({ id: scimProvider.id });
      if (!deleted.length) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),
});
