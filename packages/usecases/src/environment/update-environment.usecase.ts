import type { Environment, IUnitOfWork } from "@upstand/domain";
import { ValidationError } from "@upstand/domain";
import { z } from "zod";
import { serializeResourceEnvironmentVariables } from "../resource/resource-environment";

export const UpdateEnvironmentInputSchema = z.object({
  id: z.string().min(1, "Environment ID is required"),
  name: z.string().min(1, "Name must not be empty").max(255).optional(),
  description: z.string().max(1024).nullable().optional(),
  /**
   * Plain key/value map of project-level environment variables.
   * The use case encrypts and serialises the map before persisting.
   */
  envVars: z
    .record(z.string().trim().min(1).max(256), z.string().max(16_384))
    .optional(),
});

export type UpdateEnvironmentInput = z.infer<
  typeof UpdateEnvironmentInputSchema
>;

export class UpdateEnvironmentUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: UpdateEnvironmentInput): Promise<Environment> {
    return this.uow.transaction(async (tx) => {
      const existing = await tx.environmentRepository.findById(input.id);
      if (!existing) {
        throw new ValidationError("Environment not found.");
      }

      const patch: Parameters<
        typeof tx.environmentRepository.updateEnvironment
      >[1] = {};

      if (input.name !== undefined) {
        patch.name = input.name;
      }
      if (input.description !== undefined) {
        patch.description = input.description;
      }
      if (input.envVars !== undefined) {
        patch.envVars = serializeResourceEnvironmentVariables(input.envVars);
      }

      const updated = await tx.environmentRepository.updateEnvironment(
        input.id,
        patch,
      );

      if (!updated) {
        throw new ValidationError("Environment not found after update.");
      }

      return updated;
    });
  }
}
