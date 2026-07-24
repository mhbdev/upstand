import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import type { DockerPrunePort } from "../ports/docker";
import { resolveDockerInspectionTarget } from "./docker-inspection-target.helper";

export const PruneDockerResourcesInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  type: z.enum(["images", "volumes", "containers", "builder", "system", "all"]),
});

export class PruneDockerResourcesUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerPrunePort,
  ) {}

  async execute(input: z.infer<typeof PruneDockerResourcesInputSchema>) {
    const target = await resolveDockerInspectionTarget(this.uow, input);
    return this.docker.prune(target, input.type);
  }
}
