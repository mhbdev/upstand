import type { IUserRepository } from "./user-repository.interface";

export interface IUnitOfWork {
  userRepository: IUserRepository;
  transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T>;
}
