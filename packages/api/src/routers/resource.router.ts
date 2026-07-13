import { TRPCError } from "@trpc/server";
import {
  ControlContainerInputSchema,
  ControlResourceInputSchema,
  CreateResourceInputSchema,
  DeleteResourceInputSchema,
  DeployResourceInputSchema,
  GetResourceContainersInputSchema,
  GetResourceInputSchema,
  GetResourceLogsInputSchema,
  GetResourceRoutingTargetsInputSchema,
  GetResourceStatsInputSchema,
  GetResourcesInputSchema,
  UpdateResourceInputSchema,
} from "@upstand/usecases";
import { log } from "evlog";
import {
  ControlContainerUseCaseToken,
  ControlResourceUseCaseToken,
  CreateResourceUseCaseToken,
  DeleteResourceUseCaseToken,
  DeployResourceUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  GetResourceContainersUseCaseToken,
  GetResourceLogsUseCaseToken,
  GetResourceRoutingTargetsUseCaseToken,
  GetResourceStatsUseCaseToken,
  GetResourcesUseCaseToken,
  GetResourceUseCaseToken,
  UpdateResourceUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const resourceRouter = router({
  create: twoFactorVerifiedProcedure
    .input(CreateResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({ id: input.environmentId });
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
        "resource:create",
      );

      const useCase = ctx.scope.resolve(CreateResourceUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetResourcesInputSchema)
    .query(async ({ ctx, input }) => {
      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({ id: input.environmentId });
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
        "resource:view",
      );

      const useCase = ctx.scope.resolve(GetResourcesUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  get: twoFactorVerifiedProcedure
    .input(GetResourceInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute(input);
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:view",
      );

      if (resource.type === "database" && resource.credentials) {
        try {
          const payload = JSON.parse(resource.credentials);
          if (payload.ciphertext && payload.iv && payload.authTag) {
            const { decryptSecret } = await import(
              "@upstand/platform/crypto/secret-box"
            );
            const decrypted = decryptSecret(payload);
            return {
              ...resource,
              credentials: decrypted,
            };
          }
        } catch (e: any) {
          log.error({
            message: "Failed to decrypt database credentials in router",
            err: e.message || e,
          });
        }
      }

      return resource;
    }),

  update: twoFactorVerifiedProcedure
    .input(UpdateResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:update",
      );

      const updateUseCase = ctx.scope.resolve(UpdateResourceUseCaseToken);
      try {
        return await updateUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:delete",
      );

      const deleteUseCase = ctx.scope.resolve(DeleteResourceUseCaseToken);
      try {
        return await deleteUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deploy: twoFactorVerifiedProcedure
    .input(DeployResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute(input);
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:update",
      );

      const deployUseCase = ctx.scope.resolve(DeployResourceUseCaseToken);
      try {
        return await deployUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  control: twoFactorVerifiedProcedure
    .input(ControlResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:update",
      );

      const controlUseCase = ctx.scope.resolve(ControlResourceUseCaseToken);
      try {
        return await controlUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  controlContainer: twoFactorVerifiedProcedure
    .input(ControlContainerInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resourceUseCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await resourceUseCase.execute({ id: input.resourceId });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const environmentUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await environmentUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:update",
      );

      const useCase = ctx.scope.resolve(ControlContainerUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getContainers: twoFactorVerifiedProcedure
    .input(GetResourceContainersInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute(input);
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:view",
      );

      const getContainersUseCase = ctx.scope.resolve(
        GetResourceContainersUseCaseToken,
      );
      try {
        return await getContainersUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getRoutingTargets: twoFactorVerifiedProcedure
    .input(GetResourceRoutingTargetsInputSchema)
    .query(async ({ ctx, input }) => {
      const resourceUseCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await resourceUseCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const environmentUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await environmentUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:view",
      );

      const useCase = ctx.scope.resolve(GetResourceRoutingTargetsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getLogs: twoFactorVerifiedProcedure
    .input(GetResourceLogsInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:view",
      );

      const getLogsUseCase = ctx.scope.resolve(GetResourceLogsUseCaseToken);
      try {
        return await getLogsUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getStats: twoFactorVerifiedProcedure
    .input(GetResourceStatsInputSchema)
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetResourceUseCaseToken);
      const resource = await useCase.execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      const envUseCase = ctx.scope.resolve(GetEnvironmentUseCaseToken);
      const environment = await envUseCase.execute({
        id: resource.environmentId,
      });
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
        "resource:view",
      );

      const getStatsUseCase = ctx.scope.resolve(GetResourceStatsUseCaseToken);
      try {
        return await getStatsUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
