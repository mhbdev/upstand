import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { log } from "evlog";
import { z } from "zod";
import type { CaddyService } from "../web-server/caddy.service";
import type { DockerService } from "./docker.service";

export const DeleteResourceInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  deleteVolumes: z.boolean().optional(),
});

export type DeleteResourceInput = z.infer<typeof DeleteResourceInputSchema>;

export class DeleteResourceUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly caddyService: CaddyService,
    private readonly dockerService: DockerService,
  ) {}

  async execute(input: DeleteResourceInput): Promise<boolean> {
    const resource = await this.uow.resourceRepository.findById(input.id);
    if (!resource) {
      throw new ValidationError("Resource not found");
    }

    const resources = await this.uow.resourceRepository.findMany();
    const remainingResources = resources.filter(
      (item) => item.id !== resource.id,
    );
    const settings = await this.uow.webServerSettingsRepository.findGlobal();

    await this.caddyService.syncResourceConfigs(
      remainingResources,
      settings || {},
    );
    try {
      await this.dockerService.removeResource(resource, !!input.deleteVolumes);
      return await this.uow.transaction(async (tx) => {
        const environment = await tx.environmentRepository.findById(
          resource.environmentId,
        );
        if (environment) {
          await tx.environmentRepository.updateById(resource.environmentId, {
            resourceCount: Math.max(0, environment.resourceCount - 1),
          });
        }
        return tx.resourceRepository.deleteById(input.id);
      });
    } catch (error) {
      try {
        await this.caddyService.syncResourceConfigs(resources, settings || {});
      } catch (rollbackError) {
        log.error({
          message: "Failed to restore Caddy after resource deletion rollback",
          err:
            rollbackError instanceof Error
              ? rollbackError.message
              : rollbackError,
        });
      }
      throw error;
    }
  }
}
