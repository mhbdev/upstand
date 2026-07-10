import type { IUnitOfWork, Project } from "@upstand/domain";
import { z } from "zod";

export const GetProjectInputSchema = z.object({
  id: z.string(),
});

export type GetProjectInput = z.infer<typeof GetProjectInputSchema>;

export class GetProjectUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: GetProjectInput): Promise<Project | null> {
    return this.uow.transaction(async (tx) => {
      return await tx.projectRepository.findById(input.id);
    });
  }
}
