import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import { dockerLogLevels } from "../resource/docker-log-filter";
import type {
  DockerContainerCommand,
  DockerInspectionTarget,
  DockerReadOnlyService,
} from "../resource/docker-readonly.service";

export const DockerInventoryKindSchema = z.enum([
  "info",
  "containers",
  "images",
  "volumes",
  "networks",
  "services",
  "logs",
  "stats",
]);
export const GetDockerInventoryInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  kind: DockerInventoryKindSchema,
  containerId: z.string().min(1).optional(),
  serviceName: z.string().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  state: z
    .enum([
      "created",
      "running",
      "paused",
      "restarting",
      "removing",
      "exited",
      "dead",
    ])
    .optional(),
  since: z.number().int().nonnegative().optional(),
  searchLogs: z.string().trim().max(200).optional(),
  logLevels: z.array(z.enum(dockerLogLevels)).max(5).optional(),
  tail: z.number().int().positive().max(1000).default(150),
});

export const ControlDockerContainerInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  containerId: z.string().min(1),
  command: z.enum(["restart", "stop", "start", "remove"]),
});

export const ControlDockerResourceInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  resourceId: z.string().min(1),
  command: z.enum(["remove-volume", "remove-network", "remove-image"]),
});

export const UploadDockerVolumeInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  volumeName: z.string().min(1).max(128),
  destination: z.string().trim().max(512).default("/"),
});

export const UploadDockerContainerInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  containerId: z.string().min(1),
  destination: z.string().trim().max(512).default("/"),
});

export type GetDockerInventoryInput = z.infer<
  typeof GetDockerInventoryInputSchema
>;

export class GetDockerInventoryUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerReadOnlyService,
  ) {}

  async execute(input: GetDockerInventoryInput) {
    const target = await this.getTarget(input);
    switch (input.kind) {
      case "info":
        return this.docker.getInfo(target);
      case "containers":
        return this.docker.listContainers(target, {
          search: input.search,
          state: input.state,
        });
      case "images":
        return this.docker.listImages(target);
      case "volumes":
        return this.docker.listVolumes(target);
      case "networks":
        return this.docker.listNetworks(target);
      case "services":
        return this.docker.listServices(target);
      case "logs":
        return this.docker.getLogs(target, {
          containerId: input.containerId,
          serviceName: input.serviceName,
          tail: input.tail,
          since: input.since,
          search: input.searchLogs,
          levels: input.logLevels,
        });
      case "stats":
        if (!input.containerId) {
          throw new Error("A container ID is required for stats.");
        }
        return this.docker.getContainerStats(target, input.containerId);
    }
  }

  async controlContainer(
    input: z.infer<typeof ControlDockerContainerInputSchema>,
  ) {
    const target = await this.getTarget(input);
    return this.docker.controlContainer(
      target,
      input.containerId,
      input.command as DockerContainerCommand,
    );
  }

  async controlResource(
    input: z.infer<typeof ControlDockerResourceInputSchema>,
  ) {
    const target = await this.getTarget(input);
    return this.docker.controlResource(target, input.resourceId, input.command);
  }

  async getHostTime(input: { organizationId: string; serverId?: string }) {
    const target = await this.getTarget(input);
    return this.docker.getHostTime(target);
  }

  async uploadVolume(
    input: z.infer<typeof UploadDockerVolumeInputSchema>,
    archive: Buffer,
  ) {
    const target = await this.getTarget(input);
    return this.docker.uploadArchiveToVolume(
      target,
      input.volumeName,
      archive,
      input.destination,
    );
  }

  async uploadContainer(
    input: z.infer<typeof UploadDockerContainerInputSchema>,
    archive: Buffer,
  ) {
    const target = await this.getTarget(input);
    return this.docker.uploadArchiveToContainer(
      target,
      input.containerId,
      archive,
      input.destination,
    );
  }

  private async getTarget(input: {
    organizationId: string;
    serverId?: string;
  }): Promise<DockerInspectionTarget> {
    if (!input.serverId || input.serverId === "local") {
      return { kind: "local", name: "Local Docker" };
    }
    const server = await this.uow.serverRepository.findById(input.serverId);
    if (!server || server.organizationId !== input.organizationId) {
      throw new Error("Server is not part of the active organization.");
    }
    if (!server.sshKeyId) throw new Error("Server has no SSH key configured.");
    const key = await this.uow.sshKeyRepository.findById(server.sshKeyId);
    if (!key) throw new Error("Configured server SSH key was not found.");
    return {
      kind: "remote",
      name: server.name,
      host: server.ipAddress,
      port: server.port,
      username: server.username,
      privateKey: decryptSecret({
        ciphertext: key.privateKeyCiphertext,
        iv: key.privateKeyIv,
        authTag: key.privateKeyAuthTag,
        keyVersion: key.privateKeyVersion,
      }),
    };
  }
}
