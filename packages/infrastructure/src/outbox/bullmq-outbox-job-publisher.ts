import type { OutboxMessage } from "@upstand/domain";
import { closeRedis, createRedis, type Redis } from "@upstand/redis";
import {
  BACKUP_RUN_QUEUE,
  getDeploymentQueueName,
  NOTIFICATION_DELIVERY_QUEUE,
  OUTBOX_COMMAND_TYPES,
  type OutboxJobPublisher,
} from "@upstand/usecases";
import { Queue } from "bullmq";
import { z } from "zod";

const deploymentPayloadSchema = z.object({
  resourceId: z.string().min(1),
  deploymentId: z.string().min(1),
  serverId: z.string().min(1),
  previewDeploymentId: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
});

const backupPayloadSchema = z.object({
  runId: z.string().min(1),
});

const notificationPayloadSchema = z.object({
  deliveryId: z.string().min(1),
});

type QueueJobData = Record<string, unknown>;

export class BullMqOutboxJobPublisher implements OutboxJobPublisher {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue<QueueJobData>>();

  constructor() {
    this.connection = createRedis({
      maxRetriesPerRequest: null,
      loggerName: "outbox-publisher",
    });
  }

  async publish(message: OutboxMessage): Promise<void> {
    switch (message.type) {
      case OUTBOX_COMMAND_TYPES.deploy: {
        const payload = deploymentPayloadSchema.parse(message.payload);
        await this.queue(getDeploymentQueueName(payload.serverId)).add(
          "deploy",
          payload,
          {
            jobId: message.id,
            attempts: 1,
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        );
        return;
      }
      case OUTBOX_COMMAND_TYPES.backupRun: {
        const payload = backupPayloadSchema.parse(message.payload);
        await this.queue(BACKUP_RUN_QUEUE).add("run", payload, {
          jobId: message.id,
          attempts: 2,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        });
        return;
      }
      case OUTBOX_COMMAND_TYPES.notificationDelivery: {
        const payload = notificationPayloadSchema.parse(message.payload);
        await this.queue(NOTIFICATION_DELIVERY_QUEUE).add("deliver", payload, {
          jobId: message.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: 100,
          removeOnFail: 1_000,
        });
        return;
      }
      default:
        throw new Error(`Unsupported outbox message type: ${message.type}`);
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
    this.queues.clear();
    await closeRedis(this.connection);
  }

  private queue(name: string): Queue<QueueJobData> {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue<QueueJobData>(name, {
      connection: this.connection as never,
    });
    this.queues.set(name, queue);
    return queue;
  }
}
