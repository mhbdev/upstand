import type Docker from "dockerode";
import { Client } from "ssh2";
import { getDockerInstance } from "./docker-client";

export type DockerInspectionTarget =
  | { kind: "local"; name: string }
  | {
      kind: "remote";
      name: string;
      host: string;
      port: number;
      username: string;
      privateKey: string;
    };

export type DockerInfo = {
  name: string;
  serverVersion: string;
  operatingSystem: string;
  architecture: string;
  containers: number;
  images: number;
  memoryBytes: number;
  swarmState: string;
};

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string | null;
};

export type DockerImage = {
  id: string;
  tags: string[];
  sizeBytes: number;
  createdAt: string | null;
};

export type DockerVolume = {
  name: string;
  driver: string;
  mountpoint: string;
};

export type DockerServiceSummary = {
  id: string;
  name: string;
  mode: string;
  replicas: string;
  image: string;
  ports: string;
};

export type DockerLogRequest = {
  containerId?: string;
  serviceName?: string;
  tail: number;
};

const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function assertIdentifier(value: string, label: string): void {
  if (!identifierPattern.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatPorts(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((port) => {
      const item = asRecord(port);
      const published = item.PublicPort ?? item.PublishedPort;
      const target = item.PrivatePort ?? item.TargetPort;
      return published && target ? `${published}:${target}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function parseJsonLines(output: string): Record<string, unknown>[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return asRecord(JSON.parse(line));
      } catch {
        return { raw: line };
      }
    });
}

function dockerInfo(raw: unknown): DockerInfo {
  const value = asRecord(raw);
  const swarm = asRecord(value.Swarm);
  return {
    name: asString(value.Name),
    serverVersion: asString(value.ServerVersion),
    operatingSystem: asString(value.OperatingSystem),
    architecture: asString(value.Architecture),
    containers: asNumber(value.Containers),
    images: asNumber(value.Images),
    memoryBytes: asNumber(value.MemTotal),
    swarmState: asString(swarm.LocalNodeState, "inactive"),
  };
}

export class DockerReadOnlyService {
  constructor(private readonly docker: Docker = getDockerInstance()) {}

  async getInfo(target: DockerInspectionTarget): Promise<DockerInfo> {
    if (target.kind === "local") return dockerInfo(await this.docker.info());
    const raw = await this.executeRemote(
      target,
      "docker info --format '{{json .}}'",
    );
    return dockerInfo(JSON.parse(raw));
  }

  async listContainers(
    target: DockerInspectionTarget,
  ): Promise<DockerContainer[]> {
    if (target.kind === "local") {
      const containers = await this.docker.listContainers({ all: true });
      return containers.map((container) => ({
        id: container.Id,
        name:
          container.Names?.[0]?.replace(/^\//, "") || container.Id.slice(0, 12),
        image: container.Image || "unknown",
        state: container.State || "unknown",
        status: container.Status || "unknown",
        ports: formatPorts(container.Ports),
        createdAt: container.Created
          ? new Date(container.Created * 1000).toISOString()
          : null,
      }));
    }
    const rows = parseJsonLines(
      await this.executeRemote(target, "docker ps --all --format '{{json .}}'"),
    );
    return rows.map((row) => ({
      id: asString(row.ID),
      name: asString(row.Names),
      image: asString(row.Image),
      state: asString(row.State),
      status: asString(row.Status),
      ports: asString(row.Ports, ""),
      createdAt: null,
    }));
  }

  async listImages(target: DockerInspectionTarget): Promise<DockerImage[]> {
    if (target.kind === "local") {
      const images = await this.docker.listImages({ all: true });
      return images.map((image) => ({
        id: image.Id,
        tags: image.RepoTags || [],
        sizeBytes: image.Size || 0,
        createdAt: image.Created
          ? new Date(image.Created * 1000).toISOString()
          : null,
      }));
    }
    const rows = parseJsonLines(
      await this.executeRemote(
        target,
        "docker images --all --format '{{json .}}'",
      ),
    );
    return rows.map((row) => ({
      id: asString(row.ID),
      tags: [
        `${asString(row.Repository, "<none>")}:${asString(row.Tag, "<none>")}`,
      ],
      sizeBytes: 0,
      createdAt: null,
    }));
  }

  async listVolumes(target: DockerInspectionTarget): Promise<DockerVolume[]> {
    if (target.kind === "local") {
      const result = await this.docker.listVolumes();
      return (result.Volumes || []).map((volume) => ({
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
      }));
    }
    const rows = parseJsonLines(
      await this.executeRemote(
        target,
        "docker volume ls --format '{{json .}}'",
      ),
    );
    return rows.map((row) => ({
      name: asString(row.Name),
      driver: asString(row.Driver),
      mountpoint: "",
    }));
  }

  async listServices(
    target: DockerInspectionTarget,
  ): Promise<DockerServiceSummary[]> {
    if (target.kind === "local") {
      const services = await this.docker.listServices();
      return services.map((service) => {
        const value = asRecord(service);
        const spec = asRecord(value.Spec);
        const taskTemplate = asRecord(spec.TaskTemplate);
        const containerSpec = asRecord(taskTemplate.ContainerSpec);
        const mode = asRecord(spec.Mode);
        const replicated = asRecord(mode.Replicated);
        return {
          id: asString(value.ID),
          name: asString(spec.Name),
          mode: Object.keys(mode)[0] || "unknown",
          replicas:
            replicated.Replicas === undefined
              ? "global"
              : String(replicated.Replicas),
          image: asString(containerSpec.Image),
          ports: formatPorts(asRecord(value.EndpointSpec).Ports),
        };
      });
    }
    const rows = parseJsonLines(
      await this.executeRemote(
        target,
        "docker service ls --format '{{json .}}'",
      ),
    );
    return rows.map((row) => ({
      id: asString(row.ID),
      name: asString(row.Name),
      mode: asString(row.Mode),
      replicas: asString(row.Replicas),
      image: asString(row.Image),
      ports: asString(row.Ports, ""),
    }));
  }

  async getLogs(
    target: DockerInspectionTarget,
    request: DockerLogRequest,
  ): Promise<string> {
    if (!request.containerId && !request.serviceName) {
      throw new Error("A container ID or service name is required.");
    }
    const identifier = request.containerId || request.serviceName;
    assertIdentifier(identifier as string, "Docker target");
    if (target.kind === "local") {
      const options = {
        stdout: true,
        stderr: true,
        tail: request.tail,
        timestamps: true,
      };
      const buffer = request.containerId
        ? await this.docker.getContainer(request.containerId).logs(options)
        : await this.docker
            .getService(request.serviceName as string)
            .logs(options);
      return Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
    }
    const command = request.containerId
      ? `docker logs --tail ${request.tail} --timestamps ${request.containerId}`
      : `docker service logs --tail ${request.tail} --timestamps ${request.serviceName}`;
    return this.executeRemote(target, command);
  }

  private executeRemote(
    target: Extract<DockerInspectionTarget, { kind: "remote" }>,
    command: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const connection = new Client();
      const timer = setTimeout(() => {
        connection.end();
        reject(new Error(`Remote Docker query timed out on ${target.name}.`));
      }, 20_000);
      connection
        .on("ready", () => {
          connection.exec(command, (error, stream) => {
            if (error) {
              clearTimeout(timer);
              connection.end();
              reject(error);
              return;
            }
            let stdout = "";
            let stderr = "";
            stream.on("data", (data: Buffer | string) => {
              stdout += data.toString();
              if (stdout.length > 512_000) stream.destroy();
            });
            stream.stderr.on("data", (data: Buffer | string) => {
              stderr += data.toString();
            });
            stream.on("close", (code: number | null) => {
              clearTimeout(timer);
              connection.end();
              if (code !== 0) {
                reject(
                  new Error(
                    stderr.trim() ||
                      `Remote Docker query exited with code ${code ?? "unknown"}.`,
                  ),
                );
                return;
              }
              resolve(stdout.slice(0, 512_000));
            });
          });
        })
        .on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        })
        .connect({
          host: target.host,
          port: target.port,
          username: target.username,
          privateKey: target.privateKey,
          readyTimeout: 20_000,
        });
    });
  }
}
