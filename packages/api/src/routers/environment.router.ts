import { TRPCError } from "@trpc/server";
import type { Environment } from "@upstand/domain";
import {
  CreateEnvironmentInputSchema,
  DeleteEnvironmentInputSchema,
  GetEnvironmentInputSchema,
  GetEnvironmentsInputSchema,
  parseResourceEnvironmentVariables,
  UpdateEnvironmentInputSchema,
} from "@upstand/usecases";
import {
  CreateEnvironmentUseCaseToken,
  DeleteEnvironmentUseCaseToken,
  GetEnvironmentsUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  UpdateEnvironmentUseCaseToken,
} from "@upstand/usecases/tokens";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

function publicEnvironment(env: Environment) {
  const { envVars, ...rest } = env;
  return {
    ...rest,
    envVars: parseResourceEnvironmentVariables(envVars),
  };
}

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
        const result = await useCase.execute(input);
        return publicEnvironment(result);
      } catch (error) {
        handleUseCaseError(error, ctx.log);
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
        const result = await useCase.execute(input);
        return result.map(publicEnvironment);
      } catch (error) {
        handleUseCaseError(error, ctx.log);
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

      return publicEnvironment(environment);
    }),

  update: twoFactorVerifiedProcedure
    .input(UpdateEnvironmentInputSchema)
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
        "environment:update",
      );

      const updateUseCase = ctx.scope.resolve(UpdateEnvironmentUseCaseToken);
      try {
        const result = await updateUseCase.execute(input);
        return publicEnvironment(result);
      } catch (error) {
        handleUseCaseError(error, ctx.log);
      }
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
        handleUseCaseError(error, ctx.log);
      }
    }),
});
