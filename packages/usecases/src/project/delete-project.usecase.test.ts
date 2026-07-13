import { describe, expect, test } from "bun:test";
import { type IUnitOfWork, ValidationError } from "@upstand/domain";
import { DeleteProjectUseCase } from "./delete-project.usecase";

class MockEnvironmentRepository {
  public store: any[] = [];

  async findByProjectId(projectId: string) {
    return this.store.filter((e) => e.projectId === projectId);
  }
}

class MockProjectRepository {
  public deletedId: string | null = null;

  async delete(id: string) {
    this.deletedId = id;
    return {
      id,
      name: "Deleted Project",
      organizationId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

class MockUnitOfWork implements IUnitOfWork {
  public readonly auditLogRepository = {} as any;
  public readonly backupScheduleRepository = {} as any;
  public readonly backupRunRepository = {} as any;
  public readonly environmentRepository =
    new MockEnvironmentRepository() as any;
  public readonly projectRepository = new MockProjectRepository() as any;
  public readonly userRepository = {} as any;
  public readonly resourceRepository = {} as any;
  public readonly sshKeyRepository = {} as any;
  public readonly webServerSettingsRepository = {} as any;
  public readonly s3DestinationRepository = {} as any;
  public readonly serverBuildSettingsRepository = {} as any;
  public readonly deploymentRepository = {} as any;
  public readonly gitProviderRepository = {} as any;
  public readonly dockerRegistryRepository = {} as any;
  public readonly serverRepository = {} as any;
  public readonly domainRepository = {} as any;
  public readonly domainRecordRepository = {} as any;
  public readonly databaseRepository = {} as any;
  public readonly notificationChannelRepository = {} as any;
  public readonly notificationDeliveryRepository = {} as any;
  public readonly monitoringSettingsRepository = {} as any;
  public readonly previewDeploymentRepository = {} as any;
  public readonly scheduleRepository = {} as any;

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this as any);
  }
}

describe("DeleteProjectUseCase", () => {
  test("prevents deletion of project when resources exist in any environment", async () => {
    const uow = new MockUnitOfWork();
    const usecase = new DeleteProjectUseCase(uow as IUnitOfWork);

    // Seed mock environment with resources
    uow.environmentRepository.store.push({
      id: "env-1",
      projectId: "project-1",
      name: "production",
      resourceCount: 1,
    });

    expect(
      usecase.execute({ id: "project-1", organizationId: "org-1" }),
    ).rejects.toThrow(ValidationError);
    expect(uow.projectRepository.deletedId).toBeNull();
  });

  test("deletes project successfully when all environments are empty of resources", async () => {
    const uow = new MockUnitOfWork();
    const usecase = new DeleteProjectUseCase(uow as IUnitOfWork);

    // Seed empty mock environment
    uow.environmentRepository.store.push({
      id: "env-1",
      projectId: "project-1",
      name: "production",
      resourceCount: 0,
    });

    const project = await usecase.execute({
      id: "project-1",
      organizationId: "org-1",
    });
    expect(project?.id).toBe("project-1");
    expect(uow.projectRepository.deletedId).toBe("project-1");
  });
});
