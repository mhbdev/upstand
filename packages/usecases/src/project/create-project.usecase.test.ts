import { describe, expect, test } from "bun:test";
import type {
  IEnvironmentRepository,
  IProjectRepository,
} from "@upstand/domain";
import { mockUnitOfWork } from "../testing/mock-unit-of-work";
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

  async updateEnvironment() {
    return null;
  }

  async incrementResourceCount() {}

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

describe("CreateProjectUseCase", () => {
  test("creates a protected production environment for a new project", async () => {
    const uow = mockUnitOfWork({
      projectRepository: new MockProjectRepository(),
      environmentRepository: new MockEnvironmentRepository(),
      userRepository: {
        findById: async () => null,
        findByEmail: async () => null,
        create: async (data: any) => ({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as any,
    });
    const usecase = new CreateProjectUseCase(uow);

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
