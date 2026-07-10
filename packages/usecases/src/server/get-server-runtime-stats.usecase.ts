import { z } from "zod";
import type {
  DockerService,
  ServerRuntimeStats,
} from "../resource/docker.service";

export const GetServerRuntimeStatsInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export type GetServerRuntimeStatsInput = z.infer<
  typeof GetServerRuntimeStatsInputSchema
>;

export class GetServerRuntimeStatsUseCase {
  constructor(private readonly dockerService: DockerService) {}

  async execute(
    _input: GetServerRuntimeStatsInput,
  ): Promise<ServerRuntimeStats> {
    return this.dockerService.getServerRuntimeStats();
  }
}
