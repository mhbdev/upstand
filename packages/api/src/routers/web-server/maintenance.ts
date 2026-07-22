import {
  ReloadWebServerUseCaseToken,
  UnitOfWorkToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { getErrorMessage, handleUseCaseError } from "../../errors";
import { twoFactorVerifiedProcedure } from "../../index";
import { requireInstanceOwnerContext } from "../../instance-access";
import {
  CleanupInputSchema,
  checkGpuStatus,
  execInContainer,
  forceServiceUpdate,
  getRedisPassword,
  getRunningServiceContainer,
  requireWebServerOwner,
  runDockerCleanup,
  setupGpuSupport,
  UPSTAND_REDIS_SERVICE,
  UPSTAND_SERVER_SERVICE,
} from "../web-server.shared";

export const webServerMaintenanceProcedures = {
  reload: twoFactorVerifiedProcedure
    .input(z.object({ action: z.enum(["reload", "restart"]) }))
    .mutation(async ({ ctx, input }) => {
      await requireWebServerOwner(ctx);
      const useCase = ctx.scope.resolve(ReloadWebServerUseCaseToken);
      try {
        return await useCase.execute(input.action);
      } catch (error) {
        handleUseCaseError(error, ctx.log);
      }
    }),

  reloadServer: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireWebServerOwner(ctx);
    try {
      await forceServiceUpdate(UPSTAND_SERVER_SERVICE);
      return { success: true };
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Failed to restart server container"),
      );
    }
  }),

  cleanRedis: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireWebServerOwner(ctx);
    try {
      const [container, password] = await Promise.all([
        getRunningServiceContainer(UPSTAND_REDIS_SERVICE),
        getRedisPassword(),
      ]);
      await execInContainer(container, [
        "redis-cli",
        "--no-auth-warning",
        "-a",
        password,
        "FLUSHALL",
      ]);
      return { success: true };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to flush Redis"));
    }
  }),

  reloadRedis: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireWebServerOwner(ctx);
    try {
      await forceServiceUpdate(UPSTAND_REDIS_SERVICE);
      return { success: true };
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "Failed to restart Redis container"),
      );
    }
  }),

  cleanAllDeploymentQueue: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx }) => {
      await requireInstanceOwnerContext(ctx);
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      try {
        await uow.transaction(async (tx) => {
          const runningDeployments =
            await tx.deploymentRepository.findByStatus("running");
          for (const deployment of runningDeployments) {
            await tx.deploymentRepository.updateById(deployment.id, {
              status: "failed",
              logs: `${deployment.logs}\nDeployment cancelled by clean deployment queue operation.\n`,
            });
          }
          const resources = await tx.resourceRepository.findMany();
          for (const r of resources) {
            if (r.status === "running") {
              await tx.resourceRepository.updateById(r.id, {
                status: "stopped",
              });
            }
          }
        });
        return { success: true };
      } catch (error) {
        throw new Error(
          getErrorMessage(error, "Failed to clean deployment queue"),
        );
      }
    }),

  cleanUnusedImages: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker image prune --all --force",
        "Failed to clean unused images",
      ),
    ),

  cleanUnusedVolumes: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker volume prune --all --force",
        "Failed to clean unused volumes",
      ),
    ),

  cleanStoppedContainers: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker container prune --force",
        "Failed to clean stopped containers",
      ),
    ),

  cleanDockerBuilder: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker builder prune --all --force",
        "Failed to clean docker builder",
      ),
    ),

  cleanDockerPrune: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker system prune --all --force",
        "Failed to prune docker system",
      ),
    ),

  cleanAll: twoFactorVerifiedProcedure
    .input(CleanupInputSchema)
    .mutation(({ ctx }) =>
      runDockerCleanup(
        ctx,
        "docker container prune --force && docker image prune --all --force && docker volume prune --all --force && docker builder prune --all --force && docker system prune --all --force",
        "Failed to run all prunes",
      ),
    ),

  checkGpuStatus: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    await requireWebServerOwner(ctx);
    try {
      return await checkGpuStatus();
    } catch {
      return {
        driverInstalled: false,
        driverVersion: undefined,
        gpuModel: undefined,
        memoryInfo: undefined,
        runtimeInstalled: false,
        runtimeConfigured: false,
        cudaSupport: false,
        cudaVersion: undefined,
        availableGPUs: 0,
        swarmEnabled: false,
        gpuResources: 0,
      };
    }
  }),

  setupGpuSupport: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireWebServerOwner(ctx);
    try {
      await setupGpuSupport();
      return { success: true };
    } catch (err) {
      throw new Error(getErrorMessage(err, "Failed to configure GPU support"));
    }
  }),

  updateServerIp: twoFactorVerifiedProcedure
    .input(
      z
        .object({
          ip: z.string().min(1).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      await requireWebServerOwner(ctx);
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      let ip = input?.ip;
      if (!ip) {
        try {
          const res = await fetch("https://api.ipify.org?format=json");
          const data = (await res.json()) as { ip: string };
          ip = data.ip;
        } catch (error) {
          try {
            const os = await import("node:os");
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
              for (const net of interfaces[name] || []) {
                if (net.family === "IPv4" && !net.internal) {
                  ip = net.address;
                  break;
                }
              }
              if (ip) break;
            }
          } catch {}
          if (!ip) {
            throw new Error(
              getErrorMessage(
                error,
                "Failed to query server public IP and no local IP detected",
              ),
            );
          }
        }
      }

      let settings = await uow.webServerSettingsRepository.findGlobal();
      if (!settings) {
        settings = await uow.webServerSettingsRepository.createGlobal({});
      }
      await uow.webServerSettingsRepository.updateGlobal({ serverIp: ip });
      return { success: true, ip };
    }),
};
