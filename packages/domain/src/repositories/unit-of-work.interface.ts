import type { IProjectRepository } from "./project-repository.interface";
import type { IUserRepository } from "./user-repository.interface";

export interface IUnitOfWork {
  userRepository: IUserRepository;
  projectRepository: IProjectRepository;
  transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;
}
