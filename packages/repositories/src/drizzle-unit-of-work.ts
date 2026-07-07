import type { IUnitOfWork } from "@upstand/domain";
import type { Executor } from "./shared/types";
import { DrizzleUserRepository } from "./user/drizzle-user.repository";

export class DrizzleUnitOfWork implements IUnitOfWork {
  public readonly userRepository: DrizzleUserRepository;

  constructor(private readonly executor: Executor) {
    this.userRepository = new DrizzleUserRepository(this.executor);
  }

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return this.executor.transaction(async (tx) => {
      const txUow = new DrizzleUnitOfWork(tx);
      return work(txUow);
    });
  }
}
