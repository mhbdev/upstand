import { TRPCError } from "@trpc/server";
import {
  AssignResourceTagInputSchema,
  CreateTagInputSchema,
  DeleteTagInputSchema,
  ListTagsInputSchema,
  ResourceTagsInputSchema,
  UpdateTagInputSchema,
} from "@upstand/usecases";
import type { Context } from "../context";
import {
  AssignResourceTagUseCaseToken,
  CreateTagUseCaseToken,
  DeleteTagUseCaseToken,
  ListResourceTagsUseCaseToken,
  ListTagsUseCaseToken,
  RemoveResourceTagUseCaseToken,
  UnitOfWorkToken,
  UpdateTagUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

async function resourceOrganization(
  ctx: Pick<Context, "scope">,
  resourceId: string,
) {
  const uow = ctx.scope.resolve(UnitOfWorkToken);
  const resource = await uow.resourceRepository.findById(resourceId);
  if (!resource)
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  const environment = await uow.environmentRepository.findById(
    resource.environmentId,
  );
  const project = environment
    ? await uow.projectRepository.findById(environment.projectId)
    : null;
  if (!project)
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  return project.organizationId;
}

export const tagRouter = router({
  list: twoFactorVerifiedProcedure
    .input(ListTagsInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "tag:view",
      );
      return ctx.scope.resolve(ListTagsUseCaseToken).execute(input);
    }),
  create: twoFactorVerifiedProcedure
    .input(CreateTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "tag:create",
      );
      try {
        return await ctx.scope.resolve(CreateTagUseCaseToken).execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  update: twoFactorVerifiedProcedure
    .input(UpdateTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "tag:update",
      );
      try {
        return await ctx.scope.resolve(UpdateTagUseCaseToken).execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  remove: twoFactorVerifiedProcedure
    .input(DeleteTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "tag:delete",
      );
      try {
        return await ctx.scope.resolve(DeleteTagUseCaseToken).execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  forResource: twoFactorVerifiedProcedure
    .input(ResourceTagsInputSchema)
    .query(async ({ ctx, input }) => {
      const organizationId = await resourceOrganization(ctx, input.resourceId);
      await checkPermission(ctx.session.user.id, organizationId, "tag:view");
      return ctx.scope.resolve(ListResourceTagsUseCaseToken).execute(input);
    }),
  assign: twoFactorVerifiedProcedure
    .input(AssignResourceTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await resourceOrganization(ctx, input.resourceId);
      await checkPermission(ctx.session.user.id, organizationId, "tag:update");
      try {
        return await ctx.scope
          .resolve(AssignResourceTagUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  removeFromResource: twoFactorVerifiedProcedure
    .input(AssignResourceTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await resourceOrganization(ctx, input.resourceId);
      await checkPermission(ctx.session.user.id, organizationId, "tag:update");
      try {
        return await ctx.scope
          .resolve(RemoveResourceTagUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
