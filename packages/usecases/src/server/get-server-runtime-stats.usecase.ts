import { type IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import type {
  DockerService,
  ServerRuntimeStats,
} from "../resource/docker.service";
import { resolveDockerServiceForServer } from "../resource/docker-client";

export const GetServerRuntimeStatsInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  serverId: z.string().min(1).optional(),
});

export type GetServerRuntimeStatsInput = z.infer<
  typeof GetServerRuntimeStatsInputSchema
>;

export class GetServerRuntimeStatsUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly dockerService: DockerService,
  ) {}

  async execute(
    input: GetServerRuntimeStatsInput,
  ): Promise<ServerRuntimeStats> {
    const { dockerService, cleanup } = await resolveDockerServiceForServer(
      input.serverId,
      this.uow,
      this.dockerService,
    );
    try {
      return await dockerService.getServerRuntimeStats();
    } finally {
      cleanup();
    }
  }
}
