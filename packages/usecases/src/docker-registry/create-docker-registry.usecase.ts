import { randomUUID } from "node:crypto";
import { type IUnitOfWork, type DockerRegistry } from "@upstand/domain";
import { z } from "zod";

export const CreateDockerRegistryInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Registry name is required"),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  imagePrefix: z.string().optional().nullable(),
  registryUrl: z.string().optional().nullable(),
  serverId: z.string().optional().nullable(),
});

export type CreateDockerRegistryInput = z.infer<typeof CreateDockerRegistryInputSchema>;

export class CreateDockerRegistryUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: CreateDockerRegistryInput): Promise<DockerRegistry> {
    return this.uow.transaction(async (tx) => {
      return tx.dockerRegistryRepository.create({
        id: randomUUID(),
        organizationId: input.organizationId,
        name: input.name,
        username: input.username || null,
        password: input.password || null,
        imagePrefix: input.imagePrefix || null,
        registryUrl: input.registryUrl || null,
        serverId: input.serverId || null,
      });
    });
  }
}
