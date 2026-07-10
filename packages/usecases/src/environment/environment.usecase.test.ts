import { describe, expect, test } from "bun:test";
import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { CreateEnvironmentUseCase } from "./create-environment.usecase";
import { DeleteEnvironmentUseCase } from "./delete-environment.usecase";

class MockEnvironmentRepository {
  public store: any[] = [];

  async findById(id: string) {
    return this.store.find((e) => e.id === id) || null;
  }

  async findByProjectId(projectId: string) {
    return this.store.filter((e) => e.projectId === projectId);
  }

  async create(data: any) {
    const item = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.push(item);
    return item;
  }

  async deleteById(id: string) {
    const index = this.store.findIndex((e) => e.id === id);
    if (index > -1) {
      this.store.splice(index, 1);
      return true;
    }
    return false;
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public readonly backupScheduleRepository = {} as any;
  public readonly backupRunRepository = {} as any;
  public readonly environmentRepository =
    new MockEnvironmentRepository() as any;
  public readonly projectRepository = {} as any;
  public readonly userRepository = {} as any;
  public readonly resourceRepository = {} as any;
  public readonly sshKeyRepository = {} as any;
  public readonly gitProviderRepository = {} as any;
  public readonly webServerSettingsRepository = {} as any;
  public readonly s3DestinationRepository = {} as any;
  public readonly serverBuildSettingsRepository = {} as any;
  public readonly deploymentRepository = {} as any;
  public readonly dockerRegistryRepository = {} as any;
  public readonly serverRepository = {} as any;
  public readonly notificationChannelRepository = {} as any;
  public readonly notificationDeliveryRepository = {} as any;

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this);
  }
}

describe("Environment Usecases", () => {
  test("creates a new environment with a slugified name", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateEnvironmentUseCase(uow as IUnitOfWork);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Staging Env",
      description: "Temp test environment",
    });

    expect(env.name).toBe("Staging Env");
    expect(env.slug).toBe("staging-env");
    expect(env.isDefault).toBe(false);
    expect(env.isProtected).toBe(false);
  });

  test("prevents deletion of default production environment", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateEnvironmentUseCase(uow as IUnitOfWork);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow as IUnitOfWork);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "production",
    });

    // Manually mark it default
    uow.environmentRepository.store[0].isDefault = true;

    expect(deleteUseCase.execute({ id: env.id })).rejects.toThrow(
      ValidationError,
    );
  });

  test("prevents deletion when environment contains resources", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateEnvironmentUseCase(uow as IUnitOfWork);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow as IUnitOfWork);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Development",
    });

    // Manually update resourceCount
    uow.environmentRepository.store[0].resourceCount = 1;

    expect(deleteUseCase.execute({ id: env.id })).rejects.toThrow(
      ValidationError,
    );
  });

  test("deletes empty, non-default environment successfully", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateEnvironmentUseCase(uow as IUnitOfWork);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow as IUnitOfWork);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Staging",
    });

    const success = await deleteUseCase.execute({ id: env.id });
    expect(success).toBe(true);
    expect(uow.environmentRepository.store).toHaveLength(0);
  });
});
