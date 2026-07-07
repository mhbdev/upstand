import { z } from "zod";

export const UserSchema = z.object({
  id: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export interface CreateUserDTO {
  id?: string;
}
