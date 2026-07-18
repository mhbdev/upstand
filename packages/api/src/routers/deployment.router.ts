import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { getDeploymentQueueName, getDockerInstance } from "@upstand/usecases";
import {
  GetDeploymentsUseCaseToken,
  GetQueueUseCaseToken,
  GetRequestsUseCaseToken,
  UnitOfWorkToken,
  UpdateConcurrencyUseCaseToken,
} from "@upstand/usecases/tokens";
import { Queue } from "bullmq";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

const OrganizationInputSchema = z.object({
  organizationId: z.string().min(1),
});

async function getDeploymentScope(
  ctx: any,
  deploymentId: string,
  permission: "resource:view" | "resource:update",
) {
  const uow = ctx.scope.resolve(UnitOfWorkToken);
  const deployment = await uow.deploymentRepository.findById(deploymentId);
  if (!deployment) throw new ValidationError("Deployment not found");
  const resource = await uow.resourceRepository.findById(deployment.resourceId);
  if (!resource) throw new ValidationError("Deployment resource not found");
  const environment = await uow.environmentRepository.findById(
    resource.environmentId,
  );
  const project = environment
    ? await uow.projectRepository.findById(environment.projectId)
    : null;
  if (!project) throw new ValidationError("Deployment project not found");
  await checkPermission(
    ctx.session.user.id,
    project.organizationId,
    permission,
  );
  return { uow, deployment, resource, project };
}

export const deploymentRouter = router({
  getByResource: twoFactorVerifiedProcedure
    .input(z.object({ resourceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const resource = await uow.resourceRepository.findById(input.resourceId);
      if (!resource) throw new ValidationError("Resource not found");
      const environment = await uow.environmentRepository.findById(
        resource.environmentId,
      );
      const project = environment
        ? await uow.projectRepository.findById(environment.projectId)
        : null;
      if (!project) throw new ValidationError("Project not found");
      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "resource:view",
      );
      return uow.deploymentRepository.findByResourceId(input.resourceId);
    }),

  getDeployments: twoFactorVerifiedProcedure
    .input(OrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:view",
      );
      const useCase = ctx.scope.resolve(GetDeploymentsUseCaseToken);
      try {
        return await useCase.executeForOrganization(input.organizationId);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getQueue: twoFactorVerifiedProcedure
    .input(OrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:view",
      );
      const useCase = ctx.scope.resolve(GetQueueUseCaseToken);
      try {
        return await useCase.executeForOrganization(input.organizationId);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getRequests: twoFactorVerifiedProcedure
    .input(OrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "project:view",
      );
      const useCase = ctx.scope.resolve(GetRequestsUseCaseToken);
      try {
        return await useCase.execute(input.organizationId);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getServerSettings: twoFactorVerifiedProcedure
    .input(OrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
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

        // Registered remote servers are also independent deployment/build
        // queues. Surface them alongside Swarm nodes so their concurrency is
        // configurable from the same operational page.
        const remoteServers = await uow.serverRepository.findByOrganizationId(
          input.organizationId,
        );
        for (const server of remoteServers) {
          if (nodes.some((node) => node.id === server.id)) continue;
          nodes.push({
            id: server.id,
            hostname: server.name,
            ip: server.ipAddress,
            isLeader: false,
            status: server.status,
            serverType: server.serverType,
          });
        }

        // 3. Merge
        return nodes.map((node) => {
          const dbSetting = settingsMap.get(node.id);
          return {
            id: node.id,
            hostname: dbSetting?.hostname || node.hostname,
            ip: dbSetting?.ip || node.ip,
            concurrency: dbSetting?.concurrency || (node.isLeader ? 2 : 1),
            status: node.status || "ready",
            serverType: node.serverType || "swarm",
          };
        });
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateServerConcurrency: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        serverId: z.string().min(1),
        concurrency: z.number().int().min(1).max(100),
        hostname: z.string().optional(),
        ip: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:update",
      );
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
      const queueName = getDeploymentQueueName(input.serverId);
      const queue = new Queue(queueName, { connection: redis as any });

      try {
        const job = await queue.getJob(input.jobId);
        if (job) {
          const state = await job.getState();
          if (state === "active") {
            const deploymentId = job.data?.deploymentId;
            if (!deploymentId)
              throw new ValidationError(
                "Deployment job has no deployment record",
              );
            await getDeploymentScope(ctx, deploymentId, "resource:update");
            await redis.set(
              `upstand:deployment:cancel:${deploymentId}`,
              "1",
              "EX",
              3600,
            );
            return { success: true, state, cancellationRequested: true };
          }
          const deploymentId = job.data?.deploymentId;
          if (deploymentId) {
            const { uow } = await getDeploymentScope(
              ctx,
              deploymentId,
              "resource:update",
            );
            await job.remove();
            // Update deployment status in database to failed
            await uow.transaction(async (tx: IUnitOfWork) => {
              const dep = await tx.deploymentRepository.findById(deploymentId);
              if (dep && dep.status !== "success" && dep.status !== "failed") {
                await tx.deploymentRepository.updateById(deploymentId, {
                  status: "failed",
                  logs: `${dep.logs}\nDeployment cancelled by user. 🛑\n`,
                });

                const r = await tx.resourceRepository.findById(dep.resourceId);
                if (r && r.status === "queued") {
                  await tx.resourceRepository.updateById(dep.resourceId, {
                    status: "stopped",
                  });
                }
              }
            });
          } else {
            throw new ValidationError(
              "Deployment job has no deployment record",
            );
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

  killBuild: twoFactorVerifiedProcedure
    .input(z.object({ deploymentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { deployment } = await getDeploymentScope(
        ctx,
        input.deploymentId,
        "resource:update",
      );
      const queue = new Queue(
        getDeploymentQueueName(deployment.serverId || "local"),
        { connection: redis as any },
      );
      try {
        const job = await queue.getJob(input.deploymentId);
        if (!job)
          throw new ValidationError("Deployment job not found in queue");
        const state = await job.getState();
        if (state === "active") {
          await redis.set(
            `upstand:deployment:cancel:${input.deploymentId}`,
            "1",
            "EX",
            3600,
          );
          return { success: true, state, cancellationRequested: true };
        }
        await job.remove();
        return { success: true, state, cancellationRequested: false };
      } finally {
        await queue.close();
      }
    }),

  removeDeployment: twoFactorVerifiedProcedure
    .input(z.object({ deploymentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { uow, deployment } = await getDeploymentScope(
        ctx,
        input.deploymentId,
        "resource:update",
      );
      if (!["success", "failed"].includes(deployment.status)) {
        throw new ValidationError("Only completed deployments can be removed");
      }
      await uow.transaction(async (tx: IUnitOfWork) => {
        await tx.deploymentRepository.deleteById(deployment.id);
      });
      return { success: true };
    }),

  clearHistory: twoFactorVerifiedProcedure
    .input(z.object({ resourceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const resource = await uow.resourceRepository.findById(input.resourceId);
      if (!resource) throw new ValidationError("Resource not found");
      const environment = await uow.environmentRepository.findById(
        resource.environmentId,
      );
      const project = environment
        ? await uow.projectRepository.findById(environment.projectId)
        : null;
      if (!project) throw new ValidationError("Project not found");
      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "resource:update",
      );
      const deployments = await uow.deploymentRepository.findByResourceId(
        input.resourceId,
      );
      await uow.transaction(async (tx: IUnitOfWork) => {
        for (const deployment of deployments) {
          if (["success", "failed"].includes(deployment.status)) {
            await tx.deploymentRepository.deleteById(deployment.id);
          }
        }
      });
      return { success: true };
    }),
});
