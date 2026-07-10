import { type IUnitOfWork } from "@upstand/domain";
import { z } from "zod";

export const DeleteDockerRegistryInputSchema = z.object({
  id: z.string().min(1, "Registry ID is required"),
});

export type DeleteDockerRegistryInput = z.infer<typeof DeleteDockerRegistryInputSchema>;

export class DeleteDockerRegistryUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: DeleteDockerRegistryInput): Promise<boolean> {
    return this.uow.transaction(async (tx) => {
      return tx.dockerRegistryRepository.deleteById(input.id);
    });
  }
}
