import { createToken, ServiceCollection } from "@circulo-ai/di";
import { type DatabaseExecutor, db } from "@upstand/db";
import {
  ProjectRepositoryToken,
  UnitOfWorkToken,
  UserRepositoryToken,
} from "@upstand/domain";
import {
  DrizzleProjectRepository,
  DrizzleUnitOfWork,
  DrizzleUserRepository,
} from "@upstand/repositories";
import { CreateProjectUseCase, CreateUserUseCase } from "@upstand/usecases";

export const DbToken = createToken<DatabaseExecutor>("DatabaseExecutor");
export const CreateUserUseCaseToken =
  createToken<CreateUserUseCase>("CreateUserUseCase");
export const services = new ServiceCollection();

// 1. Database Infrastructure
services.addSingleton(DbToken, () => db);

// 2. Repositories (scoped per request)
services.addScoped(UserRepositoryToken, (c) => {
  const executor = c.resolve(DbToken);
  return new DrizzleUserRepository(executor);
});
export const CreateProjectUseCaseToken = createToken<CreateProjectUseCase>(
  "CreateProjectUseCase",
);
services.addScoped(
  ProjectRepositoryToken,
  (c) => new DrizzleProjectRepository(c.resolve(DbToken)),
);
services.addTransient(
  CreateProjectUseCaseToken,
  (c) => new CreateProjectUseCase(c.resolve(UnitOfWorkToken)),
);
// 3. Unit of Work (scoped per request)
services.addScoped(UnitOfWorkToken, (c) => {
  const executor = c.resolve(DbToken);
  return new DrizzleUnitOfWork(executor);
});

// 4. Use Cases (transient)
services.addTransient(CreateUserUseCaseToken, (c) => {
  const uow = c.resolve(UnitOfWorkToken);
  return new CreateUserUseCase(uow);
});
export const serviceProvider = services.build();
export type ServiceProvider = typeof serviceProvider;
