import { TRPCError } from "@trpc/server";
import { UnitOfWorkToken } from "@upstand/domain";
import {
  CreateServerInputSchema,
  DeleteServerInputSchema,
  GetServerRuntimeStatsInputSchema,
  GetServersInputSchema,
  SetupServerInputSchema,
  GetServerHistoricalMetricsInputSchema,
} from "@upstand/usecases";
import {
  CreateServerUseCaseToken,
  DeleteServerUseCaseToken,
  GetServerRuntimeStatsUseCaseToken,
  GetServersUseCaseToken,
  SetupServerUseCaseToken,
  GetServerHistoricalMetricsUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const serverRouter = router({
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

  historicalMetrics: twoFactorVerifiedProcedure
    .input(GetServerHistoricalMetricsInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );

      const useCase = ctx.scope.resolve(
        GetServerHistoricalMetricsUseCaseToken,
      );
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
