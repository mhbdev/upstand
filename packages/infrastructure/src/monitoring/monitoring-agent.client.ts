import * as fs from "node:fs";
import * as http from "node:http";
import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { hostVerifierForFingerprint } from "@upstand/platform/ssh/host-key";
import type { MonitoringAgentPort } from "@upstand/usecases/ports/monitoring";
import { Client, type ClientChannel } from "ssh2";

type LocalMonitoringAgentTarget = {
  baseUrl: string;
  token: string;
};

type RemoteMonitoringAgentTarget = {
  baseUrl: string;
  token: string;
  server: {
    host: string;
    port: number;
    username: string;
    privateKey: string;
    hostKeyFingerprint: string;
  };
};

type MonitoringAgentTarget =
  | LocalMonitoringAgentTarget
  | RemoteMonitoringAgentTarget;

type MonitoringRequestOptions = {
  method: "GET" | "POST";
  path: string;
  token: string;
  body?: Record<string, unknown>;
};

async function resolveMonitoringAgentTarget(
  uow: IUnitOfWork,
  serverId: string,
): Promise<MonitoringAgentTarget> {
  const settings =
    await uow.monitoringSettingsRepository.findByServerId(serverId);
  if (!settings)
    throw new Error(`Monitoring is not configured for server ${serverId}`);

  if (serverId === "local") {
    return {
      baseUrl: fs.existsSync("/.dockerenv")
        ? "http://upstand-monitoring-agent:3001"
        : "http://127.0.0.1:3005",
      token: settings.token,
    };
  }

  const server = await uow.serverRepository.findById(serverId);
  if (!server) throw new Error(`Server ${serverId} not found`);
  if (!server.sshKeyId || !server.sshHostKeyFingerprint) {
    throw new Error("Remote monitoring requires a trusted SSH host key");
  }
  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) throw new Error("Configured SSH Key not found");
  const privateKey = decryptSecret({
    ciphertext: sshKey.privateKeyCiphertext,
    iv: sshKey.privateKeyIv,
    authTag: sshKey.privateKeyAuthTag,
    keyVersion: sshKey.privateKeyVersion,
  });
  return {
    baseUrl: "ssh://127.0.0.1:3001",
    token: settings.token,
    server: {
      host: server.ipAddress,
      port: server.port,
      username: server.username,
      privateKey,
      hostKeyFingerprint: server.sshHostKeyFingerprint,
    },
  };
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
  const path = `${endpoint}${query ? `?${query}` : ""}`;
  if ("server" in target) {
    return requestThroughSsh<T>(
      {
        method: options.method ?? "GET",
        path,
        token: target.token,
        body: options.body,
      },
      target.server,
    );
  }
  const url = `${target.baseUrl}${path}`;
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

async function requestThroughSsh<T>(
  options: MonitoringRequestOptions,
  server: {
    host: string;
    port: number;
    username: string;
    privateKey: string;
    hostKeyFingerprint: string;
  },
): Promise<T> {
  const client = new Client();
  try {
    await new Promise<void>((resolve, reject) => {
      client
        .once("ready", resolve)
        .once("error", reject)
        .connect({
          host: server.host,
          port: server.port,
          username: server.username,
          privateKey: server.privateKey,
          hostHash: "sha256",
          hostVerifier: hostVerifierForFingerprint(server.hostKeyFingerprint),
          readyTimeout: 10_000,
        });
    });
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.forwardOut("127.0.0.1", 0, "127.0.0.1", 3001, (error, stream) => {
        if (error) reject(error);
        else resolve(stream);
      });
    });
    return await requestOverChannel<T>(channel, options);
  } finally {
    client.end();
  }
}

async function requestOverChannel<T>(
  channel: ClientChannel,
  options: MonitoringRequestOptions,
): Promise<T> {
  const body = options.body ? JSON.stringify(options.body) : undefined;
  return new Promise<T>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: "3001",
        path: options.path,
        method: options.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.token}`,
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
        createConnection: () => channel,
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            request.destroy(
              new Error("Monitoring agent response is too large"),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `Monitoring agent request failed (${response.statusCode}): ${payload}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(payload) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(10_000, () =>
      request.destroy(new Error("Monitoring agent request timed out")),
    );
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export function createMonitoringAgentPort(): MonitoringAgentPort {
  return { request: requestMonitoringAgent };
}
