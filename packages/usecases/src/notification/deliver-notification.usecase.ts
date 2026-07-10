import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { decryptNotificationConfiguration } from "./notification-configuration";
import type { NotificationTransport } from "./notification-transport";

export class DeliverNotificationUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly transport: NotificationTransport,
  ) {}

  async execute(deliveryId: string): Promise<void> {
    const delivery =
      await this.uow.notificationDeliveryRepository.findById(deliveryId);
    if (!delivery) throw new ValidationError("Notification delivery not found");

    const channel = await this.uow.notificationChannelRepository.findById(
      delivery.channelId,
    );
    if (!channel)
      throw new ValidationError("Notification channel no longer exists");

    await this.uow.notificationDeliveryRepository.updateById(delivery.id, {
      status: "processing",
      attempts: delivery.attempts + 1,
      error: null,
    });

    try {
      await this.transport.send(decryptNotificationConfiguration(channel), {
        title: delivery.title,
        message: delivery.message,
        metadata: delivery.metadata,
      });
      await this.uow.notificationDeliveryRepository.updateById(delivery.id, {
        status: "delivered",
        deliveredAt: new Date(),
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown delivery error";
      await this.uow.notificationDeliveryRepository.updateById(delivery.id, {
        status: "failed",
        error: message.slice(0, 1_000),
      });
      throw error;
    }
  }
}
