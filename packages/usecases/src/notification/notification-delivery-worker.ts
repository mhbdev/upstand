import { closeRedis, createRedis, type Redis } from "@upstand/redis";
import { Worker } from "bullmq";
import { log } from "evlog";
import { DeliverNotificationUseCaseToken } from "../tokens";
import { NOTIFICATION_DELIVERY_QUEUE } from "./publish-notification.usecase";

export class NotificationDeliveryWorker {
  private worker: Worker | null = null;
  private workerRedis: Redis | null = null;

  constructor(private readonly getServiceProvider: () => any) {}

  async start(): Promise<void> {
    if (this.worker) return;

    const connection = createRedis({
      maxRetriesPerRequest: null,
      loggerName: "notification-worker",
    });
    this.workerRedis = connection;

    try {
      this.worker = new Worker(
        NOTIFICATION_DELIVERY_QUEUE,
        async (job) => {
          const deliveryId = job.data?.deliveryId;
          if (!deliveryId) {
            throw new Error("Notification job is missing deliveryId");
          }

          const scope = this.getServiceProvider().createScope();
          try {
            const deliver = scope.resolve(DeliverNotificationUseCaseToken);
            await deliver.execute(deliveryId);
          } finally {
            await scope.dispose();
          }
        },
        {
          connection: connection as never,
          concurrency: 10,
          maxStalledCount: 1,
        },
      );

      this.worker.on("failed", (job, error) => {
        log.error({
          message: "Notification delivery job failed",
          deliveryId: job?.data?.deliveryId,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          err: error.message,
        });
      });
      this.worker.on("error", (error) => {
        log.error({
          message: "Notification worker connection error",
          err: error.message,
        });
      });

      await this.worker.waitUntilReady();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  isReady(): boolean {
    return Boolean(this.worker?.isRunning());
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.workerRedis) {
      await closeRedis(this.workerRedis);
      this.workerRedis = null;
    }
  }
}
