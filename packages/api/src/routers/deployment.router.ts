import { ValidationError } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { getDeploymentQueueName, getDockerInstance } from "@upstand/usecases";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import { Queue } from "bullmq";
import { z } from "zod";
import {
  GetDeploymentsUseCaseToken,
  GetQueueUseCaseToken,
  UpdateConcurrencyUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";

export const deploymentRouter = router({
  getDeployments: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    const useCase = ctx.scope.resolve(GetDeploymentsUseCaseToken);
    try {
      return await useCase.execute();
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  getQueue: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    const useCase = ctx.scope.resolve(GetQueueUseCaseToken);
    try {
      return await useCase.execute();
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  getServerSettings: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    const uow = ctx.scope.resolve(UnitOfWorkToken);
    try {
      // 1. Fetch current Swarm nodes
      const dInstance = getDockerInstance();

      const nodes: any[] = [];
      try {
        const info = await dInstance.info();
        if (info.Swarm && info.Swarm.LocalNodeState === "active") {
          const list = await dInstance.listNodes();
          for (const n of list) {
            nodes.push({
              id: n.ID,
              hostname: n.Description?.Hostname || n.ID,
              ip: n.Status?.Addr || "127.0.0.1",
              isLeader: n.ManagerStatus?.Leader || false,
            });
          }
        }
      } catch {}

      // If Swarm is inactive, fallback to local node representation
      if (nodes.length === 0) {
        nodes.push({
          id: "local",
          hostname: "Dokploy Server",
          ip: "127.0.0.1",
          isLeader: true,
        });
      }

      // 2. Fetch DB configurations
      const dbSettings = await uow.serverBuildSettingsRepository.findMany();
      const settingsMap = new Map(dbSettings.map((s) => [s.id, s]));

      // 3. Merge
      return nodes.map((node) => {
        const dbSetting = settingsMap.get(node.id);
        return {
          id: node.id,
          hostname: dbSetting?.hostname || node.hostname,
          ip: dbSetting?.ip || node.ip,
          concurrency: dbSetting?.concurrency || (node.isLeader ? 2 : 1),
        };
      });
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  updateServerConcurrency: twoFactorVerifiedProcedure
    .input(
      z.object({
        serverId: z.string().min(1),
        concurrency: z.number().int().min(1).max(100),
        hostname: z.string().optional(),
        ip: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(UpdateConcurrencyUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  cancelDeploymentJob: twoFactorVerifiedProcedure
    .input(
      z.object({
        serverId: z.string().min(1),
        jobId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const queueName = getDeploymentQueueName(input.serverId);
      const queue = new Queue(queueName, { connection: redis as any });

      try {
        const job = await queue.getJob(input.jobId);
        if (job) {
          const state = await job.getState();
          if (state === "active") {
            throw new ValidationError(
              "An active deployment cannot be cancelled safely; wait for it to finish.",
            );
          }
          await job.remove();

          // Update deployment status in database to failed
          const deploymentId = job.data?.deploymentId;
          if (deploymentId) {
            await uow.transaction(async (tx) => {
              const dep = await tx.deploymentRepository.findById(deploymentId);
              if (dep && dep.status !== "success" && dep.status !== "failed") {
                await tx.deploymentRepository.updateById(deploymentId, {
                  status: "failed",
                  logs: `${dep.logs}\nDeployment cancelled by user. 🛑\n`,
                });

                // Update resource status too
                const r = await tx.resourceRepository.findById(dep.resourceId);
                if (r && r.status === "queued") {
                  const depsList = JSON.parse(r.deployments || "[]");
                  const idx = depsList.findIndex(
                    (d: any) => d.id === deploymentId,
                  );
                  if (idx > -1) {
                    depsList[idx].status = "failed";
                    depsList[idx].logs =
                      `${depsList[idx].logs || ""}\nDeployment cancelled by user. 🛑\n`;
                  }
                  await tx.resourceRepository.updateById(dep.resourceId, {
                    status: "stopped",
                    deployments: JSON.stringify(depsList),
                  });
                }
              }
            });
          }

          return { success: true };
        }
        throw new ValidationError("Job not found in queue");
      } catch (error) {
        handleUseCaseError(error);
      } finally {
        await queue.close();
      }
    }),
});
