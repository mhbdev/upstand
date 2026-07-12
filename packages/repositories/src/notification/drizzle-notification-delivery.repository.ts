import { notificationDelivery } from "@upstand/db";
import type {
  CreateNotificationDeliveryDTO,
  INotificationDeliveryRepository,
  NotificationDelivery,
} from "@upstand/domain";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Executor } from "../shared/types";

export class DrizzleNotificationDeliveryRepository
  implements INotificationDeliveryRepository
{
  constructor(private readonly executor: Executor) {}

  async findById(id: string): Promise<NotificationDelivery | null> {
    const [delivery] = await this.executor
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, id))
      .limit(1);
    return (delivery as NotificationDelivery | undefined) ?? null;
  }

  async findRecentByOrganizationId(
    organizationId: string,
    limit = 25,
  ): Promise<NotificationDelivery[]> {
    return (await this.executor
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.organizationId, organizationId))
      .orderBy(desc(notificationDelivery.createdAt))
      .limit(limit)) as NotificationDelivery[];
  }

  async findByStatus(
    status: string,
    limit = 500,
  ): Promise<NotificationDelivery[]> {
    return (await this.executor
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.status, status))
      .orderBy(desc(notificationDelivery.createdAt))
      .limit(Math.max(1, Math.min(limit, 1_000)))) as NotificationDelivery[];
  }

  async create(
    data: CreateNotificationDeliveryDTO,
  ): Promise<NotificationDelivery> {
    const [delivery] = await this.executor
      .insert(notificationDelivery)
      .values(data)
      .returning();
    if (!delivery)
      throw new Error("create: insert returned no notification delivery");
    return delivery as NotificationDelivery;
  }

  async createMany(
    data: CreateNotificationDeliveryDTO[],
  ): Promise<NotificationDelivery[]> {
    if (data.length === 0) return [];
    return (await this.executor
      .insert(notificationDelivery)
      .values(data)
      .onConflictDoNothing({ target: notificationDelivery.idempotencyKey })
      .returning()) as NotificationDelivery[];
  }

  async claimForDelivery(
    id: string,
    now: Date,
    leaseMs: number,
  ): Promise<NotificationDelivery | null> {
    const staleBefore = new Date(now.getTime() - leaseMs);
    const [delivery] = await this.executor
      .update(notificationDelivery)
      .set({
        status: "processing",
        attempts: sql`${notificationDelivery.attempts} + 1`,
        processingStartedAt: now,
        lastAttemptAt: now,
        nextAttemptAt: null,
        error: null,
      })
      .where(
        and(
          eq(notificationDelivery.id, id),
          or(
            eq(notificationDelivery.status, "queued"),
            eq(notificationDelivery.status, "failed"),
            and(
              eq(notificationDelivery.status, "processing"),
              or(
                isNull(notificationDelivery.processingStartedAt),
                lt(notificationDelivery.processingStartedAt, staleBefore),
              ),
            ),
          ),
        ),
      )
      .returning();
    return (delivery as NotificationDelivery | undefined) ?? null;
  }

  async updateById(
    id: string,
    patch: Partial<CreateNotificationDeliveryDTO>,
  ): Promise<NotificationDelivery | null> {
    const [delivery] = await this.executor
      .update(notificationDelivery)
      .set(patch)
      .where(eq(notificationDelivery.id, id))
      .returning();
    return (delivery as NotificationDelivery | undefined) ?? null;
  }
}
