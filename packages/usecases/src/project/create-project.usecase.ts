import type { IUnitOfWork, Project } from "@upstand/domain";
import { z } from "zod";

export const CreateProjectInputSchema = z.object({
  // TODO: add input fields,
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export class CreateProjectUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(_input: CreateProjectInput): Promise<Project> {
    return this.uow.transaction(async (_tx) => {
      // TODO: implement — use _tx.projectRepository
      throw new Error("Not implemented yet");
    });
  }
}
