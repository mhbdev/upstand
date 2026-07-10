import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import type { DockerService } from "./docker.service";

export const GetResourceLogsInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  containerId: z.string().optional(),
  tail: z.number().int().min(1).max(5_000).optional(),
});

export type GetResourceLogsInput = z.infer<typeof GetResourceLogsInputSchema>;

export class GetResourceLogsUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly dockerService: DockerService,
  ) {}

  async execute(input: GetResourceLogsInput): Promise<string> {
    return this.uow.transaction(async (tx) => {
      const resource = await tx.resourceRepository.findById(input.id);
      if (!resource) {
        throw new ValidationError("Resource not found");
      }

      return await this.dockerService.getLogs(
        resource,
        input.containerId,
        input.tail ?? 150,
      );
    });
  }
}
