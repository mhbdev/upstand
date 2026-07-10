import type {
  CreateNotificationDeliveryDTO,
  NotificationDelivery,
} from "../entities/notification";

export interface INotificationDeliveryRepository {
  findById(id: string): Promise<NotificationDelivery | null>;
  findRecentByOrganizationId(
    organizationId: string,
    limit?: number,
  ): Promise<NotificationDelivery[]>;
  findByStatus(status: string, limit?: number): Promise<NotificationDelivery[]>;
  create(data: CreateNotificationDeliveryDTO): Promise<NotificationDelivery>;
  createMany(
    data: CreateNotificationDeliveryDTO[],
  ): Promise<NotificationDelivery[]>;
  updateById(
    id: string,
    patch: Partial<CreateNotificationDeliveryDTO>,
  ): Promise<NotificationDelivery | null>;
}
