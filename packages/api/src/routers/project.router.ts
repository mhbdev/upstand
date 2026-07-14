import { TRPCError } from "@trpc/server";
import {
  CreateProjectInputSchema,
  DeleteProjectInputSchema,
  DuplicateProjectInputSchema,
  GetProjectInputSchema,
  GetProjectsInputSchema,
} from "@upstand/usecases";
import {
  CreateProjectUseCaseToken,
  DeleteProjectUseCaseToken,
  DuplicateProjectUseCaseToken,
  GetProjectsUseCaseToken,
  GetProjectUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const projectRouter = router({
  create: twoFactorVerifiedProcedure
    .input(CreateProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:create",
      );

      const useCase = ctx.scope.resolve(CreateProjectUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetProjectsInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:view",
      );

      const useCase = ctx.scope.resolve(GetProjectsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  get: twoFactorVerifiedProcedure
    .input(GetProjectInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetProjectUseCaseToken);
      try {
        const project = await useCase.execute(input);
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });
        }

        await checkPermission(
          ctx.session.user.id,
          project.organizationId,
          "project:view",
        );

        return project;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deleteProject: twoFactorVerifiedProcedure
    .input(DeleteProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:delete",
      );

      const useCase = ctx.scope.resolve(DeleteProjectUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  duplicate: twoFactorVerifiedProcedure
    .input(DuplicateProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:create",
      );
      const useCase = ctx.scope.resolve(DuplicateProjectUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
