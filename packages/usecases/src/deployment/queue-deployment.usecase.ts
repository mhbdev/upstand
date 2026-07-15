import { randomUUID } from "node:crypto";
import {
  type IUnitOfWork,
  type Resource,
  ValidationError,
} from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";
import { getDeploymentQueueName } from "./deployment-queue-name";

export interface QueueDeploymentInput {
  resourceId: string;
  title?: string;
  previewDeploymentId?: string;
  sourceRevision?: string;
}

export interface DeploymentQueue {
  add(
    name: string,
    data: {
      resourceId: string;
      deploymentId: string;
      previewDeploymentId?: string;
      sourceRevision?: string;
    },
    options: {
      jobId: string;
      attempts: number;
      removeOnComplete: number;
      removeOnFail: number;
    },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export type DeploymentQueueFactory = (queueName: string) => DeploymentQueue;

export interface LocalDeploymentTarget {
  name: string;
  ip: string;
}

export type LocalDeploymentTargetResolver =
  () => Promise<LocalDeploymentTarget>;

const defaultLocalDeploymentTarget: LocalDeploymentTargetResolver =
  async () => ({
    name: "Dokploy Server",
    ip: "127.0.0.1",
  });

const createDeploymentQueue: DeploymentQueueFactory = (queueName) =>
  new Queue(queueName, { connection: redis as any });

export class QueueDeploymentUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly queueFactory: DeploymentQueueFactory = createDeploymentQueue,
    private readonly localTargetResolver: LocalDeploymentTargetResolver = defaultLocalDeploymentTarget,
  ) {}

  async execute(input: QueueDeploymentInput): Promise<Resource> {
    const queued = await this.uow.transaction(async (tx) => {
      const resource = await tx.resourceRepository.findById(input.resourceId);
      if (!resource) {
        throw new ValidationError("Resource not found");
      }
      if (
        input.sourceRevision &&
        !/^[0-9a-f]{7,64}$/i.test(input.sourceRevision)
      ) {
        throw new ValidationError("Source revision must be a commit SHA");
      }

      // 1. Resolve target serverId
      let serverId = resource.serverId;
      let serverName = "Dokploy Server";
      let serverIp = "127.0.0.1";

      if (!serverId) {
        const target = await this.localTargetResolver();
        serverName = target.name;
        serverIp = target.ip;

        // Always keep the sentinel so the deployment worker uses the local Docker socket.
        serverId = "local";

        // Save serverId on resource
        await tx.resourceRepository.updateById(resource.id, {
          serverId,
        });
      } else {
        // Fetch server name
        const server = await tx.serverRepository.findById(serverId);
        if (server) {
          serverName = server.name;
          serverIp = server.ipAddress;
        } else {
          const settings =
            await tx.serverBuildSettingsRepository.findById(serverId);
          if (settings) {
            serverName = settings.hostname;
            serverIp = settings.ip;
          }
        }
      }

      // Ensure serverBuildSettings record exists in the DB so it is listed
      const settings =
        await tx.serverBuildSettingsRepository.findById(serverId);
      if (!settings) {
        await tx.serverBuildSettingsRepository.create({
          id: serverId,
          hostname: serverName,
          ip: serverIp,
          concurrency: serverId === "local" || serverId === "manager" ? 2 : 1,
        });
      }

      const deploymentId = `dep-${randomUUID()}`;
      const title = input.title || "Manual deployment";

      // 2. Create the deployment record in the database
      await tx.deploymentRepository.create({
        id: deploymentId,
        resourceId: resource.id,
        status: "queued",
        title,
        logs: "Added to queue. Waiting for slot...\n",
        serverId,
        serverName,
        sourceRevision: input.sourceRevision ?? null,
      });

      // 3. Update the resource's JSON deployments list (backwards compatibility)
      const currentDeps = JSON.parse(resource.deployments || "[]");
      const newDeploymentItem = {
        id: deploymentId,
        status: "queued" as const,
        createdAt: new Date().toISOString(),
        logs: "Added to queue. Waiting for slot...\n",
        ...(input.sourceRevision
          ? { sourceRevision: input.sourceRevision }
          : {}),
      };
      const updatedDeps = [newDeploymentItem, ...currentDeps].slice(0, 10);

      const updatedResource = await tx.resourceRepository.updateById(
        resource.id,
        {
          status: "queued",
          deployments: JSON.stringify(updatedDeps),
        },
      );

      if (!updatedResource) {
        throw new Error("Failed to update resource with queued state");
      }

      return {
        deploymentId,
        previousResourceStatus: resource.status,
        serverId,
        updatedResource,
      };
    });

    const queueName = getDeploymentQueueName(queued.serverId);
    const queue = this.queueFactory(queueName);
    try {
      await queue.add(
        "deploy",
        {
          resourceId: queued.updatedResource.id,
          deploymentId: queued.deploymentId,
          previewDeploymentId: input.previewDeploymentId,
          sourceRevision: input.sourceRevision,
        },
        {
          jobId: queued.deploymentId,
          attempts: 1,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
      return queued.updatedResource;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.uow.transaction(async (tx) => {
        const deployment = await tx.deploymentRepository.findById(
          queued.deploymentId,
        );
        if (deployment?.status === "queued") {
          await tx.deploymentRepository.updateById(queued.deploymentId, {
            status: "failed",
            logs: `${deployment.logs}\nUnable to enqueue deployment: ${message}\n`,
          });
        }

        const resource = await tx.resourceRepository.findById(
          queued.updatedResource.id,
        );
        if (resource) {
          const deployments = JSON.parse(resource.deployments || "[]");
          const item = deployments.find(
            (candidate: { id?: string }) =>
              candidate.id === queued.deploymentId,
          );
          if (item) {
            item.status = "failed";
            item.logs = `${item.logs || ""}\nUnable to enqueue deployment: ${message}\n`;
          }
          await tx.resourceRepository.updateById(resource.id, {
            deployments: JSON.stringify(deployments),
            status:
              resource.status === "queued"
                ? queued.previousResourceStatus
                : resource.status,
          });
        }
      });
      throw error;
    } finally {
      await queue.close();
    }
  }
}
