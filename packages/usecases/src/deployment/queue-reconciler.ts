import type { IUnitOfWork } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";
import { BACKUP_RUN_QUEUE } from "../backup/trigger-backup-run.usecase";
import { NOTIFICATION_DELIVERY_QUEUE } from "../notification/publish-notification.usecase";
import { getDeploymentQueueName } from "./deployment-queue-name";

export interface QueueReconciliationResult {
  backups: number;
  deployments: number;
  notifications: number;
}

/**
 * Restores the database-to-Redis handoff after a crash between committing a
 * queued record and adding its BullMQ job. Stable job IDs make every add
 * idempotent while an existing job is retained by BullMQ.
 */
export async function reconcileQueuedJobs(
  uow: IUnitOfWork,
): Promise<QueueReconciliationResult> {
  const [backups, deployments, queuedNotifications, processingNotifications] =
    await Promise.all([
      uow.backupRunRepository.findByStatus("queued", 500),
      uow.deploymentRepository.findByStatus("queued", 500),
      uow.notificationDeliveryRepository.findByStatus("queued", 500),
      uow.notificationDeliveryRepository.findByStatus("processing", 500),
    ]);
  const notifications = [
    ...queuedNotifications,
    ...processingNotifications.filter(
      (delivery) =>
        !delivery.processingStartedAt ||
        delivery.processingStartedAt.getTime() < Date.now() - 5 * 60_000,
    ),
  ];

  const deploymentQueues = new Map<string, Queue>();
  const notificationQueue = new Queue(NOTIFICATION_DELIVERY_QUEUE, {
    connection: redis as never,
  });
  const backupQueue = new Queue(BACKUP_RUN_QUEUE, {
    connection: redis as never,
  });

  try {
    for (const deployment of deployments) {
      const serverId = deployment.serverId || "local";
      let queue = deploymentQueues.get(serverId);
      if (!queue) {
        queue = new Queue(getDeploymentQueueName(serverId), {
          connection: redis as never,
        });
        deploymentQueues.set(serverId, queue);
      }
      await queue.add(
        "deploy",
        {
          resourceId: deployment.resourceId,
          deploymentId: deployment.id,
        },
        {
          jobId: deployment.id,
          attempts: 1,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
    }

    if (notifications.length > 0) {
      await notificationQueue.addBulk(
        notifications.map((delivery) => ({
          name: "deliver",
          data: { deliveryId: delivery.id },
          opts: {
            jobId: delivery.id,
            attempts: 3,
            backoff: { type: "exponential" as const, delay: 1_000 },
            removeOnComplete: 100,
            removeOnFail: 1_000,
          },
        })),
      );
    }

    if (backups.length > 0) {
      await backupQueue.addBulk(
        backups.map((run) => ({
          name: "run",
          data: { runId: run.id },
          opts: {
            jobId: run.id,
            attempts: 2,
            backoff: { type: "exponential" as const, delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        })),
      );
    }
  } finally {
    await Promise.allSettled([
      backupQueue.close(),
      notificationQueue.close(),
      ...[...deploymentQueues.values()].map((queue) => queue.close()),
    ]);
  }

  return {
    backups: backups.length,
    deployments: deployments.length,
    notifications: notifications.length,
  };
}
