import type { IUnitOfWork, User } from "@upstand/domain";
import { z } from "zod";

export const CreateUserInputSchema = z.object({});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export class CreateUserUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(_input: CreateUserInput): Promise<User> {
    return this.uow.transaction(async (_tx) => {
      throw new Error("Not implemented yet");
    });
  }
}
