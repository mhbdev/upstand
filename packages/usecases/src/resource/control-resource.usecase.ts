import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { z } from "zod";
import type { DockerService } from "./docker.service";

export const ControlResourceInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  command: z.enum(["start", "stop", "restart"]),
});

export type ControlResourceInput = z.infer<typeof ControlResourceInputSchema>;

export class ControlResourceUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly dockerService: DockerService,
  ) {}

  async execute(input: ControlResourceInput): Promise<any> {
    return this.uow.transaction(async (tx) => {
      const resource = await tx.resourceRepository.findById(input.id);
      if (!resource) {
        throw new ValidationError("Resource not found");
      }

      await this.dockerService.controlService(resource, input.command);

      const status = input.command === "stop" ? "stopped" : "running";

      // Instantly query updated containers
      const containers = await this.dockerService.getContainers(resource);

      const updated = await tx.resourceRepository.updateById(resource.id, {
        status,
        containers: JSON.stringify(containers),
      });

      return updated;
    });
  }
}
