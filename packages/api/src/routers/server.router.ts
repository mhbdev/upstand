import { TRPCError } from "@trpc/server";
import {
  ControlDockerContainerInputSchema,
  ControlDockerResourceInputSchema,
  CreateServerInputSchema,
  DeleteServerInputSchema,
  GetDockerInventoryInputSchema,
  GetServerCountInputSchema,
  GetServerHistoricalMetricsInputSchema,
  GetServerInputSchema,
  GetServerMonitoringStatusInputSchema,
  GetServerRuntimeStatsInputSchema,
  GetServersInputSchema,
  SetupServerInputSchema,
  UpdateMonitoringSettingsInputSchema,
  UpdateServerInputSchema,
} from "@upstand/usecases";
import {
  CreateServerUseCaseToken,
  DeleteServerUseCaseToken,
  GetDockerInventoryUseCaseToken,
  GetServerCountUseCaseToken,
  GetServerHistoricalMetricsUseCaseToken,
  GetServerMonitoringStatusUseCaseToken,
  GetServerRuntimeStatsUseCaseToken,
  GetServersUseCaseToken,
  GetServerUseCaseToken,
  SetupServerUseCaseToken,
  ScanServerHostKeyUseCaseToken,
  UnitOfWorkToken,
  UpdateMonitoringSettingsUseCaseToken,
  UpdateServerUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const serverRouter = router({
  count: twoFactorVerifiedProcedure
    .input(GetServerCountInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      try {
        return await ctx.scope
          .resolve(GetServerCountUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  one: twoFactorVerifiedProcedure
    .input(GetServerInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      try {
        return await ctx.scope.resolve(GetServerUseCaseToken).execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  controlContainer: twoFactorVerifiedProcedure
    .input(ControlDockerContainerInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:update",
      );
      const useCase = ctx.scope.resolve(GetDockerInventoryUseCaseToken);
      try {
        return await useCase.controlContainer(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  controlResource: twoFactorVerifiedProcedure
    .input(ControlDockerResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:update",
      );
      const useCase = ctx.scope.resolve(GetDockerInventoryUseCaseToken);
      try {
        return await useCase.controlResource(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  validate: twoFactorVerifiedProcedure
    .input(
      GetDockerInventoryInputSchema.pick({
        organizationId: true,
        serverId: true,
      }).extend({
        serverId: GetDockerInventoryInputSchema.shape.serverId.unwrap(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      const useCase = ctx.scope.resolve(GetDockerInventoryUseCaseToken);
      try {
        return await useCase.execute({
          organizationId: input.organizationId,
          serverId: input.serverId,
          kind: "info",
          tail: 150,
        });
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  time: twoFactorVerifiedProcedure
    .input(
      GetDockerInventoryInputSchema.pick({
        organizationId: true,
        serverId: true,
      }).extend({
        serverId: GetDockerInventoryInputSchema.shape.serverId.unwrap(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      const useCase = ctx.scope.resolve(GetDockerInventoryUseCaseToken);
      try {
        return await useCase.getHostTime(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  inventory: twoFactorVerifiedProcedure
    .input(GetDockerInventoryInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      const useCase = ctx.scope.resolve(GetDockerInventoryUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  runtimeStats: twoFactorVerifiedProcedure
    .input(GetServerRuntimeStatsInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );

      const useCase = ctx.scope.resolve(GetServerRuntimeStatsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  monitoringSettings: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        serverId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );

      const uow = ctx.scope.resolve(UnitOfWorkToken);
      if (input.serverId !== "local") {
        const server = await uow.serverRepository.findById(input.serverId);
        if (!server || server.organizationId !== input.organizationId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        }
      }

      const settings = await uow.monitoringSettingsRepository.findByServerId(
        input.serverId,
      );
      return {
        serverId: input.serverId,
        isConfigured: Boolean(settings),
        cpuThreshold: settings?.cpuThreshold ?? 90,
        memoryThreshold: settings?.memoryThreshold ?? 90,
      };
    }),

  create: twoFactorVerifiedProcedure
    .input(CreateServerInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:create",
      );

      const useCase = ctx.scope.resolve(CreateServerUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetServersInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );

      const useCase = ctx.scope.resolve(GetServersUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteServerInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const server = await uow.serverRepository.findById(input.id);
      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Server not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        server.organizationId,
        "server:delete",
      );

      const useCase = ctx.scope.resolve(DeleteServerUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  setup: twoFactorVerifiedProcedure
    .input(SetupServerInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const server = await uow.serverRepository.findById(input.id);
      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Server not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        server.organizationId,
        "server:create",
      );

      const useCase = ctx.scope.resolve(SetupServerUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        handleUseCaseError(error);
      }
    }),

  scanHostKey: twoFactorVerifiedProcedure
    .input(
      z.object({
        ipAddress: z.string().min(1, "IP address is required"),
        port: z.number().default(22),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(ScanServerHostKeyUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        handleUseCaseError(error);
      }
    }),

  update: twoFactorVerifiedProcedure
    .input(UpdateServerInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:update",
      );
      try {
        return await ctx.scope.resolve(UpdateServerUseCaseToken).execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateMonitoringSettings: twoFactorVerifiedProcedure
    .input(UpdateMonitoringSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:update",
      );
      try {
        return await ctx.scope
          .resolve(UpdateMonitoringSettingsUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  historicalMetrics: twoFactorVerifiedProcedure
    .input(GetServerHistoricalMetricsInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );

      const useCase = ctx.scope.resolve(GetServerHistoricalMetricsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  monitoringStatus: twoFactorVerifiedProcedure
    .input(GetServerMonitoringStatusInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      try {
        return await ctx.scope
          .resolve(GetServerMonitoringStatusUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
