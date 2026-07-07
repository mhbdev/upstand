import { ConflictError, type IUnitOfWork, type User } from "@upstand/domain";
import { z } from "zod";

export const CreateUserInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  image: z.string().url("Invalid image URL").nullable().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export class CreateUserUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: CreateUserInput): Promise<User> {
    return this.uow.transaction(async (tx) => {
      // 1. Check if user already exists
      const existing = await tx.userRepository.findByEmail(input.email);
      if (existing) {
        throw new ConflictError(
          `User with email '${input.email}' already exists`,
        );
      }

      // 2. Create the user
      return await tx.userRepository.create({
        name: input.name,
        email: input.email,
        image: input.image ?? null,
        emailVerified: false,
      });
    });
  }
}
