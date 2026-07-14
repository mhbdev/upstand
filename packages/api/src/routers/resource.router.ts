import { TRPCError } from "@trpc/server";
import type { Resource } from "@upstand/domain";
import {
  ControlContainerInputSchema,
  ControlResourceInputSchema,
  CreateResourceInputSchema,
  DatabaseCommandInputSchema,
  DeleteResourceInputSchema,
  DeployResourceInputSchema,
  GetResourceContainersInputSchema,
  GetResourceInputSchema,
  GetResourceLogsInputSchema,
  GetResourcePreviewsInputSchema,
  GetResourceRoutingTargetsInputSchema,
  GetResourceStatsInputSchema,
  GetResourcesInputSchema,
  parseResourceEnvironmentVariables,
  QueueDeploymentUseCase,
  RandomizeComposeInputSchema,
  RebuildDatabaseInputSchema,
  RollbackResourceInputSchema,
  RotateResourceWebhookTokenInputSchema,
  resourceCredentialsJson,
  UpdateResourceInputSchema,
} from "@upstand/usecases";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import {
  ControlContainerUseCaseToken,
  ControlResourceUseCaseToken,
  CreateResourceUseCaseToken,
  DatabaseCommandUseCaseToken,
  DeleteResourceUseCaseToken,
  DeployResourceUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  GetResourceContainersUseCaseToken,
  GetResourceLogsUseCaseToken,
  GetResourcePreviewsUseCaseToken,
  GetResourceRoutingTargetsUseCaseToken,
  GetResourceStatsUseCaseToken,
  GetResourcesUseCaseToken,
  GetResourceUseCaseToken,
  RandomizeComposeUseCaseToken,
  RebuildDatabaseUseCaseToken,
  RollbackResourceUseCaseToken,
  RotateResourceWebhookTokenUseCaseToken,
  UpdateResourceUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

function publicResource(
  resource: Resource,
): Omit<Resource, "webhookTokenHash" | "buildSecrets"> {
  const {
    webhookTokenHash: _webhookTokenHash,
    buildSecrets: _buildSecrets,
    ...safeResource
  } = resource;
  return {
    ...safeResource,
    credentials: resourceCredentialsJson(resource),
    envVars: JSON.stringify(
      parseResourceEnvironmentVariables(resource.envVars),
    ),
  };
}

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
        return publicResource(await useCase.execute(input));
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
        return (await useCase.execute(input)).map(publicResource);
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

      return publicResource(resource);
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
        const updated = await updateUseCase.execute(input);
        return updated ? publicResource(updated) : updated;
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
        return publicResource(await deployUseCase.execute(input));
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
        return publicResource(await controlUseCase.execute(input));
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  rollback: twoFactorVerifiedProcedure
    .input(RollbackResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope.resolve(GetProjectUseCaseToken).execute({
            id: environment.projectId,
          })
        : null;
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
      try {
        if (resource.type === "compose") {
          if (resource.provider === "raw" || !input.deploymentId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Select a successful Git-backed Compose deployment to roll back",
            });
          }
          const uow = ctx.scope.resolve(UnitOfWorkToken);
          const historical = await uow.deploymentRepository.findById(
            input.deploymentId,
          );
          if (
            !historical ||
            historical.resourceId !== resource.id ||
            historical.status !== "success" ||
            !historical.sourceRevision
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "The selected deployment has no verified Git source revision",
            });
          }
          return publicResource(
            await new QueueDeploymentUseCase(uow).execute({
              resourceId: resource.id,
              title: `Compose rollback to ${historical.sourceRevision.slice(0, 12)}`,
              sourceRevision: historical.sourceRevision,
            }),
          );
        }
        if (input.deploymentId) {
          const gitBacked = [
            "github",
            "gitlab",
            "bitbucket",
            "gitea",
            "git",
          ].includes(resource.provider);
          if (resource.type !== "application" || !gitBacked) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Historical rollback is available only for Git-backed application resources",
            });
          }
          const uow = ctx.scope.resolve(UnitOfWorkToken);
          const historical = await uow.deploymentRepository.findById(
            input.deploymentId,
          );
          if (
            !historical ||
            historical.resourceId !== resource.id ||
            historical.status !== "success" ||
            !historical.sourceRevision
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "The selected deployment has no verified Git source revision",
            });
          }
          return publicResource(
            await new QueueDeploymentUseCase(uow).execute({
              resourceId: resource.id,
              title: `Application rollback to ${historical.sourceRevision.slice(0, 12)}`,
              sourceRevision: historical.sourceRevision,
            }),
          );
        }
        return publicResource(
          await ctx.scope.resolve(RollbackResourceUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  rebuildDatabase: twoFactorVerifiedProcedure
    .input(RebuildDatabaseInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope.resolve(GetProjectUseCaseToken).execute({
            id: environment.projectId,
          })
        : null;
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
      try {
        return publicResource(
          await ctx.scope.resolve(RebuildDatabaseUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  databaseCommand: twoFactorVerifiedProcedure
    .input(DatabaseCommandInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope.resolve(GetProjectUseCaseToken).execute({
            id: environment.projectId,
          })
        : null;
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
      try {
        return await ctx.scope
          .resolve(DatabaseCommandUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  randomizeCompose: twoFactorVerifiedProcedure
    .input(RandomizeComposeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope
            .resolve(GetProjectUseCaseToken)
            .execute({ id: environment.projectId })
        : null;
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
      try {
        return publicResource(
          await ctx.scope.resolve(RandomizeComposeUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  rotateWebhookToken: twoFactorVerifiedProcedure
    .input(RotateResourceWebhookTokenInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope.resolve(GetProjectUseCaseToken).execute({
            id: environment.projectId,
          })
        : null;
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
      return ctx.scope
        .resolve(RotateResourceWebhookTokenUseCaseToken)
        .execute(input);
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

  getPreviews: twoFactorVerifiedProcedure
    .input(GetResourcePreviewsInputSchema)
    .query(async ({ ctx, input }) => {
      const resource = await ctx.scope
        .resolve(GetResourceUseCaseToken)
        .execute({ id: input.id });
      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({ id: resource.environmentId });
      const project = environment
        ? await ctx.scope
            .resolve(GetProjectUseCaseToken)
            .execute({ id: environment.projectId })
        : null;
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
      try {
        return await ctx.scope
          .resolve(GetResourcePreviewsUseCaseToken)
          .execute(input);
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
