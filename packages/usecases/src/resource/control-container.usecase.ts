import {
  type IUnitOfWork,
  type Resource,
  ValidationError,
} from "@upstand/domain";
import { z } from "zod";
import type { DockerService } from "./docker.service";

export const ControlContainerInputSchema = z.object({
  resourceId: z.string().min(1, "Resource ID is required"),
  containerId: z
    .string()
    .min(1, "Container ID is required")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, "Invalid container ID"),
  command: z.enum(["start", "stop", "restart", "kill"]),
});

export type ControlContainerInput = z.infer<typeof ControlContainerInputSchema>;

export class ControlContainerUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly dockerService: DockerService,
  ) {}

  async execute(input: ControlContainerInput): Promise<Resource> {
    return this.uow.transaction(async (tx) => {
      const resource = await tx.resourceRepository.findById(input.resourceId);
      if (!resource) throw new ValidationError("Resource not found");

      await this.dockerService.controlContainer(
        resource,
        input.containerId,
        input.command,
      );

      const containers = await this.dockerService.getContainers(resource);
      const updated = await tx.resourceRepository.updateById(resource.id, {
        containers: JSON.stringify(containers),
      });
      if (!updated) throw new ValidationError("Resource could not be updated");
      return updated;
    });
  }
}
