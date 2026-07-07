import { TRPCError } from "@trpc/server";
import { createDb } from "@upstand/db";
import { member } from "@upstand/db/schema/auth";
import {
  CreateProjectInputSchema,
  GetProjectsInputSchema,
} from "@upstand/usecases";
import { and, eq } from "drizzle-orm";
import { CreateProjectUseCaseToken, GetProjectsUseCaseToken } from "../di";
import { handleUseCaseError } from "../errors";
import { protectedProcedure, router } from "../index";

// Access Control Helper: Check if user is in organization and optionally verify role
async function checkOrgMembership(
  userId: string,
  orgId: string,
  allowedRoles?: string[],
) {
  const db = createDb();
  const membership = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1)
    .then((r) => r[0]);

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

export const projectRouter = router({
  create: protectedProcedure
    .input(CreateProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Access Control: Must be an owner or admin of the organization to create projects
      await checkOrgMembership(ctx.session.user.id, input.organizationId, [
        "owner",
        "admin",
      ]);

      const useCase = ctx.scope.resolve(CreateProjectUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: protectedProcedure
    .input(GetProjectsInputSchema)
    .query(async ({ ctx, input }) => {
      // Access Control: Must be a member of the organization to view projects
      await checkOrgMembership(ctx.session.user.id, input.organizationId);

      const useCase = ctx.scope.resolve(GetProjectsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
