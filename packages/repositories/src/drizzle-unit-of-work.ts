import type { IUnitOfWork } from "@upstand/domain";
import { DrizzleProjectRepository } from "./project/drizzle-project.repository";
import type { Executor } from "./shared/types";
import { DrizzleUserRepository } from "./user/drizzle-user.repository";

export class DrizzleUnitOfWork implements IUnitOfWork {
  public readonly userRepository: DrizzleUserRepository;
  public readonly projectRepository: DrizzleProjectRepository;

  constructor(private readonly executor: Executor) {
    this.userRepository = new DrizzleUserRepository(this.executor);
    this.projectRepository = new DrizzleProjectRepository(this.executor);
  }

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return this.executor.transaction(async (tx) => {
      const txUow = new DrizzleUnitOfWork(tx);
      return work(txUow);
    });
  }
}
