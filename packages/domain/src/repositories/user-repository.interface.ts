import type { CreateUserDTO, User } from "../entities/user";

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  create(data: CreateUserDTO): Promise<User>;
}
