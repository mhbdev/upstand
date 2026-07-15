import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import type { DockerService } from "./docker-client";
import { resolveDockerServiceForServer } from "./docker-client";

export const GetResourceContainersInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
});

export type GetResourceContainersInput = z.infer<
  typeof GetResourceContainersInputSchema
>;

export class GetResourceContainersUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly dockerService: DockerService,
  ) {}

  async execute(input: GetResourceContainersInput): Promise<any[]> {
    return this.uow.transaction(async (tx) => {
      const resource = await tx.resourceRepository.findById(input.id);
      if (!resource) {
        throw new ValidationError("Resource not found");
      }

      const { dockerService, cleanup } = await resolveDockerServiceForServer(
        resource.serverId,
        tx,
        this.dockerService,
      );

      try {
        const containers = await dockerService.getContainers(resource);

        // Update database with the live containers list
        await tx.resourceRepository.updateById(resource.id, {
          containers: JSON.stringify(containers),
        });

        return containers;
      } finally {
        cleanup();
      }
    });
  }
}
