import { getServiceProvider } from "@upstand/api/di";
import { BullMqOutboxJobPublisher } from "@upstand/infrastructure";
import { OutboxPublisher } from "@upstand/usecases";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import { log } from "evlog";

const PUBLISH_INTERVAL_MS = 1_000;
const RETENTION_INTERVAL_MS = 60 * 60_000;
const PUBLISHED_RETENTION_MS = 30 * 24 * 60 * 60_000;

export class OutboxRuntime {
  private readonly jobPublisher = new BullMqOutboxJobPublisher();
  private publishTimer: ReturnType<typeof setInterval> | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private publishInFlight: Promise<void> | null = null;

  async start(): Promise<void> {
    await this.publishBatch();
  }

  startMaintenance(): void {
    if (this.publishTimer) return;
    this.publishTimer = setInterval(
      () => void this.publishBatch(),
      PUBLISH_INTERVAL_MS,
    );
    this.publishTimer.unref?.();
    this.retentionTimer = setInterval(
      () => void this.prunePublished(),
      RETENTION_INTERVAL_MS,
    );
    this.retentionTimer.unref?.();
  }

  async shutdown(): Promise<void> {
    if (this.publishTimer) clearInterval(this.publishTimer);
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    this.publishTimer = null;
    this.retentionTimer = null;
    if (this.publishInFlight) await this.publishInFlight;
    await this.jobPublisher.close();
  }

  private async publishBatch(): Promise<void> {
    if (this.publishInFlight) return this.publishInFlight;

    this.publishInFlight = (async () => {
      const scope = getServiceProvider().createScope();
      try {
        const publisher = new OutboxPublisher(
          scope.resolve(UnitOfWorkToken),
          this.jobPublisher,
        );
        const result = await publisher.publishBatch();
        if (result.claimed > 0) {
          log.info({ message: "Transactional outbox batch processed", result });
          if (result.deadLettered > 0) {
            log.error({
              message: "Transactional outbox messages moved to dead letter",
              deadLettered: result.deadLettered,
            });
          }
        }
      } catch (error) {
        log.error({
          message: "Failed to process transactional outbox",
          err: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await scope.dispose();
      }
    })();

    try {
      await this.publishInFlight;
    } finally {
      this.publishInFlight = null;
    }
  }

  private async prunePublished(): Promise<void> {
    const scope = getServiceProvider().createScope();
    try {
      const uow = scope.resolve(UnitOfWorkToken);
      const deleted = await uow.outboxRepository.prunePublished(
        new Date(Date.now() - PUBLISHED_RETENTION_MS),
      );
      if (deleted > 0) {
        log.info({
          message: "Published transactional outbox messages pruned",
          deleted,
        });
      }
    } catch (error) {
      log.warn({
        message: "Failed to prune published transactional outbox messages",
        err: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await scope.dispose();
    }
  }
}
