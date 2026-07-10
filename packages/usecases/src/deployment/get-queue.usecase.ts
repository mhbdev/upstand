import type { IUnitOfWork } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";
import { getDeploymentQueueName } from "./deployment-queue-name";

export interface QueueJobResult {
  id: string;
  label: string;
  type: string;
  state: string;
  addedAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  resourceId: string;
  resourceName: string;
  serverId: string;
  serverName: string;
}

export class GetQueueUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(): Promise<QueueJobResult[]> {
    // 1. Determine all active queues (servers)
    const servers = await this.uow.serverBuildSettingsRepository.findMany();
    const serverIds = servers.map((s) => s.id);

    // If empty, default to local
    if (serverIds.length === 0) {
      serverIds.push("local");
    }

    const resources = await this.uow.resourceRepository.findMany();
    const resourceMap = new Map(resources.map((r) => [r.id, r]));

    const serverMap = new Map(servers.map((s) => [s.id, s]));

    const allJobs: QueueJobResult[] = [];

    for (const serverId of serverIds) {
      const server = serverMap.get(serverId);
      const serverName =
        server?.hostname ||
        (serverId === "local" ? "Dokploy Server" : `Server ${serverId}`);
      const queueName = getDeploymentQueueName(serverId);
      const queue = new Queue(queueName, { connection: redis as any });

      try {
        const jobs = await queue.getJobs(
          ["active", "waiting", "delayed", "failed"],
          0,
          249,
          false,
        );
        for (const job of jobs) {
          const resourceId = job.data?.resourceId || "";
          const resource = resourceMap.get(resourceId);
          const state = await job.getState();

          // Get deployment details from DB if possible to show rich title
          const deploymentId = job.data?.deploymentId;
          let label = "Manual deployment";
          if (deploymentId) {
            const dep =
              await this.uow.deploymentRepository.findById(deploymentId);
            if (dep) {
              label = dep.title;
            }
          }

          allJobs.push({
            id: job.id || "",
            label,
            type: resource?.type || "application",
            state,
            addedAt: new Date(job.timestamp).toISOString(),
            processedAt: job.processedOn
              ? new Date(job.processedOn).toISOString()
              : null,
            finishedAt: job.finishedOn
              ? new Date(job.finishedOn).toISOString()
              : null,
            error: job.failedReason || null,
            resourceId,
            resourceName: resource?.name || "Unknown Service",
            serverId,
            serverName,
          });
        }
      } catch (err: any) {
        log.error({
          message: `Failed to read jobs from queue ${queueName}`,
          err: err.message,
        });
      } finally {
        await queue.close();
      }
    }

    // Sort jobs: active first, then waiting, then delayed/failed. Inside each, by addedAt descending
    const statePriority: Record<string, number> = {
      active: 1,
      waiting: 2,
      delayed: 3,
      failed: 4,
    };

    allJobs.sort((a, b) => {
      const pA = statePriority[a.state] || 99;
      const pB = statePriority[b.state] || 99;
      if (pA !== pB) return pA - pB;
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

    return allJobs;
  }
}

// Simple fallback logging import wrapper
import { log } from "evlog";
