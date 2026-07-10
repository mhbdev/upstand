import { randomUUID } from "node:crypto";
import type { Environment, IUnitOfWork } from "@upstand/domain";
import { z } from "zod";

export const CreateEnvironmentInputSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().min(1, "Environment name is required"),
  description: z.string().optional(),
});

export type CreateEnvironmentInput = z.infer<
  typeof CreateEnvironmentInputSchema
>;

export class CreateEnvironmentUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: CreateEnvironmentInput): Promise<Environment> {
    return this.uow.transaction(async (tx) => {
      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      return await tx.environmentRepository.create({
        id: randomUUID(),
        projectId: input.projectId,
        name: input.name,
        slug: slug || "env",
        description: input.description ?? null,
        isDefault: false,
        isProtected: false,
        resourceCount: 0,
      });
    });
  }
}
