import { type IUnitOfWork } from "@upstand/domain";
import { z } from "zod";

export const DeleteServerInputSchema = z.object({
  id: z.string().min(1, "Server ID is required"),
});

export type DeleteServerInput = z.infer<typeof DeleteServerInputSchema>;

export class DeleteServerUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: DeleteServerInput): Promise<boolean> {
    return this.uow.transaction(async (tx) => {
      return tx.serverRepository.deleteById(input.id);
    });
  }
}
