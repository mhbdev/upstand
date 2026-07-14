import * as fs from "node:fs";
import type { IUnitOfWork } from "@upstand/domain";

type MonitoringAgentTarget = {
  baseUrl: string;
  token: string;
};

async function resolveMonitoringAgentTarget(
  uow: IUnitOfWork,
  serverId: string,
): Promise<MonitoringAgentTarget> {
  const settings =
    await uow.monitoringSettingsRepository.findByServerId(serverId);
  if (!settings)
    throw new Error(`Monitoring is not configured for server ${serverId}`);

  let serverIp = "localhost";
  if (serverId !== "local") {
    const server = await uow.serverRepository.findById(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);
    serverIp = server.ipAddress;
  } else if (fs.existsSync("/.dockerenv")) {
    serverIp = "upstand-monitoring-agent";
  }

  return { baseUrl: `http://${serverIp}:3001`, token: settings.token };
}

export async function requestMonitoringAgent<T>(
  uow: IUnitOfWork,
  serverId: string,
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    query?: URLSearchParams;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const target = await resolveMonitoringAgentTarget(uow, serverId);
  const query = options.query?.toString();
  const url = `${target.baseUrl}${endpoint}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${target.token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Monitoring agent request failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }
  return (await response.json()) as T;
}
