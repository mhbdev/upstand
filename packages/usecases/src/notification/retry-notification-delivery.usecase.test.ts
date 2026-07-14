import { expect, test } from "bun:test";
import type { NotificationDelivery } from "@upstand/domain";
import { RetryNotificationDeliveryUseCase } from "./retry-notification-delivery.usecase";

function delivery(
  status: NotificationDelivery["status"],
): NotificationDelivery {
  const now = new Date();
  return {
    id: "delivery-1",
    channelId: "channel-1",
    organizationId: "org-1",
    event: "deployment_failed",
    idempotencyKey: "key-1",
    title: "Deployment failed",
    message: "The deployment failed",
    metadata: null,
    status,
    attempts: 3,
    error: "provider unavailable",
    deliveredAt: null,
    processingStartedAt: null,
    lastAttemptAt: now,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

test("requeues a failed notification and resets delivery attempts", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const current = delivery("dead_letter");
  const queueCalls: unknown[] = [];
  const uow = {
    notificationDeliveryRepository: {
      findById: async () => current,
      updateById: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { ...current, ...patch };
      },
    },
  } as never;
  const useCase = new RetryNotificationDeliveryUseCase(uow, () => ({
    add: async (...args) => {
      queueCalls.push(args);
    },
    close: async () => undefined,
  }));

  const result = await useCase.execute(current.id);

  expect(result.status).toBe("queued");
  expect(updates[0]).toMatchObject({
    status: "queued",
    attempts: 0,
    error: null,
  });
  expect(queueCalls).toHaveLength(1);
});

test("does not retry a delivered notification", async () => {
  const current = delivery("delivered");
  const uow = {
    notificationDeliveryRepository: {
      findById: async () => current,
      updateById: async () => current,
    },
  } as never;
  const useCase = new RetryNotificationDeliveryUseCase(uow, () => ({
    add: async () => undefined,
    close: async () => undefined,
  }));

  await expect(useCase.execute(current.id)).rejects.toThrow(
    "Only failed notification deliveries can be retried",
  );
});
