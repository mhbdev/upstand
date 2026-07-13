import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerInspectionTarget,
  DockerReadOnlyService,
} from "../resource/docker-readonly.service";

export const DockerInventoryKindSchema = z.enum([
  "info",
  "containers",
  "images",
  "volumes",
  "services",
  "logs",
]);
export const GetDockerInventoryInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  kind: DockerInventoryKindSchema,
  containerId: z.string().min(1).optional(),
  serviceName: z.string().min(1).optional(),
  tail: z.number().int().positive().max(1000).default(150),
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
        return this.docker.listContainers(target);
      case "images":
        return this.docker.listImages(target);
      case "volumes":
        return this.docker.listVolumes(target);
      case "services":
        return this.docker.listServices(target);
      case "logs":
        return this.docker.getLogs(target, {
          containerId: input.containerId,
          serviceName: input.serviceName,
          tail: input.tail,
        });
    }
  }

  private async getTarget(
    input: GetDockerInventoryInput,
  ): Promise<DockerInspectionTarget> {
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
