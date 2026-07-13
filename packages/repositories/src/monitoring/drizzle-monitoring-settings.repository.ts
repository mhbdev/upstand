import { monitoringSettings } from "@upstand/db";
import type {
  IMonitoringSettingsRepository,
  MonitoringSettings,
  UpsertMonitoringSettingsDTO,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
import type { Executor } from "../shared/types";

export class DrizzleMonitoringSettingsRepository
  implements IMonitoringSettingsRepository
{
  constructor(private readonly executor: Executor) {}

  async findByServerId(serverId: string): Promise<MonitoringSettings | null> {
    const [row] = await this.executor
      .select()
      .from(monitoringSettings)
      .where(eq(monitoringSettings.serverId, serverId))
      .limit(1);
    return row ?? null;
  }

  async findByToken(token: string): Promise<MonitoringSettings | null> {
    const [row] = await this.executor
      .select()
      .from(monitoringSettings)
      .where(eq(monitoringSettings.token, token))
      .limit(1);
    return row ?? null;
  }

  async upsert(dto: UpsertMonitoringSettingsDTO): Promise<MonitoringSettings> {
    const [row] = await this.executor
      .insert(monitoringSettings)
      .values({
        serverId: dto.serverId,
        token: dto.token || "",
        cpuThreshold: dto.cpuThreshold ?? 90,
        memoryThreshold: dto.memoryThreshold ?? 90,
        alertEmail: dto.alertEmail || null,
      })
      .onConflictDoUpdate({
        target: monitoringSettings.serverId,
        set: {
          token: dto.token,
          cpuThreshold: dto.cpuThreshold,
          memoryThreshold: dto.memoryThreshold,
          alertEmail: dto.alertEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("upsert: insert/update returned no rows");
    }
    return row;
  }
}
