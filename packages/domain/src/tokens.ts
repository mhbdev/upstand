import { createToken } from "@circulo-ai/di";
import type { IProjectRepository } from "./repositories/project-repository.interface";
import type { IUnitOfWork } from "./repositories/unit-of-work.interface";
import type { IUserRepository } from "./repositories/user-repository.interface";

export const UserRepositoryToken =
  createToken<IUserRepository>("IUserRepository");
export const UnitOfWorkToken = createToken<IUnitOfWork>("IUnitOfWork");
export const ProjectRepositoryToken =
  createToken<IProjectRepository>("IProjectRepository");
