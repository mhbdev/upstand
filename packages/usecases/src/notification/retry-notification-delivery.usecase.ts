import type { IUnitOfWork } from "@upstand/domain";
import { redis } from "@upstand/redis";
import { Queue } from "bullmq";
import { NOTIFICATION_DELIVERY_QUEUE } from "./publish-notification.usecase";

type NotificationQueue = {
  add(
    name: string,
    data: { deliveryId: string },
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: "exponential"; delay: number };
      removeOnComplete: number;
      removeOnFail: number;
    },
  ): Promise<unknown>;
  close(): Promise<void>;
};

export class RetryNotificationDeliveryUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly createQueue: () => NotificationQueue = () =>
      new Queue(NOTIFICATION_DELIVERY_QUEUE, {
        connection: redis as never,
      }) as unknown as NotificationQueue,
  ) {}

  async execute(deliveryId: string) {
    const delivery =
      await this.uow.notificationDeliveryRepository.findById(deliveryId);
    if (!delivery) throw new Error("Notification delivery not found");
    if (delivery.status !== "failed" && delivery.status !== "dead_letter") {
      throw new Error("Only failed notification deliveries can be retried");
    }

    const queued = await this.uow.notificationDeliveryRepository.updateById(
      delivery.id,
      {
        status: "queued",
        attempts: 0,
        error: null,
        deliveredAt: null,
        processingStartedAt: null,
        lastAttemptAt: null,
        nextAttemptAt: null,
      },
    );
    if (!queued) throw new Error("Notification delivery could not be queued");

    const queue = this.createQueue();
    try {
      await queue.add(
        "deliver",
        { deliveryId: delivery.id },
        {
          jobId: delivery.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: 100,
          removeOnFail: 1_000,
        },
      );
      return queued;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.uow.notificationDeliveryRepository.updateById(delivery.id, {
        status: "failed",
        error: `Unable to enqueue notification retry: ${message}`.slice(
          0,
          1_000,
        ),
      });
      throw error;
    } finally {
      await queue.close();
    }
  }
}
