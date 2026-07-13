import { describe, expect, test } from "bun:test";
import type {
  IEnvironmentRepository,
  IProjectRepository,
  IUnitOfWork,
} from "@upstand/domain";
import { CreateProjectUseCase } from "./create-project.usecase";

class MockEnvironmentRepository implements IEnvironmentRepository {
  public created: Array<Record<string, unknown>> = [];

  async findById() {
    return null;
  }

  async findByProjectId() {
    return [];
  }

  async create(data: any) {
    this.created.push(data);
    return { ...data, createdAt: new Date(), updatedAt: new Date() };
  }

  async findMany() {
    return [];
  }

  async createMany() {
    return [];
  }

  async updateById() {
    return null;
  }

  async deleteById() {
    return false;
  }

  async count() {
    return 0;
  }
}

class MockProjectRepository implements IProjectRepository {
  public created: Array<Record<string, unknown>> = [];

  async findById() {
    return null;
  }

  async findMany() {
    return [];
  }

  async delete(_id: string) {
    return null;
  }

  async create(data: any) {
    this.created.push(data);
    return { ...data, createdAt: new Date(), updatedAt: new Date() };
  }

  async findByOrganizationId() {
    return [];
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public readonly auditLogRepository = {} as any;
  public readonly backupScheduleRepository = {} as any;
  public readonly backupRunRepository = {} as any;
  public readonly projectRepository = new MockProjectRepository();
  public readonly environmentRepository = new MockEnvironmentRepository();
  public readonly resourceRepository = {} as any;
  public readonly userRepository = {
    findById: async () => null,
    findByEmail: async () => null,
    create: async (data: any) => ({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as any;
  public readonly sshKeyRepository = {} as any;
  public readonly gitProviderRepository = {} as any;
  public readonly webServerSettingsRepository = {} as any;
  public readonly s3DestinationRepository = {} as any;
  public readonly serverBuildSettingsRepository = {} as any;
  public readonly deploymentRepository = {} as any;
  public readonly dockerRegistryRepository = {} as any;
  public readonly serverRepository = {} as any;
  public readonly serverLogRepository = {} as any;
  public readonly serverMetricRepository = {} as any;
  public readonly notificationChannelRepository = {} as any;
  public readonly notificationDeliveryRepository = {} as any;

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this as any);
  }
}

describe("CreateProjectUseCase", () => {
  test("creates a protected production environment for a new project", async () => {
    const uow = new MockUnitOfWork();
    const usecase = new CreateProjectUseCase(uow as IUnitOfWork);

    await usecase.execute({ name: "Payments", organizationId: "org-1" });

    expect(uow.projectRepository.created).toHaveLength(1);
    expect(uow.environmentRepository.created).toHaveLength(1);
    expect(uow.environmentRepository.created[0]).toMatchObject({
      name: "production",
      slug: "production",
      isDefault: true,
      isProtected: true,
      resourceCount: 0,
    });
  });
});
