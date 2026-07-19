import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerExecPort,
  DockerInspectionTarget,
  DockerResourceReadPort,
} from "../ports/docker";

export const ExecContainerCommandInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  containerId: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  command: z.string().min(1),
});

export class ExecContainerCommandUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerExecPort,
    private readonly dockerService?: DockerResourceReadPort,
  ) {}

  async execute(input: z.infer<typeof ExecContainerCommandInputSchema>) {
    const target = await this.getTarget(input);
    let targetContainerId = input.containerId;

    if (!targetContainerId && input.resourceId) {
      const resource = await this.uow.resourceRepository.findById(
        input.resourceId,
      );
      if (!resource) {
        throw new Error("Resource not found.");
      }
      if (this.dockerService) {
        const containers = await this.dockerService.getContainers(resource);
        if (containers && containers.length > 0 && containers[0]?.id) {
          targetContainerId = containers[0].id;
        }
      }
    }

    if (!targetContainerId) {
      throw new Error(
        "Either containerId or resourceId with running containers must be provided.",
      );
    }

    return this.docker.execContainerCommand(
      target,
      targetContainerId,
      input.command,
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
