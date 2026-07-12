import { randomUUID } from "node:crypto";
import type { IUnitOfWork, NotificationEventType } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";

export interface PublishNotificationInput {
  event: NotificationEventType;
  title: string;
  message: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

const NOTIFICATION_DELIVERY_QUEUE = "notification-delivery";

export class PublishNotificationUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: PublishNotificationInput): Promise<number> {
    const channels = await this.uow.notificationChannelRepository.findByEvent(
      input.event,
      input.organizationId,
    );
    if (channels.length === 0) return 0;

    const deliveries = await this.uow.transaction((tx) =>
      tx.notificationDeliveryRepository.createMany(
        channels.map((channel) => ({
          id: randomUUID(),
          channelId: channel.id,
          organizationId: channel.organizationId,
          event: input.event,
          title: input.title,
          message: input.message,
          idempotencyKey: `${input.idempotencyKey ?? randomUUID()}:${channel.id}`,
          metadata: input.metadata ?? null,
          status: "queued",
        })),
      ),
    );

    const queue = new Queue(NOTIFICATION_DELIVERY_QUEUE, {
      connection: redis as never,
    });
    try {
      await queue.addBulk(
        deliveries.map((delivery) => ({
          name: "deliver",
          data: { deliveryId: delivery.id },
          opts: {
            jobId: delivery.id,
            attempts: 3,
            backoff: { type: "exponential", delay: 1_000 },
            removeOnComplete: 100,
            removeOnFail: 1_000,
          },
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.uow.transaction(async (tx) => {
        await Promise.all(
          deliveries.map((delivery) =>
            tx.notificationDeliveryRepository.updateById(delivery.id, {
              status: "failed",
              error: `Unable to enqueue notification: ${message}`.slice(
                0,
                1_000,
              ),
            }),
          ),
        );
      });
      throw error;
    } finally {
      await queue.close();
    }

    return deliveries.length;
  }
}

export { NOTIFICATION_DELIVERY_QUEUE };
