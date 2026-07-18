import {
  CreateTemplateInputSchema,
  DeleteTemplateInputSchema,
  DeployTemplateInputSchema,
  ListTemplatesInputSchema,
  listNativeTemplates,
  STARTER_TEMPLATES,
  UpdateTemplateInputSchema,
} from "@upstand/usecases";
import {
  CreateTemplateUseCaseToken,
  DeleteTemplateUseCaseToken,
  DeployTemplateUseCaseToken,
  ListTemplatesUseCaseToken,
  UpdateTemplateUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const templateRouter = router({
  starters: twoFactorVerifiedProcedure.query(() => STARTER_TEMPLATES),

  catalog: twoFactorVerifiedProcedure
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
      }),
    )
    .query(async ({ input }) => {
      return listNativeTemplates(input.search).map((template) => ({
        ...template,
        source: "builtin" as const,
      }));
    }),

  list: twoFactorVerifiedProcedure
    .input(ListTemplatesInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "template:view",
      );
      return ctx.scope.resolve(ListTemplatesUseCaseToken).execute(input);
    }),

  create: twoFactorVerifiedProcedure
    .input(CreateTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "template:create",
      );
      try {
        return await ctx.scope
          .resolve(CreateTemplateUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  update: twoFactorVerifiedProcedure
    .input(UpdateTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "template:update",
      );
      try {
        return await ctx.scope
          .resolve(UpdateTemplateUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  remove: twoFactorVerifiedProcedure
    .input(DeleteTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "template:delete",
      );
      try {
        return await ctx.scope
          .resolve(DeleteTemplateUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deploy: twoFactorVerifiedProcedure
    .input(DeployTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "template:deploy",
      );
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "resource:create",
      );
      try {
        return await ctx.scope
          .resolve(DeployTemplateUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
