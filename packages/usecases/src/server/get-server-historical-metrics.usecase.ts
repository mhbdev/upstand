import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";

export const GetServerHistoricalMetricsInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1),
  limit: z.string().optional().default("50"),
  appName: z.string().optional(),
});

export type GetServerHistoricalMetricsInput = z.infer<
  typeof GetServerHistoricalMetricsInputSchema
>;

export class GetServerHistoricalMetricsUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: GetServerHistoricalMetricsInput): Promise<unknown> {
    const serverId = input.serverId;

    const settings =
      await this.uow.monitoringSettingsRepository.findByServerId(serverId);
    if (!settings) {
      throw new Error(
        `Monitoring settings not configured for server ${serverId}`,
      );
    }

    let serverIp = "localhost";
    if (serverId !== "local") {
      const serverRecord = await this.uow.serverRepository.findById(serverId);
      if (!serverRecord) {
        throw new Error(`Server ${serverId} not found`);
      }
      serverIp = serverRecord.ipAddress;
    }

    const limit = input.limit ?? "50";
    const port = 3001;

    let url = "";
    if (input.appName) {
      url = `http://${serverIp}:${port}/metrics/containers?appName=${encodeURIComponent(input.appName)}&limit=${limit}`;
    } else {
      url = `http://${serverIp}:${port}/metrics?limit=${limit}`;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${settings.token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Agent metrics response failed (${response.status}): ${text}`,
        );
      }

      return await response.json();
    } catch (err) {
      throw new Error(
        `Failed to contact monitoring agent on ${serverIp}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
