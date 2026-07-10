import { TRPCError } from "@trpc/server";
import {
  CreateEnvironmentInputSchema,
  DeleteEnvironmentInputSchema,
  GetEnvironmentInputSchema,
  GetEnvironmentsInputSchema,
} from "@upstand/usecases";
import {
  CreateEnvironmentUseCaseToken,
  DeleteEnvironmentUseCaseToken,
  GetEnvironmentsUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const environmentRouter = router({
  create: twoFactorVerifiedProcedure
    .input(CreateEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const projectUseCase = ctx.scope.resolve(GetProjectUseCaseToken);
      const project = await projectUseCase.execute({ id: input.projectId });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "environment:create",
      );

      const useCase = ctx.scope.resolve(CreateEnvironmentUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetEnvironmentsInputSchema)
    .query(async ({ ctx, input }) => {
      const projectUseCase = ctx.scope.resolve(GetProjectUseCaseToken);
      const project = await projectUseCase.execute({ id: input.projectId });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "environment:view",
      );

      const useCase = ctx.scope.resolve(GetEnvironmentsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  get: twoFactorVerifiedProcedure
    .input(GetEnvironmentInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await useCase.execute(input);
      if (!environment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      const projectUseCase = ctx.scope.resolve(GetProjectUseCaseToken);
      const project = await projectUseCase.execute({
        id: environment.projectId,
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "environment:view",
      );

      return environment;
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await useCase.execute({ id: input.id });
      if (!environment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      }

      const projectUseCase = ctx.scope.resolve(GetProjectUseCaseToken);
      const project = await projectUseCase.execute({
        id: environment.projectId,
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "environment:delete",
      );

      const deleteUseCase = ctx.scope.resolve(DeleteEnvironmentUseCaseToken);
      try {
        return await deleteUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
