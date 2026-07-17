import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerInspectionTarget,
  DockerReadOnlyPort as DockerReadOnlyService,
} from "../ports/docker";

export const PruneDockerResourcesInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  type: z.enum(["images", "volumes", "containers", "builder", "system", "all"]),
});

export class PruneDockerResourcesUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerReadOnlyService,
  ) {}

  async execute(input: z.infer<typeof PruneDockerResourcesInputSchema>) {
    const target = await this.getTarget(input);
    return this.docker.prune(target, input.type);
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
